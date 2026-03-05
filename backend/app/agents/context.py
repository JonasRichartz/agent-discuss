"""
Context management for multi-agent discussions.

Handles the sliding window approach to manage token limits:
- System context (topic, node, agent role)
- Summarized history (older messages compressed)
- Recent messages (last N messages in full)
- RAG context (relevant document chunks)
"""

from typing import TYPE_CHECKING
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

if TYPE_CHECKING:
    from .state import DiscussionState, AgentConfig, MessageRecord, LLMConfig

# Token budget allocation
MAX_CONTEXT_TOKENS = 6000
SYSTEM_CONTEXT_BUDGET = 500
SUMMARY_BUDGET = 2000
RECENT_MESSAGES_BUDGET = 2000
RAG_BUDGET = 500

# Trigger summarization when messages exceed this count
SUMMARIZE_THRESHOLD = 20
RECENT_MESSAGES_COUNT = 10


def get_llm_client(
    llm_config: "LLMConfig | None" = None,
    participant_id: str | None = None,
    participant_configs: dict | None = None,
) -> ChatOpenAI:
    """
    Create LangChain chat client.

    Priority: participant-specific > global config
    """
    # Use participant-specific config if available
    if participant_id and participant_configs and participant_id in participant_configs:
        config = participant_configs[participant_id]
        base_url = config.get("base_url")
        api_key = config.get("api_key")

        if not base_url or not api_key:
            raise ValueError(
                f"Participant {participant_id} has incomplete LLM configuration. "
                "Please ensure the LLM provider has base_url and api_key configured."
            )

        return ChatOpenAI(
            base_url=base_url,
            api_key=api_key,
            model=config.get("model", "gpt-3.5-turbo"),
            max_tokens=config.get("max_tokens", 4096),
            request_timeout=120,
        )

    # Fallback to global config
    if llm_config:
        if not llm_config.base_url or not llm_config.api_key:
            raise ValueError(
                "Global LLM configuration is incomplete. "
                "Please configure an LLM provider with base_url and api_key."
            )

        return ChatOpenAI(
            base_url=llm_config.base_url,
            api_key=llm_config.api_key,
            model=llm_config.model,
            max_tokens=llm_config.max_tokens,
            request_timeout=120,
        )

    # No valid configuration available
    raise ValueError(
        "No LLM provider configuration available. Please add an LLM provider in Settings, "
        "and ensure discussion participants are configured with a provider."
    )


def _summarize_system_prompt(prompt: str, max_length: int = 120) -> str:
    """Extract a short role description from a system prompt."""
    first_line = prompt.strip().split("\n")[0]
    if len(first_line) <= max_length:
        return first_line
    return first_line[:max_length].rsplit(" ", 1)[0] + "..."


def build_system_context(
    state: "DiscussionState",
    agent: "AgentConfig",
    node_prompt: str | None = None,
    rag_context: str | None = None,
) -> str:
    """
    Build the system context for an agent.

    Includes:
    - Discussion topic and description
    - Agent's role/persona
    - Other participants with their roles
    - Discussion format rules (@ mentions)
    - RAG context from documents (if available)
    - Current task from node prompt
    """
    parts = []

    # Topic and description
    parts.append(f"# Discussion Topic\n{state['topic']}")
    if state.get('description'):
        parts.append(f"\n{state['description']}")

    # Agent persona
    parts.append(f"\n\n# Your Identity\nYou are **{agent.name}**.")
    parts.append(f"\n{agent.system_prompt}")

    # Other participants with descriptions
    other_agents = [a for a in state['agents'] if a.id != agent.id]
    if other_agents:
        parts.append("\n\n# Other Participants")
        parts.append("The following agents are part of this discussion:")
        for a in other_agents:
            role_summary = _summarize_system_prompt(a.system_prompt)
            parts.append(f"\n- **{a.name}**: {role_summary}")

    # Discussion format
    all_names = [a.name for a in state['agents']]
    parts.append("\n\n# Discussion Format")
    parts.append(
        "This is a multi-agent discussion. The conversation history shows each message "
        "prefixed with the speaker's name. Your own previous messages are marked with "
        f"**{agent.name}** (you)."
    )
    parts.append(
        "\nYou can address specific participants directly using @Name "
        f"(e.g., {', '.join(f'@{n}' for n in all_names if n != agent.name)})."
        " When another participant addresses you with "
        f"@{agent.name}, make sure to respond to their points."
    )

    # RAG context from documents
    if rag_context:
        parts.append(f"\n\n{rag_context}")

    # Current task
    if node_prompt:
        parts.append(f"\n\n# Current Task\n{node_prompt}")

    return "".join(parts)


