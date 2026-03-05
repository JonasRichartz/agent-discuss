"""
LangGraph node implementations for multi-agent discussions.

Each node is an async function that:
1. Takes the current DiscussionState
2. Performs its specific task
3. Returns state updates

Nodes communicate via the state, not direct return values.
"""

import asyncio
import uuid
import json
from typing import TYPE_CHECKING
from langchain_core.messages import HumanMessage

from .context import (
    build_conversation_messages,
    apply_template_variables,
    get_llm_client,
    maybe_summarize_context,
    get_rag_context,
    build_rag_query,
)

if TYPE_CHECKING:
    from .state import (
        DiscussionState,
        GraphNodeConfig,
        MessageRecord,
        AgentConfig,
        EvaluationResult,
        NodeExecutionState,
    )


def _get_fallback_llm_client(state: "DiscussionState"):
    """Get LLM client, falling back to first participant's config if global config is incomplete."""
    try:
        return get_llm_client(state['llm_config'])
    except ValueError:
        participant_configs = state.get('participant_llm_configs', {})
        if participant_configs:
            first_id = next(iter(participant_configs))
            return get_llm_client(participant_id=first_id, participant_configs=participant_configs)
        raise


def create_message(
    content: str,
    state: "DiscussionState",
    agent: "AgentConfig | None" = None,
    message_type: str = "agent_message",  # Must match DB enum: agent_message, system_message, summary, error
    node_id: str | None = None,
) -> "MessageRecord":
    """Create a new message record."""
    from .state import MessageRecord

    seq = state.get('message_sequence', 0) + 1
    metadata = {}
    if agent:
        metadata["participant_avatar_color"] = agent.avatar_color
        metadata["participant_avatar_emoji"] = agent.avatar_emoji

    return MessageRecord(
        id=str(uuid.uuid4()),
        agent_id=agent.id if agent else None,
        agent_name=agent.name if agent else None,
        content=content,
        message_type=message_type,
        node_id=node_id or state.get('current_node_id'),
        sequence_number=seq,
        metadata=metadata,
    )


async def start_node(state: "DiscussionState", config: "GraphNodeConfig") -> dict:
    """
    Entry point node — pure lifecycle marker.

    Emits a notification that the discussion has started.
    No LLM calls or conversational behavior.
    """
    msg = create_message(
        content="[Discussion Started]",
        state=state,
        message_type="system_message",
        node_id=config.id,
    )

    return {
        "messages": [msg],
        "current_node_id": config.id,
        "message_sequence": state.get('message_sequence', 0) + 1,
    }


def _filter_participating_agents(agents: list, config: "GraphNodeConfig") -> list:
    """Filter agents based on selection mode."""
    if config.agent_selection == "specific" and config.specific_agent_ids:
        return [a for a in agents if a.id in config.specific_agent_ids]
    return agents


async def _get_rag_context_safe(state: "DiscussionState") -> str:
    """Get RAG context and optional web search results, returning empty string if unavailable."""
    parts = []
    rag_query = None

    import logging
    _logger = logging.getLogger(__name__)

    # RAG from linked documents
    try:
        rag_query = await build_rag_query(state)
        rag_result = await get_rag_context(
            discussion_id=state['discussion_id'],
            query=rag_query,
            llm_config=state['llm_config'],
        )
        if rag_result:
            parts.append(rag_result)
    except Exception as e:
        _logger.warning(f"RAG context retrieval failed: {e}")

    # Web search (if enabled for this discussion)
    if state.get('web_search_enabled'):
        try:
            from app.services.search import tavily_search
            query = rag_query or state.get('topic', '')
            search_result = await tavily_search(query, api_key=state.get('tavily_api_key'))
            if search_result:
                parts.append(f"## Web Search Results\n\n{search_result}")
        except Exception as e:
            _logger.warning(f"Web search failed: {e}")

    return "\n\n".join(parts)


