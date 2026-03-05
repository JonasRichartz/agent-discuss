import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from uuid import UUID
from enum import Enum

from app.api.deps import CurrentUser
from app.services.supabase import get_supabase_client_with_auth, get_supabase_service_client

router = APIRouter()


# Helper functions

async def verify_discussion_ownership(
    supabase,
    discussion_id: UUID | str,
    user_id: str,
    fields: str = "id",
) -> dict:
    """
    Verify user owns a discussion and return requested fields.

    Args:
        supabase: Supabase client with user auth
        discussion_id: UUID of the discussion
        user_id: User ID from current_user
        fields: Comma-separated fields to select (default: "id")

    Returns:
        dict: Discussion data with requested fields

    Raises:
        HTTPException: 404 if discussion not found or not owned by user
    """
    response = supabase.table("discussions").select(fields).eq(
        "id", str(discussion_id)
    ).eq("user_id", user_id).maybe_single().execute()

    if not response or not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discussion not found"
        )

    return response.data


class DiscussionStatus(str, Enum):
    draft = "draft"
    running = "running"
    paused = "paused"
    completed = "completed"
    failed = "failed"


class DiscussionCreate(BaseModel):
    title: str
    topic: str
    description: str | None = None
    graph_definition: dict
    web_search_enabled: bool = False


class DiscussionUpdate(BaseModel):
    title: str | None = None
    topic: str | None = None
    description: str | None = None
    graph_definition: dict | None = None
    web_search_enabled: bool | None = None


class DiscussionResponse(BaseModel):
    id: str
    title: str
    topic: str
    description: str | None
    status: str
    graph_definition: dict
    web_search_enabled: bool = False
    created_at: str


class DiscussionDetailResponse(DiscussionResponse):
    execution_state: dict | None
    context_summary: str | None
    started_at: str | None
    completed_at: str | None


@router.get("", response_model=list[DiscussionResponse])
async def list_discussions(current_user: CurrentUser):
    """List user's discussions."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("discussions").select(
        "id, title, topic, description, status, graph_definition, web_search_enabled, created_at"
    ).eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return response.data


@router.post("", response_model=DiscussionResponse, status_code=status.HTTP_201_CREATED)
async def create_discussion(current_user: CurrentUser, request: DiscussionCreate):
    """Create a new discussion."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Create discussion
    data = {
        "user_id": current_user["id"],
        "title": request.title,
        "topic": request.topic,
        "description": request.description,
        "graph_definition": request.graph_definition,
        "web_search_enabled": request.web_search_enabled,
        "status": "draft",
    }

    response = supabase.table("discussions").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create discussion")
    discussion = response.data[0]

    # Note: Participants are now added via the /participants endpoint after creation
    return discussion


@router.get("/{discussion_id}", response_model=DiscussionDetailResponse)
async def get_discussion(current_user: CurrentUser, discussion_id: UUID):
    """Get a specific discussion."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    return await verify_discussion_ownership(
        supabase, discussion_id, current_user["id"], fields="*"
    )


@router.patch("/{discussion_id}", response_model=DiscussionResponse)
async def update_discussion(current_user: CurrentUser, discussion_id: UUID, request: DiscussionUpdate):
    """Update a discussion (only in draft status)."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Check if discussion is in draft status
    existing = await verify_discussion_ownership(
        supabase, discussion_id, current_user["id"], fields="status"
    )

    if existing["status"] in ("running", "paused"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update discussion while it is {existing['status']}",
        )

    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    # Prevent status changes via PATCH
    if "status" in update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change status via update. Use /start, /pause, /stop endpoints",
        )

    response = supabase.table("discussions").update(update_data).eq("id", str(discussion_id)).execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update discussion")
    return response.data[0]


