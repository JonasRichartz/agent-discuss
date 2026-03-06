"""
LangGraph workflow builder for multi-agent discussions.

Takes a graph definition (from the frontend editor) and builds
a LangGraph StateGraph that can be executed with checkpointing.
"""

from typing import Any, Literal

from langgraph.graph import END, StateGraph
from langgraph.pregel import RetryPolicy

from .nodes import NODE_FUNCTIONS
from .state import DiscussionState, GraphDefinition, GraphNodeConfig

# Retry policy for LLM-calling nodes — handles transient API failures
LLM_RETRY_POLICY = RetryPolicy(max_attempts=3)

# Node types that make LLM API calls and should be retried on transient failures
LLM_NODE_TYPES = {"generate", "evaluate", "summary", "decision"}


def get_node_function(config: GraphNodeConfig):
    """
    Create a node function wrapper for a specific node config.

    Returns an async function that takes state and returns state updates.
    """
    node_type = config.type
    base_func = NODE_FUNCTIONS.get(node_type)

    if base_func is None:
        # Graceful passthrough for removed/unknown node types (backward compat)
        async def passthrough(state: DiscussionState, config: GraphNodeConfig) -> dict:
            return {}
        base_func = passthrough

    async def node_wrapper(state: DiscussionState) -> dict:
        # Check for pause/stop signals
        if state.get('is_paused') or state.get('is_stopped'):
            return {}

        # Execute the node function
        result = await base_func(state, config)

        # Update current node
        result["previous_node_id"] = state.get('current_node_id')
        result["current_node_id"] = config.id

        return result

    return node_wrapper


def create_router(
    graph_def: GraphDefinition,
    node_id: str,
) -> callable:
    """
    Create a routing function for a node.

    For decision nodes, routes based on last_decision.
    For other nodes, routes to the single outgoing edge.
    """
    node = graph_def.get_node(node_id)
    outgoing_edges = graph_def.get_outgoing_edges(node_id)

    if not outgoing_edges:
        # No outgoing edges = end
        def router(state: DiscussionState) -> Literal["__end__"]:
            return END
        return router

    if node and node.type == "loop":
        # Loop nodes route via "repeat" / "done" handles
        def loop_router(state: DiscussionState) -> str:
            if state.get('is_stopped'):
                return END

            decision = state.get('last_decision', 'done')

            # Find edge matching the decision handle
            for edge in outgoing_edges:
                if edge.source_handle == decision:
                    return edge.target

            # Default: first edge
            return outgoing_edges[0].target

        return loop_router

    if node and node.type == "decision":
        # Decision nodes route via "agree" / "disagree" handles
        def decision_router(state: DiscussionState) -> str:
            if state.get('is_stopped'):
                return END

            decision = state.get('last_decision', 'disagree')

            # Find edge matching the decision handle
            for edge in outgoing_edges:
                if edge.source_handle == decision:
                    return edge.target

            # Default: first edge
            return outgoing_edges[0].target

        return decision_router

    if node and node.type == "generate":
        # Generate nodes may loop back for multiple turns
        def generate_router(state: DiscussionState) -> str:
            if state.get('is_stopped'):
                return END

            node_state = state.get('node_state')
            if node_state and node_state.node_id == node_id and not node_state.is_complete:
                # Loop back to self for more turns
                return node_id

            # Either no state, wrong node, or complete — move to next node
            return outgoing_edges[0].target

        return generate_router

    # Default: single path routing
    def default_router(state: DiscussionState) -> str:
        if state.get('is_stopped'):
            return END
        return outgoing_edges[0].target

    return default_router