async def _handle_parallel_execution(
    participating_agents: list,
    state: "DiscussionState",
    config: "GraphNodeConfig",
    filled_prompt: str,
    rag_context: str,
    participant_configs: dict,
) -> tuple[list, int]:
    """Execute all agents in parallel and return messages + turns increment."""
    tasks = []
    for agent in participating_agents:
        llm = get_llm_client(
            llm_config=state.get('llm_config'),
            participant_id=agent.id,
            participant_configs=participant_configs,
        )
        conv_messages = build_conversation_messages(state, agent, filled_prompt, rag_context)
        tasks.append(llm.ainvoke(conv_messages))

    responses = await asyncio.gather(*tasks, return_exceptions=True)

    messages = []
    base_sequence = state.get('message_sequence', 0)
    for i, (agent, response) in enumerate(zip(participating_agents, responses)):
        if isinstance(response, Exception):
            content = f"[Error] {agent.name} failed to respond: {response}"
            message_type = "error"
        else:
            content = response.content
            message_type = "agent_message"
        msg = create_message(
            content=content,
            state=state,
            agent=agent,
            message_type=message_type,
            node_id=config.id,
        )
        msg.sequence_number = base_sequence + i + 1
        messages.append(msg)

    return messages, 1  # All agents responded = 1 turn


async def _handle_round_robin_execution(
    participating_agents: list,
    state: "DiscussionState",
    config: "GraphNodeConfig",
    node_state: "NodeExecutionState",
    filled_prompt: str,
    rag_context: str,
    participant_configs: dict,
) -> tuple[list, int, int]:
    """Execute one agent in round-robin and return messages, next_idx, turns_increment."""
    agent_idx = node_state.current_agent_index % len(participating_agents)
    agent = participating_agents[agent_idx]

    llm = get_llm_client(
        llm_config=state.get('llm_config'),
        participant_id=agent.id,
        participant_configs=participant_configs,
    )

    conv_messages = build_conversation_messages(state, agent, filled_prompt, rag_context)
    try:
        response = await llm.ainvoke(conv_messages)
        content = response.content
        message_type = "agent_message"
    except Exception as e:
        content = f"[Error] {agent.name} failed to respond: {e}"
        message_type = "error"

    msg = create_message(
        content=content,
        state=state,
        agent=agent,
        message_type=message_type,
        node_id=config.id,
    )

    # Calculate next index and turns increment
    next_idx = agent_idx + 1
    turns_increment = 0
    if next_idx >= len(participating_agents):
        next_idx = 0
        turns_increment = 1

    return [msg], next_idx, turns_increment


async def generate_node(state: "DiscussionState", config: "GraphNodeConfig") -> dict:
    """
    Generate content node - agents take turns producing responses.

    Supports:
    - round_robin: Agents take turns one at a time
    - parallel: All agents respond simultaneously
    - specific: Only selected agents participate
    """
    from .state import NodeExecutionState

    # Summarize context if needed to prevent context loss
    new_summary, _ = await maybe_summarize_context(state)
    context_updated = new_summary != state.get('context_summary', '')

    node_state = state.get('node_state')
    agents = state['agents']

    # Initialize node state if needed
    if node_state is None or node_state.node_id != config.id:
        node_state = NodeExecutionState(
            node_id=config.id,
            node_type="generate",
            turns_completed=0,
            max_turns=config.max_turns,
            current_agent_index=0,
        )

    # Check if we've completed all turns
    if node_state.turns_completed >= node_state.max_turns:
        return {
            "node_state": NodeExecutionState(
                **{**node_state.model_dump(), "is_complete": True}
            ),
        }

    # Get participating agents
    participating_agents = _filter_participating_agents(agents, config)
    if not participating_agents:
        return {"node_state": NodeExecutionState(**{**node_state.model_dump(), "is_complete": True})}

    # Prepare prompts and context
    prompt_template = config.prompt_template or "Share your thoughts on {topic}."
    filled_prompt = apply_template_variables(prompt_template, state)
    rag_context = await _get_rag_context_safe(state)
    participant_configs = state.get('participant_llm_configs', {})

    # Execute agents based on selection mode
    if config.agent_selection == "parallel":
        messages, turns_increment = await _handle_parallel_execution(
            participating_agents, state, config, filled_prompt, rag_context, participant_configs
        )
        node_state = NodeExecutionState(
            **{**node_state.model_dump(), "turns_completed": node_state.turns_completed + turns_increment}
        )
    else:
        messages, next_idx, turns_increment = await _handle_round_robin_execution(
            participating_agents, state, config, node_state, filled_prompt, rag_context, participant_configs
        )
        node_state = NodeExecutionState(
            **{
                **node_state.model_dump(),
                "current_agent_index": next_idx,
                "turns_completed": node_state.turns_completed + turns_increment,
            }
        )

    # Check if complete
    is_complete = node_state.turns_completed >= node_state.max_turns
    node_state = NodeExecutionState(
        **{**node_state.model_dump(), "is_complete": is_complete}
    )

    result = {
        "messages": messages,
        "node_state": node_state,
        "message_sequence": state.get('message_sequence', 0) + len(messages),
    }
    if context_updated:
        result["context_summary"] = new_summary
    return result