@router.delete("/{discussion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discussion(current_user: CurrentUser, discussion_id: UUID):
    """Delete a discussion."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Check if running - stop it first
    existing = await verify_discussion_ownership(
        supabase, discussion_id, current_user["id"], fields="status"
    )

    if existing["status"] == "running":
        from app.tasks.discussion import stop_discussion
        stop_discussion.delay(str(discussion_id))
        # Give it a moment to stop
        await asyncio.sleep(0.5)

    # Delete (cascades handled by DB)
    supabase.table("discussions").delete().eq(
        "id", str(discussion_id)
    ).eq("user_id", current_user["id"]).execute()


# Lifecycle endpoints

@router.post("/{discussion_id}/start")
async def start_discussion(current_user: CurrentUser, discussion_id: UUID):
    """Start, resume, or restart a discussion."""
    from app.tasks.discussion import run_discussion, resume_discussion as resume_task

    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Check status
    existing = await verify_discussion_ownership(
        supabase, discussion_id, current_user["id"], fields="status"
    )

    current_status = existing["status"]
    if current_status not in ["draft", "paused", "completed", "failed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start discussion in {current_status} status",
        )

    is_restart = current_status in ["completed", "failed"]

    if is_restart:
        # Clear old messages so the conversation starts fresh
        # Use service client because messages table has no DELETE RLS policy
        service_client = get_supabase_service_client()
        service_client.table("messages").delete().eq(
            "discussion_id", str(discussion_id)
        ).execute()

    # Update status to running and reset execution state on restart
    update_data = {
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    if is_restart:
        update_data["execution_state"] = None
        update_data["context_summary"] = None
        update_data["completed_at"] = None

    supabase.table("discussions").update(update_data).eq(
        "id", str(discussion_id)
    ).execute()

    # Trigger Celery task
    if current_status == "paused":
        task = resume_task.delay(str(discussion_id), current_user["id"])
    else:
        task = run_discussion.delay(str(discussion_id), current_user["id"])

    return {"status": "restarted" if is_restart else "started", "discussion_id": str(discussion_id), "task_id": task.id}


@router.post("/{discussion_id}/pause")
async def pause_discussion_endpoint(current_user: CurrentUser, discussion_id: UUID):
    """Pause a running discussion."""
    from app.tasks.discussion import pause_discussion

    supabase = get_supabase_client_with_auth(current_user["access_token"])

    existing = await verify_discussion_ownership(
        supabase, discussion_id, current_user["id"], fields="status"
    )

    if existing["status"] != "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only pause running discussions",
        )

    # Signal the running task to pause
    pause_discussion.delay(str(discussion_id))

    # Note: Status will be updated by the Celery task when it pauses
    return {"status": "pause_signaled", "discussion_id": str(discussion_id)}


@router.post("/{discussion_id}/stop")
async def stop_discussion_endpoint(current_user: CurrentUser, discussion_id: UUID):
    """Stop a discussion."""
    from app.tasks.discussion import stop_discussion

    supabase = get_supabase_client_with_auth(current_user["access_token"])

    existing = await verify_discussion_ownership(
        supabase, discussion_id, current_user["id"], fields="status"
    )

    current_status = existing["status"]
    if current_status not in ["running", "paused"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only stop running or paused discussions",
        )

    if current_status == "running":
        # Signal the running task to stop
        stop_discussion.delay(str(discussion_id))
        return {"status": "stop_signaled", "discussion_id": str(discussion_id)}
    else:
        # Already paused, just mark as completed
        supabase.table("discussions").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(discussion_id)).execute()
        return {"status": "stopped", "discussion_id": str(discussion_id)}


@router.post("/{discussion_id}/reset")
async def reset_discussion(current_user: CurrentUser, discussion_id: UUID):
    """Reset a discussion: delete all messages and return to draft status."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    existing = await verify_discussion_ownership(
        supabase, discussion_id, current_user["id"], fields="status"
    )

    if existing["status"] == "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reset a running discussion. Stop it first.",
        )

    # Delete all messages (service client — messages table may lack DELETE RLS)
    service_client = get_supabase_service_client()
    service_client.table("messages").delete().eq(
        "discussion_id", str(discussion_id)
    ).execute()

    # Reset discussion to draft
    supabase.table("discussions").update({
        "status": "draft",
        "execution_state": None,
        "context_summary": None,
        "started_at": None,
        "completed_at": None,
    }).eq("id", str(discussion_id)).execute()

    return {"status": "reset", "discussion_id": str(discussion_id)}


# Messages

@router.get("/{discussion_id}/messages")
async def list_messages(
    current_user: CurrentUser,
    discussion_id: UUID,
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    """List messages in a discussion (paginated)."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify ownership
    await verify_discussion_ownership(supabase, discussion_id, current_user["id"])

    # Count total messages
    count_response = supabase.table("messages").select("id", count="exact").eq(
        "discussion_id", str(discussion_id)
    ).execute()
    total = count_response.count or 0

    # Note: agent_id in messages may reference either agents or discussion_participants
    # depending on when the message was created. The frontend handles participant
    # data separately via the participants endpoint.
    response = supabase.table("messages").select(
        "id, discussion_id, agent_id, content, message_type, sequence_number, created_at, metadata"
    ).eq("discussion_id", str(discussion_id)).order(
        "sequence_number"
    ).range(offset, offset + limit - 1).execute()

    return {
        "messages": response.data,
        "total": total,
        "has_more": (offset + limit) < total,
    }


@router.get("/{discussion_id}/messages/since")
async def get_messages_since(
    current_user: CurrentUser,
    discussion_id: UUID,
    since_sequence: int | None = Query(default=None, ge=0),
    since: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=1000),
):
    """Get messages after a specific sequence number (or timestamp for backwards compatibility)."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify ownership
    await verify_discussion_ownership(supabase, discussion_id, current_user["id"])

    # Note: agent_id in messages may reference either agents or discussion_participants
    # depending on when the message was created. The frontend handles participant
    # data separately via the participants endpoint.
    query = supabase.table("messages").select(
        "id, discussion_id, agent_id, content, message_type, sequence_number, created_at, metadata"
    ).eq("discussion_id", str(discussion_id))

    if since_sequence is not None:
        query = query.gt("sequence_number", since_sequence)
    elif since is not None:
        query = query.gt("created_at", since)

    response = query.order("sequence_number").limit(limit).execute()

    return response.data