def get_recent_messages(
    messages: list["MessageRecord"],
    count: int = RECENT_MESSAGES_COUNT,
) -> list["MessageRecord"]:
    """Get the N most recent messages."""
    return messages[-count:] if len(messages) > count else messages


def get_messages_for_summary(
    messages: list["MessageRecord"],
    recent_count: int = RECENT_MESSAGES_COUNT,
) -> list["MessageRecord"]:
    """Get messages that should be summarized (all except recent)."""
    if len(messages) <= recent_count:
        return []
    return messages[:-recent_count]


def format_messages_as_text(messages: list["MessageRecord"]) -> str:
    """Format messages as readable text for summarization or context."""
    lines = []
    for msg in messages:
        if msg.message_type == "system_message":
            lines.append(f"[System] {msg.content}")
        elif msg.message_type == "summary":
            lines.append(f"[Summary] {msg.content}")
        else:
            name = msg.agent_name or "Unknown"
            lines.append(f"[{name}] {msg.content}")
    return "\n\n".join(lines)


async def summarize_messages(
    messages: list["MessageRecord"],
    llm_config: "LLMConfig",
    topic: str,
    max_tokens: int = 500,
) -> str:
    """
    Summarize a list of messages into a condensed context.

    Uses the LLM to create a coherent summary preserving key points,
    agreements, disagreements, and important details.
    """
    if not messages:
        return ""

    client = get_llm_client(llm_config)

    messages_text = format_messages_as_text(messages)

    prompt = f"""Summarize the following discussion about "{topic}".

Preserve:
- Key arguments and positions from each participant
- Important facts or information mentioned
- Any agreements or disagreements reached
- The current direction of the discussion

Keep the summary concise but informative. Write in third person.

Discussion:
{messages_text}

Summary:"""

    response = await client.ainvoke([HumanMessage(content=prompt)])

    return response.content


def _format_transcript(
    recent: list["MessageRecord"],
    agent: "AgentConfig",
) -> str:
    """Format recent messages as a multi-party discussion transcript."""
    lines = []
    for msg in recent:
        if msg.message_type == "system_message":
            lines.append(f"[System]: {msg.content}")
        elif msg.message_type == "summary":
            lines.append(f"[Summary]: {msg.content}")
        elif msg.agent_id == agent.id:
            lines.append(f"**{agent.name}** (you): {msg.content}")
        else:
            name = msg.agent_name or "Unknown"
            lines.append(f"**{name}**: {msg.content}")
    return "\n\n".join(lines)


def build_conversation_messages(
    state: "DiscussionState",
    agent: "AgentConfig",
    node_prompt: str | None = None,
    rag_context: str | None = None,
) -> list:
    """
    Build the full conversation context for an agent.

    Uses a transcript approach for multi-agent discussions:
    1. System message with identity, participants, and rules
    2. Summary of older messages (if exists)
    3. Single HumanMessage with the conversation transcript and turn prompt

    This avoids misrepresenting other agents' messages as HumanMessage
    or AIMessage, and makes the multi-party structure explicit.
    """
    messages = []

    # System context (includes RAG, participant info, @ mention rules)
    system_content = build_system_context(state, agent, node_prompt, rag_context)
    messages.append(SystemMessage(content=system_content))

    # Add summary of older messages if exists
    if state.get('context_summary'):
        messages.append(
            SystemMessage(
                content=f"# Previous Discussion Summary\n{state['context_summary']}"
            )
        )

    # Build conversation transcript
    recent = get_recent_messages(state.get('messages', []))

    if recent:
        transcript = _format_transcript(recent, agent)
        turn_prompt = (
            f"Here is the discussion so far:\n\n{transcript}\n\n---\n\n"
            f"Now respond as **{agent.name}**. Stay in character and engage "
            f"with what the other participants have said. You may use @Name "
            f"to address specific participants directly."
        )
    else:
        turn_prompt = (
            f"The discussion is starting now. Respond as **{agent.name}** "
            f"and share your opening thoughts on the topic."
        )

    messages.append(HumanMessage(content=turn_prompt))

    return messages


