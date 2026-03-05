"""
LangGraph state definitions for multi-agent discussions.

The state flows through the conversation graph, accumulating messages
and tracking progress through nodes.
"""

from typing import Annotated, TypedDict
from operator import add
from pydantic import BaseModel, ConfigDict, Field


class AgentConfig(BaseModel):
    """Configuration for a single agent in the discussion."""
    id: str
    name: str
    system_prompt: str
    temperature: float = 0.7
    avatar_emoji: str = ""
    avatar_color: str = "#6366f1"


class LLMConfig(BaseModel):
    """Configuration for the LLM provider."""
    base_url: str
    api_key: str
    model: str
    max_tokens: int = 4096


class MessageRecord(BaseModel):
    """A single message in the discussion."""
    id: str
    agent_id: str | None = None
    agent_name: str | None = None
    content: str
    message_type: str = "agent_message"  # agent_message, system, summary
    node_id: str | None = None
    sequence_number: int = 0
    metadata: dict = Field(default_factory=dict)


class EvaluationResult(BaseModel):
    """Result of an evaluation from a single agent."""
    agent_id: str
    agent_name: str
    scores: dict[str, float]  # criterion -> score
    vote: str | None = None  # e.g., "agree", "disagree", "abstain"
    reasoning: str = ""


class NodeExecutionState(BaseModel):
    """Tracks execution state within a single node."""
    node_id: str
    node_type: str
    turns_completed: int = 0
    max_turns: int = 1
    current_agent_index: int = 0
    evaluations: list[EvaluationResult] = Field(default_factory=list)
    is_complete: bool = False


# Type for messages that supports accumulation
# When multiple nodes add messages, they get appended
Messages = Annotated[list[MessageRecord], add]


class DiscussionState(TypedDict, total=False):
    """
    The main state that flows through the LangGraph discussion workflow.

    This state is passed between nodes and accumulated as the discussion
    progresses. It uses LangGraph's reducer pattern for certain fields.
    """
    # Core discussion info
    discussion_id: str
    topic: str
    description: str

    # Agent configuration
    agents: list[AgentConfig]
    llm_config: LLMConfig
    participant_llm_configs: dict[str, dict]  # Per-participant LLM configs

    # Graph navigation
    current_node_id: str
    previous_node_id: str | None

    # Messages - uses reducer to accumulate
    messages: Messages

    # Context management
    context_summary: str  # Compressed summary of older messages
    total_tokens_used: int

    # Current node execution tracking
    node_state: NodeExecutionState | None

    # Decision/routing
    last_decision: str | None  # "agree", "disagree", "repeat", "done", etc.

    # Loop iteration tracking (keyed by loop node ID)
    loop_iterations: dict[str, int]

    # Control flags
    is_paused: bool
    is_stopped: bool
    error: str | None

    # Feature flags
    web_search_enabled: bool
    tavily_api_key: str | None

    # Sequence tracking
    message_sequence: int


class GraphNodeConfig(BaseModel):
    """Configuration for a single node in the conversation graph."""
    model_config = ConfigDict(extra="ignore")
    id: str
    type: str  # start, end, generate, evaluate, loop
    label: str = ""

    # Generate node config
    prompt_template: str | None = None
    agent_selection: str = "round_robin"  # round_robin, parallel, specific
    specific_agent_ids: list[str] | None = None
    max_turns: int = 1

    # Evaluate node config
    criteria: list[str] | None = None
    voting_method: str = "consensus"  # consensus, majority, score
    min_score_threshold: float = 7.0
    evaluation_prompt: str | None = None

    # Loop node config
    max_iterations: int = 3
    loop_exit_condition: str | None = None  # "evaluate_agree" = exit if last_decision == "agree"

    # Decision node config
    condition: str | None = None  # "consensus_reached", "max_turns", "custom"
    custom_condition: str | None = None  # For custom LLM-evaluated conditions

    # Summary node config
    summary_prompt: str | None = None  # Custom prompt for summarization
    include_in_context: bool = True  # Whether to add summary to context_summary

    # End node config (no fields — pure lifecycle marker)


class GraphEdgeConfig(BaseModel):
    """Configuration for an edge in the conversation graph."""
    id: str
    source: str
    target: str
    source_handle: str | None = None  # For loop nodes: "repeat", "done"
    label: str | None = None


class GraphDefinition(BaseModel):
    """Complete graph definition for a discussion."""
    nodes: list[GraphNodeConfig]
    edges: list[GraphEdgeConfig]

    def get_node(self, node_id: str) -> GraphNodeConfig | None:
        """Get a node by ID."""
        for node in self.nodes:
            if node.id == node_id:
                return node
        return None

    def get_outgoing_edges(self, node_id: str) -> list[GraphEdgeConfig]:
        """Get all edges leaving a node."""
        return [edge for edge in self.edges if edge.source == node_id]

    def get_next_node_id(self, node_id: str, handle: str | None = None) -> str | None:
        """Get the target node ID for a given source and optional handle."""
        for edge in self.edges:
            if edge.source == node_id:
                if handle is None or edge.source_handle == handle:
                    return edge.target
        return None
