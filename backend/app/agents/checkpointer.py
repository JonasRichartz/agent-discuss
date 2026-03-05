"""PostgreSQL-based checkpointer for LangGraph using AsyncPostgresSaver."""
import logging
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from app.config import get_settings

logger = logging.getLogger(__name__)


async def create_checkpointer() -> AsyncPostgresSaver:
    """Create and initialize an AsyncPostgresSaver instance.

    Returns an async context-managed checkpointer connected to the
    project's PostgreSQL database. The caller must use it as:

        async with await create_checkpointer() as checkpointer:
            graph = build_discussion_graph(definition, checkpointer)
            ...
    """
    settings = get_settings()
    db_url = settings.database_url

    if not db_url:
        raise ValueError(
            "DATABASE_URL is not configured. "
            "Set it in .env (get from Supabase: Settings > Database > Connection string)"
        )

    checkpointer = AsyncPostgresSaver.from_conn_string(db_url)
    return checkpointer