async def maybe_summarize_context(
    state: "DiscussionState",
) -> tuple[str, list["MessageRecord"]]:
    """
    Check if context needs summarization and perform it if needed.

    Returns:
        tuple: (updated_summary, messages_to_keep)
    """
    messages = state.get('messages', [])

    if len(messages) <= SUMMARIZE_THRESHOLD:
        return state.get('context_summary', ''), messages

    # Get messages to summarize
    to_summarize = get_messages_for_summary(messages)
    if not to_summarize:
        return state.get('context_summary', ''), messages

    # Combine existing summary with new messages to summarize
    existing_summary = state.get('context_summary', '')
    if existing_summary:
        # Create a combined summary
        combined_text = f"Previous summary: {existing_summary}\n\nNew messages:\n{format_messages_as_text(to_summarize)}"
        summary_prompt = f"""Update this discussion summary to include the new messages.
Keep the summary coherent and comprehensive.

{combined_text}

Updated summary:"""
        client = get_llm_client(state['llm_config'])
        response = await client.ainvoke([HumanMessage(content=summary_prompt)])
        new_summary = response.content
    else:
        new_summary = await summarize_messages(
            to_summarize,
            state['llm_config'],
            state['topic'],
        )

    # Return updated summary and only recent messages
    recent = get_recent_messages(messages)
    return new_summary, recent


def apply_template_variables(
    template: str,
    state: "DiscussionState",
    extra_vars: dict | None = None,
) -> str:
    """
    Apply variable substitutions to a prompt template.

    Available variables:
    - {topic}: The discussion topic
    - {description}: The discussion description
    - {context}: Combined context summary and recent messages
    - {previous}: Summary of previous node's output
    """
    variables = {
        "topic": state.get('topic', ''),
        "description": state.get('description', ''),
        "context": state.get('context_summary', ''),
        "previous": "",  # Will be filled from previous node output
    }

    if extra_vars:
        variables.update(extra_vars)

    # Safe format that ignores missing keys
    try:
        return template.format(**variables)
    except KeyError:
        # If there are unmatched variables, return template as-is
        return template


# RAG Context
async def get_rag_context(
    discussion_id: str,
    query: str,
    llm_config: "LLMConfig",
    top_k: int = 3,
    min_relevance: float = 0.7,
) -> str:
    """
    Retrieve relevant document chunks for RAG.

    Args:
        discussion_id: The discussion ID to search in
        query: The search query (usually topic + recent context)
        llm_config: LLM config for embedding generation
        top_k: Number of chunks to retrieve
        min_relevance: Minimum relevance score (0-1, higher is better)

    Returns:
        Formatted string with relevant document chunks
    """
    from langchain_openai import OpenAIEmbeddings
    from app.services.vectorstore import get_discussion_collection, query_similar_chunks

    try:
        # Get the discussion's document collection
        collection = get_discussion_collection(discussion_id)

        # Check if collection has any documents
        if collection.count() == 0:
            return ""

        # Generate embedding for the query
        embeddings_client = OpenAIEmbeddings(
            base_url=llm_config.base_url,
            api_key=llm_config.api_key,
            model="text-embedding-ada-002",  # Use default embedding model
        )

        query_embedding = await embeddings_client.aembed_query(query)

        # Query ChromaDB
        results = query_similar_chunks(
            collection=collection,
            query_embedding=query_embedding,
            n_results=top_k,
        )

        if not results["documents"]:
            return ""

        # Filter by relevance (ChromaDB distances are L2, convert to similarity)
        # Lower distance = more similar
        relevant_chunks = []
        for doc, meta, dist in zip(
            results["documents"],
            results["metadatas"],
            results["distances"],
        ):
            # Convert L2 distance to similarity score (approximate)
            # For normalized embeddings, similarity ≈ 1 - (dist^2 / 2)
            similarity = max(0, 1 - (dist / 2))

            if similarity >= min_relevance:
                relevant_chunks.append({
                    "content": doc,
                    "filename": meta.get("filename", "Unknown"),
                    "similarity": similarity,
                })

        if not relevant_chunks:
            return ""

        # Format the context
        context_parts = ["# Relevant Documents"]
        for i, chunk in enumerate(relevant_chunks, 1):
            context_parts.append(f"\n## From: {chunk['filename']}")
            context_parts.append(chunk["content"])

        return "\n".join(context_parts)

    except Exception as e:
        # Log but don't fail - RAG is optional enhancement
        import logging
        logging.getLogger(__name__).warning(f"RAG context retrieval failed: {e}")
        return ""


async def build_rag_query(state: "DiscussionState") -> str:
    """
    Build a search query for RAG based on the current discussion state.

    Combines topic with recent message content for better relevance.
    """
    parts = [state.get('topic', '')]

    # Add recent message content for context
    messages = state.get('messages', [])
    recent = messages[-3:] if len(messages) > 3 else messages

    for msg in recent:
        if msg.content:
            # Take first 200 chars of each message
            parts.append(msg.content[:200])

    return " ".join(parts)