async def evaluate_node(state: "DiscussionState", config: "GraphNodeConfig") -> dict:
    """
    Evaluation node - agents vote or score based on criteria.

    Agents evaluate the discussion so far and provide:
    - Scores for each criterion (if score-based)
    - A vote (agree/disagree/abstain)
    - Reasoning for their evaluation
    """
    from .state import NodeExecutionState, EvaluationResult

    node_state = state.get('node_state')
    agents = state['agents']

    # Initialize node state if needed
    if node_state is None or node_state.node_id != config.id:
        node_state = NodeExecutionState(
            node_id=config.id,
            node_type="evaluate",
            turns_completed=0,
            max_turns=1,  # Evaluation is single round
            current_agent_index=0,
            evaluations=[],
        )

    # Check if already complete
    if node_state.is_complete:
        return {"node_state": node_state}

    criteria = config.criteria or ["quality", "relevance", "completeness"]
    voting_method = config.voting_method

    # Build evaluation prompt
    eval_prompt = config.evaluation_prompt or f"""
Evaluate the discussion so far.

Criteria to evaluate (score 1-10 for each):
{chr(10).join(f'- {c}' for c in criteria)}

Also provide your overall vote:
- "agree" if the discussion has reached a good conclusion
- "disagree" if more discussion is needed
- "abstain" if you cannot decide

Respond in JSON format:
{{
    "scores": {{"criterion1": score, ...}},
    "vote": "agree|disagree|abstain",
    "reasoning": "Brief explanation"
}}
"""

    filled_prompt = apply_template_variables(eval_prompt, state)

    messages = []
    evaluations = list(node_state.evaluations)
    participant_configs = state.get('participant_llm_configs', {})

    # All agents evaluate in parallel using their own LLM configs
    tasks = []
    for agent in agents:
        llm = get_llm_client(
            llm_config=state.get('llm_config'),
            participant_id=agent.id,
            participant_configs=participant_configs,
        )
        conv_messages = build_conversation_messages(state, agent, filled_prompt)
        tasks.append(llm.ainvoke(conv_messages))

    responses = await asyncio.gather(*tasks, return_exceptions=True)

    for agent, response in zip(agents, responses):
        # Handle failed LLM calls gracefully
        if isinstance(response, Exception):
            evaluations.append(EvaluationResult(
                agent_id=agent.id,
                agent_name=agent.name,
                scores={c: 5 for c in criteria},
                vote="abstain",
                reasoning=f"Evaluation failed: {response}",
            ))
            msg = create_message(
                content=f"[Evaluation] {agent.name} could not evaluate: {response}",
                state=state,
                agent=agent,
                message_type="agent_message",
                node_id=config.id,
            )
            messages.append(msg)
            continue

        # Parse evaluation response
        try:
            # Try to extract JSON from response with more robust parsing
            content = response.content
            eval_data = None

            # Try multiple JSON extraction strategies
            # Strategy 1: Parse entire content as JSON
            try:
                eval_data = json.loads(content)
            except json.JSONDecodeError:
                # Strategy 2: Find JSON block with proper brace matching
                brace_count = 0
                start_idx = content.find('{')
                if start_idx >= 0:
                    for i in range(start_idx, len(content)):
                        if content[i] == '{':
                            brace_count += 1
                        elif content[i] == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                try:
                                    eval_data = json.loads(content[start_idx:i+1])
                                    break
                                except json.JSONDecodeError:
                                    continue

            if eval_data:
                eval_result = EvaluationResult(
                    agent_id=agent.id,
                    agent_name=agent.name,
                    scores=eval_data.get('scores', {}),
                    vote=eval_data.get('vote', 'abstain'),
                    reasoning=eval_data.get('reasoning', ''),
                )
            else:
                eval_result = EvaluationResult(
                    agent_id=agent.id,
                    agent_name=agent.name,
                    scores={c: 5 for c in criteria},
                    vote="abstain",
                    reasoning=content,
                )
        except Exception:
            eval_result = EvaluationResult(
                agent_id=agent.id,
                agent_name=agent.name,
                scores={c: 5 for c in criteria},
                vote="abstain",
                reasoning=response.content,
            )

        evaluations.append(eval_result)

        # Add evaluation as a message for context
        eval_msg = f"[Evaluation] Scores: {eval_result.scores}, Vote: {eval_result.vote}\nReasoning: {eval_result.reasoning}"
        msg = create_message(
            content=eval_msg,
            state=state,
            agent=agent,
            message_type="agent_message",
            node_id=config.id,
        )
        messages.append(msg)

    # Determine consensus/result
    votes = [e.vote for e in evaluations if e.vote]
    agree_count = sum(1 for v in votes if v == "agree")
    disagree_count = sum(1 for v in votes if v == "disagree")

    if voting_method == "consensus":
        decision = "agree" if agree_count == len(votes) else "disagree"
    elif voting_method == "majority":
        decision = "agree" if agree_count > disagree_count else "disagree"
    elif voting_method == "score":
        # Calculate average score
        all_scores = [s for e in evaluations for s in e.scores.values()]
        avg_score = sum(all_scores) / len(all_scores) if all_scores else 0
        threshold = config.min_score_threshold or 7.0
        decision = "agree" if avg_score >= threshold else "disagree"
    else:
        decision = "agree" if agree_count >= disagree_count else "disagree"

    node_state = NodeExecutionState(
        **{
            **node_state.model_dump(),
            "evaluations": evaluations,
            "is_complete": True,
        }
    )

    return {
        "messages": messages,
        "node_state": node_state,
        "last_decision": decision,
        "message_sequence": state.get('message_sequence', 0) + len(messages),
    }


