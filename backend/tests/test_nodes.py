"""Tests for LangGraph node functions."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agents.nodes import (
    _filter_participating_agents,
    create_message,
    decision_node,
    end_node,
    generate_node,
    loop_node,
    start_node,
    summary_node,
)
from app.agents.state import (
    AgentConfig,
    GraphNodeConfig,
    LLMConfig,
    NodeExecutionState,
)


def make_state(**overrides):
    base = {
        "discussion_id": "test-disc",
        "topic": "Test topic",
        "description": "Test description",
        "agents": [
            AgentConfig(id="a1", name="Alice", system_prompt="You are Alice"),
            AgentConfig(id="a2", name="Bob", system_prompt="You are Bob"),
        ],
        "llm_config": LLMConfig(base_url="http://test", api_key="key", model="test-model"),
        "participant_llm_configs": {
            "a1": {"base_url": "http://test", "api_key": "key", "model": "m1", "max_tokens": 4096},
            "a2": {"base_url": "http://test", "api_key": "key", "model": "m2", "max_tokens": 4096},
        },
        "messages": [],
        "message_sequence": 0,
        "current_node_id": "start",
        "node_state": None,
        "last_decision": None,
        "loop_iterations": {},
        "context_summary": "",
    }
    base.update(overrides)
    return base


def make_config(**overrides):
    base = {"id": "node1", "type": "generate", "label": "Test"}
    base.update(overrides)
    return GraphNodeConfig(**base)


def mock_llm_response(content="Test response"):
    resp = MagicMock()
    resp.content = content
    return resp


# -- create_message --


class TestCreateMessage:
    def test_basic_creation(self):
        state = make_state(message_sequence=5)
        msg = create_message(content="Hello", state=state)
        assert msg.content == "Hello"
        assert msg.sequence_number == 6
        assert msg.message_type == "agent_message"
        assert msg.agent_id is None

    def test_with_agent(self):
        state = make_state()
        agent = AgentConfig(id="a1", name="Alice", system_prompt="test", avatar_color="#ff0000")
        msg = create_message(content="Hi", state=state, agent=agent)
        assert msg.agent_id == "a1"
        assert msg.agent_name == "Alice"
        assert msg.metadata["participant_avatar_color"] == "#ff0000"

    def test_custom_message_type(self):
        state = make_state()
        msg = create_message(content="sys", state=state, message_type="system_message")
        assert msg.message_type == "system_message"


# -- start_node / end_node --


class TestLifecycleNodes:
    async def test_start_node(self):
        state = make_state()
        config = make_config(id="start_node", type="start")
        result = await start_node(state, config)
        assert len(result["messages"]) == 1
        assert "[Discussion Started]" in result["messages"][0].content
        assert result["messages"][0].message_type == "system_message"
        assert result["current_node_id"] == "start_node"

    async def test_end_node(self):
        state = make_state()
        config = make_config(id="end_node", type="end")
        result = await end_node(state, config)
        assert len(result["messages"]) == 1
        assert "[Discussion Complete]" in result["messages"][0].content
        assert result["is_stopped"] is True


# -- _filter_participating_agents --


class TestFilterAgents:
    def test_all_agents_default(self):
        agents = [AgentConfig(id="a1", name="A", system_prompt=""), AgentConfig(id="a2", name="B", system_prompt="")]
        config = make_config(agent_selection="all")
        result = _filter_participating_agents(agents, config)
        assert len(result) == 2

    def test_specific_agents(self):
        agents = [AgentConfig(id="a1", name="A", system_prompt=""), AgentConfig(id="a2", name="B", system_prompt="")]
        config = make_config(agent_selection="specific", specific_agent_ids=["a1"])
        result = _filter_participating_agents(agents, config)
        assert len(result) == 1
        assert result[0].id == "a1"


# -- loop_node --


class TestLoopNode:
    async def test_increments_iteration(self):
        state = make_state()
        config = make_config(id="loop1", type="loop", max_iterations=3)
        result = await loop_node(state, config)
        assert result["loop_iterations"]["loop1"] == 1
        assert result["last_decision"] == "repeat"

    async def test_exits_at_max(self):
        state = make_state(loop_iterations={"loop1": 3})
        config = make_config(id="loop1", type="loop", max_iterations=3)
        result = await loop_node(state, config)
        assert result["last_decision"] == "done"

    async def test_early_exit_on_agree(self):
        state = make_state(last_decision="agree")
        config = make_config(id="loop1", type="loop", max_iterations=10, loop_exit_condition="evaluate_agree")
        result = await loop_node(state, config)
        assert result["last_decision"] == "done"

    async def test_resets_node_state(self):
        state = make_state()
        config = make_config(id="loop1", type="loop", max_iterations=5)
        result = await loop_node(state, config)
        assert result["node_state"] is None


# -- generate_node --


class TestGenerateNode:
    async def test_round_robin_one_agent_per_call(self):
        state = make_state()
        config = make_config(max_turns=2, prompt_template="Discuss {topic}")

        with patch("app.agents.nodes.get_llm_client") as mock_get, \
             patch("app.agents.nodes._get_rag_context_safe", new_callable=AsyncMock, return_value=""), \
             patch("app.agents.nodes.maybe_summarize_context", new_callable=AsyncMock, return_value=("", [])):
            mock_llm = AsyncMock()
            mock_llm.ainvoke = AsyncMock(return_value=mock_llm_response("Alice says hi"))
            mock_get.return_value = mock_llm

            result = await generate_node(state, config)

        assert len(result["messages"]) == 1
        assert result["messages"][0].agent_name == "Alice"
        assert result["node_state"].current_agent_index == 1

    async def test_round_robin_advances_to_next_agent(self):
        node_state = NodeExecutionState(
            node_id="node1", node_type="generate",
            turns_completed=0, max_turns=2, current_agent_index=1,
        )
        state = make_state(node_state=node_state)
        config = make_config(max_turns=2)

        with patch("app.agents.nodes.get_llm_client") as mock_get, \
             patch("app.agents.nodes._get_rag_context_safe", new_callable=AsyncMock, return_value=""), \
             patch("app.agents.nodes.maybe_summarize_context", new_callable=AsyncMock, return_value=("", [])):
            mock_llm = AsyncMock()
            mock_llm.ainvoke = AsyncMock(return_value=mock_llm_response("Bob responds"))
            mock_get.return_value = mock_llm

            result = await generate_node(state, config)

        assert result["messages"][0].agent_name == "Bob"
        # After agent index 1 (last agent), wraps to 0 and increments turn
        assert result["node_state"].current_agent_index == 0
        assert result["node_state"].turns_completed == 1

    async def test_completes_at_max_turns(self):
        node_state = NodeExecutionState(
            node_id="node1", node_type="generate",
            turns_completed=2, max_turns=2, current_agent_index=0,
        )
        state = make_state(node_state=node_state)
        config = make_config(max_turns=2)

        result = await generate_node(state, config)
        assert result["node_state"].is_complete is True
        assert "messages" not in result

    async def test_parallel_execution(self):
        state = make_state()
        config = make_config(max_turns=1, agent_selection="parallel")

        with patch("app.agents.nodes.get_llm_client") as mock_get, \
             patch("app.agents.nodes._get_rag_context_safe", new_callable=AsyncMock, return_value=""), \
             patch("app.agents.nodes.maybe_summarize_context", new_callable=AsyncMock, return_value=("", [])):
            mock_llm = AsyncMock()
            mock_llm.ainvoke = AsyncMock(return_value=mock_llm_response("Response"))
            mock_get.return_value = mock_llm

            result = await generate_node(state, config)

        assert len(result["messages"]) == 2  # Both agents respond

    async def test_llm_error_handled_gracefully(self):
        state = make_state()
        config = make_config(max_turns=1)

        with patch("app.agents.nodes.get_llm_client") as mock_get, \
             patch("app.agents.nodes._get_rag_context_safe", new_callable=AsyncMock, return_value=""), \
             patch("app.agents.nodes.maybe_summarize_context", new_callable=AsyncMock, return_value=("", [])):
            mock_llm = AsyncMock()
            mock_llm.ainvoke = AsyncMock(side_effect=RuntimeError("API timeout"))
            mock_get.return_value = mock_llm

            result = await generate_node(state, config)

        assert len(result["messages"]) == 1
        assert "[Error]" in result["messages"][0].content
        assert result["messages"][0].message_type == "error"


# -- summary_node --


class TestSummaryNode:
    async def test_creates_summary_message(self):
        state = make_state()
        config = make_config(id="sum1", type="summary")

        with patch("app.agents.nodes._get_fallback_llm_client") as mock_get:
            mock_llm = AsyncMock()
            mock_llm.ainvoke = AsyncMock(return_value=mock_llm_response("Summary of discussion"))
            mock_get.return_value = mock_llm

            result = await summary_node(state, config)

        assert len(result["messages"]) == 1
        assert result["messages"][0].message_type == "summary"
        assert result["messages"][0].content == "Summary of discussion"

    async def test_llm_error_produces_fallback(self):
        state = make_state()
        config = make_config(id="sum1", type="summary")

        with patch("app.agents.nodes._get_fallback_llm_client") as mock_get:
            mock_llm = AsyncMock()
            mock_llm.ainvoke = AsyncMock(side_effect=RuntimeError("LLM down"))
            mock_get.return_value = mock_llm

            result = await summary_node(state, config)

        assert "[Summary unavailable" in result["messages"][0].content


# -- decision_node --


class TestDecisionNode:
    async def test_consensus_reached(self):
        state = make_state(last_decision="agree")
        config = make_config(id="dec1", type="decision", condition="consensus_reached")

        result = await decision_node(state, config)
        assert result["last_decision"] == "agree"

    async def test_max_turns_exceeded(self):
        from app.agents.state import MessageRecord

        msgs = [
            MessageRecord(id=str(i), content=f"msg{i}", message_type="agent_message", sequence_number=i)
            for i in range(25)
        ]
        state = make_state(messages=msgs)
        config = make_config(id="dec1", type="decision", condition="max_turns", max_turns=20)

        result = await decision_node(state, config)
        assert result["last_decision"] == "agree"

    async def test_max_turns_not_exceeded(self):
        state = make_state()
        config = make_config(id="dec1", type="decision", condition="max_turns", max_turns=20)

        result = await decision_node(state, config)
        assert result["last_decision"] == "disagree"

    async def test_custom_condition_true(self):
        state = make_state()
        config = make_config(
            id="dec1", type="decision",
            condition="custom", custom_condition="Has the discussion concluded?",
        )

        with patch("app.agents.nodes._get_fallback_llm_client") as mock_get:
            mock_llm = AsyncMock()
            mock_llm.ainvoke = AsyncMock(return_value=mock_llm_response("true"))
            mock_get.return_value = mock_llm

            result = await decision_node(state, config)

        assert result["last_decision"] == "agree"

    async def test_custom_condition_llm_error_defaults_disagree(self):
        state = make_state()
        config = make_config(
            id="dec1", type="decision",
            condition="custom", custom_condition="test",
        )

        with patch("app.agents.nodes._get_fallback_llm_client") as mock_get:
            mock_get.side_effect = RuntimeError("No LLM")

            result = await decision_node(state, config)

        assert result["last_decision"] == "disagree"
