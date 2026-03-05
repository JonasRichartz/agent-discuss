"""PostgreSQL-based checkpointer for LangGraph."""
from typing import Any, Iterator, Optional, Tuple
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata
from app.services.supabase import get_supabase_service_client


class PostgresCheckpointer(BaseCheckpointSaver):
    """Stores LangGraph checkpoints in PostgreSQL."""

    def __init__(self):
        super().__init__()

    def put(self, config: dict, checkpoint: Checkpoint, metadata: CheckpointMetadata) -> None:
        """Save checkpoint to database."""
        thread_id = config["configurable"]["thread_id"]

        checkpoint_data = {
            "checkpoint": checkpoint,
            "metadata": metadata,
        }

        supabase = get_supabase_service_client()
        supabase.table("discussions").update({
            "execution_state": checkpoint_data,
        }).eq("id", thread_id).execute()

    def get(self, config: dict) -> Optional[Checkpoint]:
        """Retrieve checkpoint from database."""
        thread_id = config["configurable"]["thread_id"]

        supabase = get_supabase_service_client()
        result = supabase.table("discussions").select("execution_state").eq(
            "id", thread_id
        ).maybe_single().execute()

        if not result or not result.data or not result.data.get("execution_state"):
            return None

        return result.data["execution_state"].get("checkpoint")

    def list(self, config: dict) -> Iterator[Tuple[Checkpoint, CheckpointMetadata]]:
        """List checkpoints (returns latest only)."""
        checkpoint = self.get(config)
        if checkpoint:
            thread_id = config["configurable"]["thread_id"]
            supabase = get_supabase_service_client()
            result = supabase.table("discussions").select("execution_state").eq(
                "id", thread_id
            ).maybe_single().execute()

            if not result or not result.data or not result.data.get("execution_state"):
                return
            metadata = result.data["execution_state"].get("metadata", {})
            yield (checkpoint, metadata)