async def decision_node(state: "DiscussionState", config: "GraphNodeConfig") -> dict:
    """
    Decision/branching node - determines which path to take.

    Evaluates a condition and sets last_decision for routing.
    Conditions:
    - consensus_reached: Based on last evaluation
    - max_turns: Based on message count or node iterations
    - custom: Uses LLM to evaluate custom condition
    """
    condition = config.condition

    if condition == "consensus_reached":
        # Use the last evaluation's decision
        decision = state.get('last_decision', 'disagree')
    elif condition == "max_turns":
        # Check if we've hit a turn limit
        # Default: after N messages, consider complete
        message_count = len(state.get('messages', []))
        max_turns = config.max_turns or 20
        decision = "agree" if message_count >= max_turns else "disagree"
    elif condition == "custom" and config.custom_condition:
        try:
            llm = _get_fallback_llm_client(state)

            prompt = f"""Based on the discussion so far about "{state['topic']}",
evaluate this condition:

{config.custom_condition}

Respond with only "true" or "false"."""

            response = await llm.ainvoke([HumanMessage(content=prompt)])
            result = response.content.strip().lower()
            decision = "agree" if result == "true" else "disagree"
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Custom condition LLM call failed: {e}")
            decision = "disagree"
    else:
        decision = "disagree"

    # Add a system message about the decision
    msg = create_message(
        content=f"[Decision] Condition '{condition}': {decision}",
        state=state,
        message_type="system_message",
        node_id=config.id,
    )

    return {
        "messages": [msg],
        "last_decision": decision,
        "current_node_id": config.id,
        "message_sequence": state.get('message_sequence', 0) + 1,
    }


