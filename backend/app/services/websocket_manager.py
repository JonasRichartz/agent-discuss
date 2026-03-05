"""
WebSocket connection manager with Redis pub/sub integration.

Manages WebSocket connections for real-time discussion updates,
subscribing to Redis channels to receive messages from Celery workers.
"""

import asyncio
import json
import logging
from typing import Dict, Set, Callable, Any
from fastapi import WebSocket, WebSocketDisconnect
import redis.asyncio as aioredis

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ConnectionManager:
    """
    Manages WebSocket connections for real-time discussion updates.

    Features:
    - Multiple clients per discussion
    - Redis pub/sub integration for Celery worker messages
    - Automatic reconnection handling
    - Graceful shutdown
    """

    def __init__(self):
        # Map discussion_id -> set of (websocket, user_id)
        self.active_connections: Dict[str, Set[tuple]] = {}
        # Map discussion_id -> asyncio.Task (Redis subscription task)
        self.subscription_tasks: Dict[str, asyncio.Task] = {}
        # Redis client for pub/sub
        self._redis: aioredis.Redis | None = None
        # Pubsub instance
        self._pubsub: aioredis.client.PubSub | None = None

    async def get_redis(self) -> aioredis.Redis:
        """Get or create Redis client."""
        if self._redis is None:
            self._redis = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._redis

    async def connect(self, websocket: WebSocket, discussion_id: str, user_id: str):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()

        if discussion_id not in self.active_connections:
            self.active_connections[discussion_id] = set()
            # Start Redis subscription for this discussion
            await self._start_subscription(discussion_id)

        self.active_connections[discussion_id].add((websocket, user_id))

        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "discussion_id": discussion_id,
        })

        logger.info(f"WebSocket connected: user={user_id}, discussion={discussion_id}")

    def disconnect(self, websocket: WebSocket, discussion_id: str):
        """Remove a WebSocket connection."""
        if discussion_id in self.active_connections:
            # Find and remove the connection
            to_remove = None
            for conn in self.active_connections[discussion_id]:
                if conn[0] == websocket:
                    to_remove = conn
                    break

            if to_remove:
                self.active_connections[discussion_id].discard(to_remove)
                logger.info(f"WebSocket disconnected: discussion={discussion_id}")

            # Clean up if no more connections for this discussion
            if not self.active_connections[discussion_id]:
                del self.active_connections[discussion_id]
                # Stop Redis subscription
                self._stop_subscription(discussion_id)

    async def _start_subscription(self, discussion_id: str):
        """Start Redis pub/sub subscription for a discussion."""
        if discussion_id in self.subscription_tasks:
            return

        ready_event = asyncio.Event()

        async def subscribe_and_forward():
            channel = f"discussion:{discussion_id}"
            max_retries = 5
            retry_delay = 1
            first_attempt = True

            for attempt in range(max_retries):
                pubsub = None
                try:
                    redis = await self.get_redis()
                    pubsub = redis.pubsub()

                    await pubsub.subscribe(channel)
                    logger.info(f"Subscribed to Redis channel: {channel} (attempt {attempt + 1})")

                    if first_attempt:
                        ready_event.set()
                        first_attempt = False

                    async for message in pubsub.listen():
                        if message["type"] == "message":
                            try:
                                data = json.loads(message["data"])
                                await self.send_to_discussion(discussion_id, data)
                            except json.JSONDecodeError:
                                logger.warning(f"Invalid JSON in Redis message: {message['data']}")
                            except Exception as e:
                                logger.error(f"Error forwarding message: {e}")

                except asyncio.CancelledError:
                    logger.info(f"Subscription cancelled for: {discussion_id}")
                    if first_attempt:
                        ready_event.set()
                    raise  # Don't retry cancellation
                except Exception as e:
                    logger.error(f"Redis subscription error for {discussion_id} (attempt {attempt + 1}): {e}")
                    if first_attempt:
                        ready_event.set()
                        first_attempt = False
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 30)
                finally:
                    if pubsub:
                        try:
                            await pubsub.unsubscribe(channel)
                            await pubsub.close()
                        except Exception:
                            pass

        task = asyncio.create_task(subscribe_and_forward())
        self.subscription_tasks[discussion_id] = task
        try:
            await asyncio.wait_for(ready_event.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for Redis subscription to be ready for: {discussion_id}")

    def _stop_subscription(self, discussion_id: str):
        """Stop Redis pub/sub subscription for a discussion."""
        if discussion_id in self.subscription_tasks:
            task = self.subscription_tasks.pop(discussion_id)
            task.cancel()
            logger.info(f"Stopped Redis subscription for: {discussion_id}")

    async def send_to_discussion(self, discussion_id: str, message: dict):
        """Send a message to all connections for a discussion."""
        if discussion_id not in self.active_connections:
            return

        disconnected = []
        for websocket, user_id in list(self.active_connections[discussion_id]):
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.debug(f"Failed to send to websocket: {e}")
                disconnected.append((websocket, user_id))

        # Clean up disconnected
        for conn in disconnected:
            self.active_connections[discussion_id].discard(conn)

    async def send_to_user(self, discussion_id: str, user_id: str, message: dict):
        """Send a message to a specific user in a discussion."""
        if discussion_id not in self.active_connections:
            return

        for websocket, uid in list(self.active_connections[discussion_id]):
            if uid == user_id:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to send message to websocket for user {user_id}: {e}")

    async def broadcast_typing(self, discussion_id: str, agent_id: str, agent_name: str, is_typing: bool):
        """Broadcast typing indicator for an agent."""
        await self.send_to_discussion(discussion_id, {
            "type": "typing",
            "agent_id": agent_id,
            "agent_name": agent_name,
            "is_typing": is_typing,
        })

    async def broadcast_status(self, discussion_id: str, status: str, data: dict | None = None):
        """Broadcast discussion status update."""
        message = {
            "type": "status",
            "status": status,
        }
        if data:
            message["data"] = data
        await self.send_to_discussion(discussion_id, message)

    def get_connection_count(self, discussion_id: str) -> int:
        """Get number of connections for a discussion."""
        if discussion_id not in self.active_connections:
            return 0
        return len(self.active_connections[discussion_id])

    async def shutdown(self):
        """Clean shutdown of all connections and subscriptions."""
        # Cancel all subscription tasks
        for discussion_id in list(self.subscription_tasks.keys()):
            self._stop_subscription(discussion_id)

        # Close Redis connection
        if self._redis:
            await self._redis.close()
            self._redis = None

        logger.info("WebSocket manager shutdown complete")


# Global connection manager instance
manager = ConnectionManager()


async def broadcast_to_discussion(discussion_id: str, message: dict):
    """Broadcast a message to all clients watching a discussion."""
    await manager.send_to_discussion(discussion_id, message)


async def get_manager() -> ConnectionManager:
    """Get the global connection manager."""
    return manager