def build_discussion_graph(
    graph_definition: dict,
    checkpointer: Any | None = None,
) -> StateGraph:
    """
    Build a LangGraph StateGraph from a graph definition.

    Args:
        graph_definition: Dict with 'nodes' and 'edges' from frontend
        checkpointer: Optional LangGraph checkpointer for pause/resume

    Returns:
        Compiled StateGraph ready for execution
    """
    # Parse graph definition
    # Flatten 'data' dict into top-level fields so GraphNodeConfig picks up
    # settings like max_turns, prompt_template, agent_selection, etc.
    def parse_node(n: dict) -> GraphNodeConfig:
        node = {**n}
        data = node.pop("data", {}) or {}
        # Position is frontend-only, not part of GraphNodeConfig
        node.pop("position", None)
        return GraphNodeConfig(**node, **data)

    graph_def = GraphDefinition(
        nodes=[parse_node(n) if isinstance(n, dict) else n for n in graph_definition.get('nodes', [])],
        edges=[{
            "id": e.get("id", ""),
            "source": e.get("source", ""),
            "target": e.get("target", ""),
            "source_handle": e.get("sourceHandle"),
            "label": e.get("label"),
        } for e in graph_definition.get('edges', [])],
    )

    # Create state graph
    workflow = StateGraph(DiscussionState)

    # Add nodes (with retry policy for LLM-calling nodes)
    for node_config in graph_def.nodes:
        node_func = get_node_function(node_config)
        retry = LLM_RETRY_POLICY if node_config.type in LLM_NODE_TYPES else None
        workflow.add_node(node_config.id, node_func, retry=retry)

    # Set entry point (start node)
    start_node = next((n for n in graph_def.nodes if n.type == "start"), None)
    if start_node:
        workflow.set_entry_point(start_node.id)
    else:
        raise ValueError("Graph must have a start node")

    # Add edges with conditional routing
    for node_config in graph_def.nodes:
        outgoing = graph_def.get_outgoing_edges(node_config.id)

        if not outgoing:
            # No outgoing edges - this is an end point
            workflow.add_edge(node_config.id, END)
        elif node_config.type in ("loop", "generate", "decision"):
            # Conditional routing
            router = create_router(graph_def, node_config.id)

            # Get all possible targets
            targets = list(set(e.target for e in outgoing))
            if node_config.type == "generate":
                targets.append(node_config.id)  # Include self for looping

            workflow.add_conditional_edges(
                node_config.id,
                router,
                {t: t for t in targets} | {END: END},
            )
        else:
            # Single edge - direct connection
            workflow.add_edge(node_config.id, outgoing[0].target)

    # Compile with optional checkpointer
    if checkpointer:
        return workflow.compile(checkpointer=checkpointer)
    return workflow.compile()


def create_initial_state(
    discussion_id: str,
    topic: str,
    description: str,
    agents: list[dict],
    llm_config: dict,
    participant_llm_configs: dict | None = None,
    web_search_enabled: bool = False,
    tavily_api_key: str | None = None,
) -> DiscussionState:
    """
    Create the initial state for a discussion.

    Args:
        discussion_id: The discussion ID
        topic: Discussion topic
        description: Optional description
        agents: List of agent configs
        llm_config: LLM provider config (fallback)
        participant_llm_configs: Per-participant LLM configs

    Returns:
        Initial DiscussionState
    """
    from .state import AgentConfig, LLMConfig

    state = {
        "discussion_id": discussion_id,
        "topic": topic,
        "description": description or "",
        "agents": [AgentConfig(**a) for a in agents],
        "llm_config": LLMConfig(**llm_config),
        "current_node_id": "start",
        "previous_node_id": None,
        "messages": [],
        "context_summary": "",
        "total_tokens_used": 0,
        "node_state": None,
        "last_decision": None,
        "loop_iterations": {},
        "is_paused": False,
        "is_stopped": False,
        "error": None,
        "message_sequence": 0,
        "web_search_enabled": web_search_enabled,
        "tavily_api_key": tavily_api_key,
    }

    if participant_llm_configs:
        state["participant_llm_configs"] = participant_llm_configs

    return state


class DiscussionRunner:
    """High-level runner for executing discussions with optional checkpointing."""

    def __init__(self, graph_definition: dict, checkpointer=None):
        self.graph = build_discussion_graph(graph_definition, checkpointer)
        self.thread_id: str | None = None

    async def run(self, initial_state: DiscussionState, thread_id: str | None = None):
        """Run the discussion graph, yielding state updates."""
        self.thread_id = thread_id or initial_state.get('discussion_id')
        config = {"configurable": {"thread_id": self.thread_id}}
        async for state in self.graph.astream(initial_state, config):
            yield state

    async def resume(self, thread_id: str):
        """Resume from checkpoint — continues from last saved state."""
        self.thread_id = thread_id
        config = {"configurable": {"thread_id": thread_id}}
        # Pass None to resume from the last checkpoint
        async for state in self.graph.astream(None, config):
            yield state
