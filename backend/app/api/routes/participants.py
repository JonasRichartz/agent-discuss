"""Discussion participant management endpoints."""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from uuid import UUID

from app.api.deps import CurrentUser
from app.services.supabase import get_supabase_client_with_auth

router = APIRouter()

# Statuses where participants can be added/edited/removed
EDITABLE_STATUSES = {"draft", "completed", "failed"}


class ParticipantCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: str
    system_prompt: str
    provider_id: str
    model_name: str
    temperature: float = 0.7
    max_tokens: int = 1024
    avatar_color: str = "#6366f1"
    avatar_emoji: str = "🤖"
    role: str | None = None


class ParticipantUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: str | None = None
    system_prompt: str | None = None
    provider_id: str | None = None
    model_name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    avatar_color: str | None = None
    avatar_emoji: str | None = None
    role: str | None = None


@router.get("/{discussion_id}/participants")
async def list_participants(current_user: CurrentUser, discussion_id: UUID):
    """List participants for a discussion."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify ownership
    discussion = supabase.table("discussions").select("id").eq(
        "id", str(discussion_id)
    ).eq("user_id", current_user["id"]).maybe_single().execute()

    if not discussion or not discussion.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discussion not found"
        )

    result = supabase.table("discussion_participants").select(
        "*, llm_providers(name)"
    ).eq("discussion_id", str(discussion_id)).order("order_index").execute()

    return result.data


@router.post("/{discussion_id}/participants")
async def create_participant(
    current_user: CurrentUser,
    discussion_id: UUID,
    participant: ParticipantCreate,
):
    """Create a participant for discussion."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify discussion ownership and draft status
    discussion = supabase.table("discussions").select("status").eq(
        "id", str(discussion_id)
    ).eq("user_id", current_user["id"]).maybe_single().execute()

    if not discussion or not discussion.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discussion not found"
        )

    if discussion.data["status"] not in EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify participants while discussion is running or paused",
        )

    # Get next order_index
    existing = supabase.table("discussion_participants").select("order_index").eq(
        "discussion_id", str(discussion_id)
    ).order("order_index", desc=True).limit(1).execute()

    next_order = (existing.data[0]["order_index"] + 1) if existing.data else 0

    result = supabase.table("discussion_participants").insert({
        "discussion_id": str(discussion_id),
        "order_index": next_order,
        **participant.model_dump(),
    }).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create participant")
    return result.data[0]


@router.patch("/{discussion_id}/participants/{participant_id}")
async def update_participant(
    current_user: CurrentUser,
    discussion_id: UUID,
    participant_id: UUID,
    participant: ParticipantUpdate,
):
    """Update a participant."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify discussion ownership and draft status
    discussion = supabase.table("discussions").select("status").eq(
        "id", str(discussion_id)
    ).eq("user_id", current_user["id"]).maybe_single().execute()

    if not discussion or not discussion.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discussion not found"
        )

    if discussion.data["status"] not in EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify participants while discussion is running or paused",
        )

    # Verify participant exists in this discussion
    existing = supabase.table("discussion_participants").select("id").eq(
        "id", str(participant_id)
    ).eq("discussion_id", str(discussion_id)).maybe_single().execute()

    if not existing or not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found"
        )

    update_data = participant.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    result = supabase.table("discussion_participants").update(update_data).eq(
        "id", str(participant_id)
    ).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update participant")
    return result.data[0]


@router.delete("/{discussion_id}/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_participant(
    current_user: CurrentUser,
    discussion_id: UUID,
    participant_id: UUID,
):
    """Delete a participant."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify discussion ownership and draft status
    discussion = supabase.table("discussions").select("status").eq(
        "id", str(discussion_id)
    ).eq("user_id", current_user["id"]).maybe_single().execute()

    if not discussion or not discussion.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discussion not found"
        )

    if discussion.data["status"] not in EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify participants while discussion is running or paused",
        )

    supabase.table("discussion_participants").delete().eq(
        "id", str(participant_id)
    ).eq("discussion_id", str(discussion_id)).execute()


@router.post("/{discussion_id}/participants/from-template/{agent_id}")
async def create_from_template(
    current_user: CurrentUser,
    discussion_id: UUID,
    agent_id: UUID,
):
    """Create participant from agent template."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify discussion ownership and draft status
    discussion = supabase.table("discussions").select("status").eq(
        "id", str(discussion_id)
    ).eq("user_id", current_user["id"]).maybe_single().execute()

    if not discussion or not discussion.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discussion not found"
        )

    if discussion.data["status"] not in EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify participants while discussion is running or paused",
        )

    # Load agent template
    agent = supabase.table("agents").select("*").eq(
        "id", str(agent_id)
    ).eq("user_id", current_user["id"]).maybe_single().execute()

    if not agent or not agent.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent template not found"
        )

    if not agent.data.get("llm_provider_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent has no LLM provider configured. Edit the agent in Settings → Agents.",
        )

    if not agent.data.get("model_name"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent has no model selected. Edit the agent in Settings → Agents.",
        )

    # Get next order_index
    existing = supabase.table("discussion_participants").select("order_index").eq(
        "discussion_id", str(discussion_id)
    ).order("order_index", desc=True).limit(1).execute()

    next_order = (existing.data[0]["order_index"] + 1) if existing.data else 0

    # Create participant from template
    participant_data = {
        "discussion_id": str(discussion_id),
        "name": agent.data["name"],
        "system_prompt": agent.data["system_prompt"],
        "provider_id": agent.data["llm_provider_id"],
        "model_name": agent.data["model_name"],
        "temperature": agent.data.get("temperature", 0.7),
        "max_tokens": agent.data.get("max_tokens", 1024),
        "avatar_color": agent.data.get("avatar_color", "#6366f1"),
        "avatar_emoji": agent.data.get("avatar_emoji", "🤖"),
        "order_index": next_order,
    }

    result = supabase.table("discussion_participants").insert(participant_data).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create participant from template")
    return result.data[0]
