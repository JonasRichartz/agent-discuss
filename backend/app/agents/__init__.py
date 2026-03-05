"""
Multi-agent discussion orchestration with LangGraph.

This module provides:
- State definitions for discussion workflows
- Node implementations (generate, evaluate, decision, summary)
- Context management for token-efficient conversations
- Graph building and execution
"""

from .state import (
    DiscussionState,
    AgentConfig,
    LLMConfig,
    MessageRecord,
    EvaluationResult,
    NodeExecutionState,
    GraphNodeConfig,
    GraphEdgeConfig,
    GraphDefinition,
)

from .graph import (
    build_discussion_graph,
    create_initial_state,
    DiscussionRunner,
)

from .nodes import NODE_FUNCTIONS

from .context import (
    build_conversation_messages,
    summarize_messages,
    maybe_summarize_context,
)

__all__ = [
    # State
    "DiscussionState",
    "AgentConfig",
    "LLMConfig",
    "MessageRecord",
    "EvaluationResult",
    "NodeExecutionState",
    "GraphNodeConfig",
    "GraphEdgeConfig",
    "GraphDefinition",
    # Graph
    "build_discussion_graph",
    "create_initial_state",
    "DiscussionRunner",
    "NODE_FUNCTIONS",
    # Context
    "build_conversation_messages",
    "summarize_messages",
    "maybe_summarize_context",
]