async def summary_node(state: "DiscussionState", config: "GraphNodeConfig") -> dict:
    """
    Summary node - compress the discussion context.

    Creates a summary of the discussion so far, which can be:
    - Added to the context for future messages
    - Used to reset the message history (keeping only summary)
    """
    llm = _get_fallback_llm_client(state)

    summary_prompt = config.summary_prompt or """
Summarize the discussion so far. Include:
- Main points raised by each participant
- Key agreements and disagreements
- Current status of the discussion
- Any conclusions or open questions

Keep it concise but comprehensive."""

    filled_prompt = apply_template_variables(summary_prompt, state)

    # Build context for summarization
    messages_text = "\n\n".join([
        f"[{m.agent_name or 'System'}]: {m.content}"
        for m in state.get('messages', [])
    ])

    full_prompt = f"""{filled_prompt}

Discussion to summarize:
{messages_text}

Summary:"""

    try:
        response = await llm.ainvoke([HumanMessage(content=full_prompt)])
        summary = response.content
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Summary LLM call failed: {e}")
        summary = f"[Summary unavailable — LLM error: {e}]"

    # Create summary message
    msg = create_message(
        content=summary,
        state=state,
        message_type="summary",
        node_id=config.id,
    )

    result = {
        "messages": [msg],
        "message_sequence": state.get('message_sequence', 0) + 1,
    }

    # Optionally update context summary
    if config.include_in_context:
        existing_summary = state.get('context_summary', '')
        if existing_summary:
            result["context_summary"] = f"{existing_summary}\n\n---\n\n{summary}"
        else:
            result["context_summary"] = summary

    return result


async def loop_node(state: "DiscussionState", config: "GraphNodeConfig") -> dict:
    """
    Loop control node — tracks iterations and routes repeat/done.

    Increments its iteration counter each time it's entered.
    Routes to "repeat" (loop body) or "done" (exit) based on:
    - max_iterations: hard cap on iterations
    - loop_exit_condition: optional early exit (e.g., "evaluate_agree")
    """
    loop_iters = dict(state.get('loop_iterations', {}))
    current = loop_iters.get(config.id, 0)
    current += 1
    loop_iters[config.id] = current

    # Check early exit condition
    if config.loop_exit_condition == "evaluate_agree" and state.get('last_decision') == "agree":
        decision = "done"
    elif current > config.max_iterations:
        decision = "done"
    else:
        decision = "repeat"

    msg = create_message(
        content=f"[Loop {config.label or config.id}] Iteration {current}/{config.max_iterations} — {decision}",
        state=state,
        message_type="system_message",
        node_id=config.id,
    )

    return {
        "messages": [msg],
        "loop_iterations": loop_iters,
        "last_decision": decision,
        "node_state": None,  # Reset so generate nodes re-initialize on next iteration
        "message_sequence": state.get('message_sequence', 0) + 1,
    }


async def end_node(state: "DiscussionState", config: "GraphNodeConfig") -> dict:
    """
    End node — pure lifecycle marker.

    Emits a notification that the discussion is complete and signals the graph to stop.
    No LLM calls or conversational behavior.
    """
    msg = create_message(
        content="[Discussion Complete]",
        state=state,
        message_type="system_message",
        node_id=config.id,
    )

    return {
        "messages": [msg],
        "current_node_id": config.id,
        "is_stopped": True,
        "message_sequence": state.get('message_sequence', 0) + 1,
    }


# Node type to function mapping
NODE_FUNCTIONS = {
    "start": start_node,
    "end": end_node,
    "generate": generate_node,
    "evaluate": evaluate_node,
    "loop": loop_node,
    "decision": decision_node,
    "summary": summary_node,
}
