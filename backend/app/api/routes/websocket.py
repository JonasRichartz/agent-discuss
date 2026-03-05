"""
WebSocket endpoints for real-time discussion updates.

Clients connect to receive live messages, typing indicators,
and status updates as discussions progress.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.config import get_settings
from app.services.websocket_manager import manager
from app.services.supabase import get_supabase_client

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


async def authenticate_websocket(token: str) -> dict | None:
    """Authenticate WebSocket connection using JWT token."""
    try:
        # Use Supabase client to verify the token (handles both HS256 and ES256)
        supabase = get_supabase_client()
        user_response = supabase.auth.get_user(token)

        if not user_response or not user_response.user:
            logger.warning("WebSocket auth failed: user not found")
            return None

        user = user_response.user
        return {
            "id": user.id,
            "email": user.email,
        }
    except Exception as e:
        logger.warning(f"WebSocket auth failed: {e}")
        return None


async def verify_discussion_access(discussion_id: str, user_id: str, token: str) -> bool:
    """Verify user has access to the discussion."""
    try:
        from app.services.supabase import get_supabase_client_with_auth
        supabase = get_supabase_client_with_auth(token)
        result = (
            supabase.table("discussions")
            .select("id")
            .eq("id", discussion_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return result is not None and result.data is not None
    except Exception as e:
        logger.error(f"Error verifying discussion access: {e}")
        return False


@router.websocket("/discussions/{discussion_id}")
async def discussion_websocket(
    websocket: WebSocket,
    discussion_id: str,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time discussion updates.

    Connect with: ws://host/ws/discussions/{id}?token={jwt_token}

    Message types received from server:
    - connected: Connection established
    - message: New agent message
      {type: "message", message: {id, agent_id, agent_name, content, message_type, sequence_number}}
    - typing: Agent typing indicator
      {type: "typing", agent_id, agent_name, is_typing}
    - status: Discussion status change
      {type: "status", status: "running"|"paused"|"completed"|"failed", data?: {...}}
    - error: Error occurred
      {type: "error", message: "..."}

    Message types sent from client:
    - ping: Keep-alive ping
      {type: "ping"}
    - control: Control commands
      {type: "control", action: "pause"|"stop"}
    """
    # Authenticate
    user = await authenticate_websocket(token)
    if not user:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    # Verify user owns this discussion
    has_access = await verify_discussion_access(discussion_id, user["id"], token)
    if not has_access:
        await websocket.close(code=1008, reason="Discussion not found or access denied")
        return

    # Connect and register
    await manager.connect(websocket, discussion_id, user["id"])

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif message_type == "control":
                action = data.get("action")
                await handle_control_command(
                    websocket, discussion_id, user["id"], action
                )

    except WebSocketDisconnect:
        pass  # Normal disconnect, no need to log
    except Exception as e:
        logger.error(f"WebSocket error for discussion={discussion_id}: {e}")
    finally:
        manager.disconnect(websocket, discussion_id)


async def handle_control_command(
    websocket: WebSocket,
    discussion_id: str,
    user_id: str,
    action: str,
):
    """Handle control commands from the client."""
    if action not in ["pause", "stop"]:
        await websocket.send_json({
            "type": "error",
            "message": f"Unknown control action: {action}",
        })
        return

    try:
        if action == "pause":
            from app.tasks.discussion import pause_discussion
            pause_discussion.delay(discussion_id)
            await websocket.send_json({
                "type": "control_ack",
                "action": "pause",
                "status": "signaled",
            })

        elif action == "stop":
            from app.tasks.discussion import stop_discussion
            stop_discussion.delay(discussion_id)
            await websocket.send_json({
                "type": "control_ack",
                "action": "stop",
                "status": "signaled",
            })

    except Exception as e:
        logger.error(f"Error handling control command {action}: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to execute {action}",
        })


@router.websocket("/notifications")
async def notifications_websocket(
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    WebSocket endpoint for user-level notifications.

    Receives notifications about:
    - Discussion completion
    - Discussion failures
    - System alerts

    Connect with: ws://host/ws/notifications?token={jwt_token}
    """
    # Authenticate
    user = await authenticate_websocket(token)
    if not user:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    await websocket.accept()

    # For user notifications, we use a user-specific channel
    user_channel = f"user:{user['id']}:notifications"

    try:
        # Send confirmation
        await websocket.send_json({
            "type": "connected",
            "channel": "notifications",
        })

        # Keep connection alive
        while True:
            try:
                data = await websocket.receive_json()
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Notifications WebSocket error: {e}")
