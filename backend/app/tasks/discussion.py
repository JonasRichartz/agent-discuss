"""
Celery tasks for running multi-agent discussions.

Uses LangGraph for orchestration with Redis pub/sub for real-time updates.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import redis
from celery import states
from celery.exceptions import SoftTimeLimitExceeded

from app.config import get_settings
from app.tasks.celery import celery_app
from app.agents.graph import DiscussionRunner, create_initial_state
from app.agents.checkpointer import create_checkpointer
from app.agents.state import MessageRecord
from app.services.supabase import get_supabase_service_client

logger = logging.getLogger(__name__)
settings = get_settings()


def get_redis_client() -> redis.Redis:
    """Get Redis client for pub/sub."""
    return redis.from_url(settings.redis_url)


async def load_discussion_data(discussion_id: str, user_id: str) -> dict | None:
    """
    Load discussion configuration from Supabase.

    Returns dict with discussion, participants, and per-participant LLM configs.
    """
    supabase = get_supabase_service_client()

    # Fetch discussion
    result = supabase.table("discussions").select("*").eq("id", discussion_id).maybe_single().execute()
    if not result or not result.data:
        return None

    discussion = result.data

    # Fetch participants (new architecture)
    participants_result = supabase.table("discussion_participants").select(
        "*, llm_providers(*)"
    ).eq("discussion_id", discussion_id).order("order_index").execute()

    participants = participants_result.data

    if not participants:
        return None

    # Build agent configs
    agent_configs = []
    participant_llm_configs = {}

    for p in participants:
        agent_configs.append({
            "id": p["id"],
            "name": p["name"],
            "system_prompt": p["system_prompt"],
            "temperature": p["temperature"],
            "avatar_emoji": p["avatar_emoji"],
            "avatar_color": p["avatar_color"],
        })

        provider = p.get("llm_providers")
        if not provider:
            logger.error(f"Participant {p['name']} ({p['id']}) has no LLM provider configured")
            raise ValueError(f"Participant '{p['name']}' is missing LLM provider configuration")

        participant_llm_configs[p["id"]] = {
            "base_url": provider.get("base_url"),
            "api_key": provider.get("api_key"),
            "model": p.get("model_name", "gpt-3.5-turbo"),  # Per-participant model
            "max_tokens": p.get("max_tokens", 4096),
        }

        # Validate required fields
        if not participant_llm_configs[p["id"]]["base_url"]:
            raise ValueError(f"Participant '{p['name']}' LLM provider is missing base_url")
        if not participant_llm_configs[p["id"]]["api_key"]:
            raise ValueError(f"Participant '{p['name']}' LLM provider is missing api_key")

    # Get default provider for fallback (used for RAG/evaluation LLM calls)
    default_llm_provider = None
    try:
        provider_result = (
            supabase.table("llm_providers")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_default", True)
            .limit(1)
            .execute()
        )
        if provider_result and provider_result.data:
            default_llm_provider = provider_result.data[0]
    except Exception:
        pass  # No default provider, try fallback below

    if not default_llm_provider:
        # No default set — fall back to the first available provider
        try:
            fallback_result = (
                supabase.table("llm_providers")
                .select("*")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if fallback_result and fallback_result.data:
                default_llm_provider = fallback_result.data[0]
        except Exception:
            pass  # No providers at all

    # Fetch user's Tavily API key from profile preferences
    tavily_api_key = None
    try:
        profile_result = (
            supabase.table("profiles")
            .select("preferences")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if profile_result.data:
            prefs = profile_result.data.get("preferences") or {}
            tavily_api_key = prefs.get("tavily_api_key")
    except Exception:
        pass  # Profile lookup is optional

    return {
        "discussion": discussion,
        "participants": participants,
        "agent_configs": agent_configs,
        "participant_llm_configs": participant_llm_configs,
        "llm_provider": default_llm_provider,  # Fallback
        "tavily_api_key": tavily_api_key,
    }


async def save_message(
    discussion_id: str,
    message: MessageRecord,
) -> dict:
    """Save a message to the database.

    Note: agent_id is set to None because the FK references the old agents table,
    not discussion_participants. Participant info is stored in metadata instead.
    """
    supabase = get_supabase_service_client()

    # Merge participant info into metadata for display
    metadata = dict(message.metadata) if message.metadata else {}
    if message.agent_id:
        metadata["participant_id"] = message.agent_id
    if message.agent_name:
        metadata["participant_name"] = message.agent_name

    data = {
        "id": message.id,
        "discussion_id": discussion_id,
        "agent_id": None,  # FK references old agents table; participant info in metadata
        "content": message.content,
        "message_type": message.message_type,
        "sequence_number": message.sequence_number,
        "metadata": metadata,
    }

    result = supabase.table("messages").insert(data).execute()
    if not result.data:
        raise RuntimeError(f"Failed to save message {message.id} to database")
    return result.data[0]


async def update_discussion_status(
    discussion_id: str,
    status: str,
    execution_state: dict | None = None,
):
    """Update discussion status in database."""
    supabase = get_supabase_service_client()

    data = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if execution_state is not None:
        data["execution_state"] = execution_state

    supabase.table("discussions").update(data).eq("id", discussion_id).execute()


def publish_message(redis_client: redis.Redis, discussion_id: str, message: dict):
    """Publish a message to Redis for WebSocket broadcast."""
    channel = f"discussion:{discussion_id}"
    redis_client.publish(channel, json.dumps(message))


def publish_status(redis_client: redis.Redis, discussion_id: str, status: str, data: dict | None = None):
    """Publish a status update to Redis."""
    channel = f"discussion:{discussion_id}"
    payload = {"type": "status", "status": status}
    if data:
        payload["data"] = data
    redis_client.publish(channel, json.dumps(payload))


def publish_typing(redis_client: redis.Redis, discussion_id: str, agent_id: str, agent_name: str, is_typing: bool):
    """Publish typing indicator to Redis."""
    channel = f"discussion:{discussion_id}"
    payload = {
        "type": "typing",
        "agent_id": agent_id,
        "agent_name": agent_name,
        "is_typing": is_typing,
    }
    redis_client.publish(channel, json.dumps(payload))


def check_stop_signal(redis_client: redis.Redis, discussion_id: str) -> str | None:
    """
    Check Redis for stop/pause signals.

    Uses GETDEL for atomic read-and-delete to prevent race conditions.

    Returns: 'pause', 'stop', or None
    """
    key = f"discussion:{discussion_id}:signal"
    signal = redis_client.getdel(key)
    if signal:
        return signal.decode() if isinstance(signal, bytes) else signal
    return None


def _build_llm_config(llm_provider: dict | None, discussion_id: str) -> dict:
    """Build fallback LLM config from provider (used for non-participant nodes)."""
    if not llm_provider:
        logger.warning(f"Discussion {discussion_id} has no default LLM provider - participant-specific configs will be used")
        return {"base_url": "", "api_key": "", "model": "gpt-3.5-turbo", "max_tokens": 4096}

    models = llm_provider.get("available_models") or []
    return {
        "base_url": llm_provider.get("base_url", ""),
        "api_key": llm_provider.get("api_key", ""),
        "model": models[0] if models else "gpt-3.5-turbo",
        "max_tokens": llm_provider.get("max_tokens", 4096),
    }


async def _process_graph_stream(
    runner: DiscussionRunner,
    initial_state: dict | None,
    discussion_id: str,
    agent_configs: list[dict],
    task_instance,
    redis_client: redis.Redis,
    existing_message_ids: set[str] | None = None,
    initial_message_count: int = 0,
    extra_task_meta: dict | None = None,
) -> dict:
    """
    Shared graph execution loop for both run and resume.

    When initial_state is provided, starts a new run. When None, resumes from checkpoint.
    Streams state updates from LangGraph, saves messages, publishes to WebSocket,
    handles typing indicators, and checks for pause/stop signals.
    """
    message_count = initial_message_count
    typing_agents: set[str] = set()

    def clear_typing():
        for agent_id in typing_agents:
            agent = next((a for a in agent_configs if a["id"] == agent_id), None)
            if agent:
                publish_typing(redis_client, discussion_id, agent_id, agent["name"], False)
        typing_agents.clear()

    try:
        # Resume from checkpoint when no initial state, otherwise start fresh
        if initial_state is None:
            stream = runner.resume(discussion_id)
        else:
            stream = runner.run(initial_state, thread_id=discussion_id)

        async for state_update in stream:
            for node_id, node_output in state_update.items():
                if not node_output:
                    continue

                # Show typing indicator for generate nodes
                node_state = node_output.get("node_state")
                if node_state and node_state.node_type == "generate" and not node_state.is_complete:
                    if node_state.current_agent_index < len(agent_configs):
                        agent = agent_configs[node_state.current_agent_index]
                        if agent["id"] not in typing_agents:
                            publish_typing(redis_client, discussion_id, agent["id"], agent["name"], True)
                            typing_agents.add(agent["id"])

                new_messages = node_output.get("messages", [])

                # Clear typing for agents who just sent messages
                for msg in new_messages:
                    if isinstance(msg, MessageRecord) and msg.agent_id and msg.agent_id in typing_agents:
                        publish_typing(redis_client, discussion_id, msg.agent_id, msg.agent_name or "", False)
                        typing_agents.discard(msg.agent_id)

                for msg in new_messages:
                    if not isinstance(msg, MessageRecord):
                        continue
                    # Skip messages already in DB (resume case)
                    if existing_message_ids and msg.id in existing_message_ids:
                        continue

                    await save_message(discussion_id, msg)
                    publish_message(
                        redis_client,
                        discussion_id,
                        {
                            "type": "message",
                            "message": {
                                "id": msg.id,
                                "agent_id": msg.agent_id,
                                "agent_name": msg.agent_name,
                                "content": msg.content,
                                "message_type": msg.message_type,
                                "sequence_number": msg.sequence_number,
                                "avatar_color": msg.metadata.get("participant_avatar_color", "#6366f1"),
                                "avatar_emoji": msg.metadata.get("participant_avatar_emoji", ""),
                            },
                        },
                    )
                    message_count += 1

                meta = {"current_node": node_output.get("current_node_id"), "messages": message_count}
                if extra_task_meta:
                    meta.update(extra_task_meta)
                task_instance.update_state(state=states.STARTED, meta=meta)

            # Check for stop/pause signals
            signal = check_stop_signal(redis_client, discussion_id)
            if signal == "pause":
                clear_typing()
                await update_discussion_status(
                    discussion_id, "paused",
                    execution_state={"thread_id": discussion_id, "has_checkpoint": True},
                )
                publish_status(redis_client, discussion_id, "paused")
                return {"status": "paused", "messages": message_count}
            elif signal == "stop":
                clear_typing()
                await update_discussion_status(discussion_id, "completed")
                publish_status(redis_client, discussion_id, "completed")
                return {"status": "stopped", "messages": message_count}

        # Completed naturally
        clear_typing()
        await update_discussion_status(discussion_id, "completed")
        publish_status(redis_client, discussion_id, "completed")
        return {"status": "completed", "messages": message_count}

    except Exception as e:
        logger.exception(f"Error in discussion {discussion_id}")
        clear_typing()
        await update_discussion_status(discussion_id, "failed")
        publish_status(redis_client, discussion_id, "failed", {"error": str(e)})
        raise


async def run_discussion_async(
    discussion_id: str,
    user_id: str,
    task_instance,
) -> dict:
    """Run a new discussion from scratch with PostgreSQL checkpointing."""
    redis_client = get_redis_client()

    data = await load_discussion_data(discussion_id, user_id)
    if not data:
        raise ValueError(f"Discussion {discussion_id} not found or missing configuration")

    discussion = data["discussion"]
    llm_config = _build_llm_config(data.get("llm_provider"), discussion_id)

    await update_discussion_status(discussion_id, "running")
    publish_status(redis_client, discussion_id, "running")

    initial_state = create_initial_state(
        discussion_id=discussion_id,
        topic=discussion["topic"],
        description=discussion.get("description", ""),
        agents=data["agent_configs"],
        llm_config=llm_config,
        participant_llm_configs=data["participant_llm_configs"],
        web_search_enabled=discussion.get("web_search_enabled", False),
        tavily_api_key=data.get("tavily_api_key"),
    )

    graph_definition = discussion.get("graph_definition", {})

    # Use AsyncPostgresSaver for persistent checkpointing
    checkpointer = None
    try:
        checkpointer = await create_checkpointer()
        async with checkpointer:
            await checkpointer.setup()
            runner = DiscussionRunner(graph_definition, checkpointer=checkpointer)

            return await _process_graph_stream(
                runner=runner,
                initial_state=initial_state,
                discussion_id=discussion_id,
                agent_configs=data["agent_configs"],
                task_instance=task_instance,
                redis_client=redis_client,
            )
    except ValueError as e:
        if "DATABASE_URL" in str(e):
            # Fall back to no checkpointing if DATABASE_URL not configured
            logger.warning(f"No DATABASE_URL configured, running without checkpointing: {e}")
            runner = DiscussionRunner(graph_definition)
            return await _process_graph_stream(
                runner=runner,
                initial_state=initial_state,
                discussion_id=discussion_id,
                agent_configs=data["agent_configs"],
                task_instance=task_instance,
                redis_client=redis_client,
            )
        raise


@celery_app.task(bind=True)
def run_discussion(self, discussion_id: str, user_id: str):
    """
    Long-running task to execute a multi-agent discussion.

    Uses LangGraph for orchestration with checkpointing for pause/resume.
    Publishes real-time updates via Redis pub/sub.
    """
    try:
        # Run the async implementation
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                run_discussion_async(discussion_id, user_id, self)
            )
            return result
        finally:
            loop.close()

    except SoftTimeLimitExceeded:
        logger.warning(f"Discussion {discussion_id} hit soft time limit")
        redis_client = get_redis_client()
        publish_status(redis_client, discussion_id, "timeout")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(
                update_discussion_status(discussion_id, "paused")
            )
        finally:
            loop.close()

        return {"status": "timeout", "message": "Discussion paused due to time limit"}

    except Exception as e:
        logger.exception(f"Failed to run discussion {discussion_id}")
        raise


@celery_app.task
def pause_discussion(discussion_id: str):
    """
    Signal a running discussion to pause.

    Sets a Redis flag that the running task checks.
    """
    redis_client = get_redis_client()
    key = f"discussion:{discussion_id}:signal"
    redis_client.set(key, "pause", ex=300)  # 5 minutes instead of 60s
    return {"status": "pause_signaled"}


@celery_app.task
def stop_discussion(discussion_id: str):
    """
    Signal a running discussion to stop.

    Sets a Redis flag that the running task checks.
    """
    redis_client = get_redis_client()
    key = f"discussion:{discussion_id}:signal"
    redis_client.set(key, "stop", ex=300)  # 5 minutes
    return {"status": "stop_signaled"}


async def resume_discussion_async(discussion_id: str, user_id: str, task_instance) -> dict:
    """Resume a paused discussion from its checkpoint."""
    redis_client = get_redis_client()

    data = await load_discussion_data(discussion_id, user_id)
    if not data:
        raise ValueError(f"Discussion {discussion_id} not found")

    discussion = data["discussion"]
    if discussion["status"] != "paused":
        raise ValueError(f"Cannot resume from {discussion['status']} status")

    await update_discussion_status(discussion_id, "running")
    publish_status(redis_client, discussion_id, "running")

    graph_definition = discussion.get("graph_definition", {})

    # Collect existing message IDs to avoid re-saving on resume
    supabase = get_supabase_service_client()
    existing_messages_result = supabase.table("messages").select(
        "id, sequence_number"
    ).eq("discussion_id", discussion_id).execute()
    existing_db_messages = existing_messages_result.data or []
    existing_ids = {row["id"] for row in existing_db_messages}
    message_count = len(existing_db_messages)

    # Try checkpoint-based resume first, fall back to replay
    checkpointer = None
    try:
        checkpointer = await create_checkpointer()
        async with checkpointer:
            runner = DiscussionRunner(graph_definition, checkpointer=checkpointer)

            # Check if a checkpoint exists for this discussion
            config = {"configurable": {"thread_id": discussion_id}}
            checkpoint = await checkpointer.aget(config)

            if checkpoint:
                logger.info(f"Resuming discussion {discussion_id} from checkpoint")
                return await _process_graph_stream(
                    runner=runner,
                    initial_state=None,  # Resume from checkpoint — no initial state needed
                    discussion_id=discussion_id,
                    agent_configs=data["agent_configs"],
                    task_instance=task_instance,
                    redis_client=redis_client,
                    existing_message_ids=existing_ids,
                    initial_message_count=message_count,
                    extra_task_meta={"resumed": True},
                )

            # No checkpoint — fall through to replay-based resume
            logger.warning(f"No checkpoint found for {discussion_id}, falling back to replay")

    except ValueError as e:
        if "DATABASE_URL" in str(e):
            logger.warning(f"No DATABASE_URL configured, falling back to replay resume: {e}")
        else:
            raise

    # Fallback: replay-based resume (for discussions started before checkpointing)
    return await _resume_via_replay(
        discussion_id=discussion_id,
        data=data,
        task_instance=task_instance,
        redis_client=redis_client,
        existing_ids=existing_ids,
        message_count=message_count,
    )


async def _resume_via_replay(
    discussion_id: str,
    data: dict,
    task_instance,
    redis_client: "redis.Redis",
    existing_ids: set[str],
    message_count: int,
) -> dict:
    """Fallback resume by replaying graph with existing messages as context."""
    discussion = data["discussion"]
    llm_config = _build_llm_config(data.get("llm_provider"), discussion_id)

    # Load full messages for context
    supabase = get_supabase_service_client()
    existing_messages_result = supabase.table("messages").select(
        "id, agent_id, content, message_type, sequence_number, metadata"
    ).eq("discussion_id", discussion_id).order("sequence_number").execute()

    restored_messages = []
    max_sequence = 0
    for row in (existing_messages_result.data or []):
        metadata = row.get("metadata") or {}
        restored_messages.append(MessageRecord(
            id=row["id"],
            agent_id=metadata.get("participant_id"),
            agent_name=metadata.get("participant_name"),
            content=row["content"],
            message_type=row["message_type"],
            sequence_number=row["sequence_number"],
            metadata=metadata,
        ))
        if row["sequence_number"] > max_sequence:
            max_sequence = row["sequence_number"]

    initial_state = create_initial_state(
        discussion_id=discussion_id,
        topic=discussion["topic"],
        description=discussion.get("description", ""),
        agents=data["agent_configs"],
        llm_config=llm_config,
        participant_llm_configs=data["participant_llm_configs"],
        web_search_enabled=discussion.get("web_search_enabled", False),
        tavily_api_key=data.get("tavily_api_key"),
    )
    initial_state["messages"] = restored_messages
    initial_state["message_sequence"] = max_sequence
    if discussion.get("context_summary"):
        initial_state["context_summary"] = discussion["context_summary"]

    graph_definition = discussion.get("graph_definition", {})
    runner = DiscussionRunner(graph_definition)

    return await _process_graph_stream(
        runner=runner,
        initial_state=initial_state,
        discussion_id=discussion_id,
        agent_configs=data["agent_configs"],
        task_instance=task_instance,
        redis_client=redis_client,
        existing_message_ids=existing_ids,
        initial_message_count=message_count,
        extra_task_meta={"resumed": True},
    )


@celery_app.task(bind=True)
def resume_discussion(self, discussion_id: str, user_id: str):
    """Resume from checkpoint."""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(resume_discussion_async(discussion_id, user_id, self))
        finally:
            loop.close()
    except Exception as e:
        logger.exception(f"Failed to resume {discussion_id}")
        raise
