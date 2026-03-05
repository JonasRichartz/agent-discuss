"""
Tests for the Pydantic state models in app.agents.state.

Pure unit tests -- no I/O, no database.
"""

import pytest
from pydantic import ValidationError

from app.agents.state import (
    AgentConfig,
    GraphDefinition,
    GraphEdgeConfig,
    GraphNodeConfig,
    LLMConfig,
    MessageRecord,
    NodeExecutionState,
    EvaluationResult,
)


# ---------------------------------------------------------------------------
# MessageRecord
# ---------------------------------------------------------------------------

class TestMessageRecord:
    def test_create_minimal(self):
        msg = MessageRecord(id="m1", content="Hello")
        assert msg.id == "m1"
        assert msg.content == "Hello"
        assert msg.message_type == "agent_message"
        assert msg.agent_id is None
        assert msg.agent_name is None
        assert msg.node_id is None
        assert msg.sequence_number == 0
        assert msg.metadata == {}

    def test_create_full(self):
        msg = MessageRecord(
            id="m2",
            agent_id="a1",
            agent_name="Alice",
            content="I think...",
            message_type="agent_message",
            node_id="gen1",
            sequence_number=5,
            metadata={"tokens": 42},
        )
        assert msg.agent_id == "a1"
        assert msg.agent_name == "Alice"
        assert msg.node_id == "gen1"
        assert msg.sequence_number == 5
        assert msg.metadata["tokens"] == 42

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            MessageRecord()  # id and content are required

    def test_id_required(self):
        with pytest.raises(ValidationError):
            MessageRecord(content="hello")

    def test_content_required(self):
        with pytest.raises(ValidationError):
            MessageRecord(id="m1")


# ---------------------------------------------------------------------------
# GraphNodeConfig – extra fields ignored
# ---------------------------------------------------------------------------

class TestGraphNodeConfig:
    def test_basic_creation(self):
        node = GraphNodeConfig(id="n1", type="generate", label="Gen Node")
        assert node.id == "n1"
        assert node.type == "generate"
        assert node.label == "Gen Node"

    def test_extra_fields_ignored(self):
        """ConfigDict(extra='ignore') should silently drop unknown fields."""
        node = GraphNodeConfig(
            id="n1",
            type="start",
            unknown_field="should be dropped",
            another_extra=123,
        )
        assert node.id == "n1"
        assert not hasattr(node, "unknown_field")
        assert not hasattr(node, "another_extra")

    def test_generate_defaults(self):
        node = GraphNodeConfig(id="g1", type="generate")
        assert node.agent_selection == "round_robin"
        assert node.max_turns == 1
        assert node.prompt_template is None
        assert node.specific_agent_ids is None

    def test_evaluate_defaults(self):
        node = GraphNodeConfig(id="e1", type="evaluate")
        assert node.voting_method == "consensus"
        assert node.min_score_threshold == 7.0
        assert node.criteria is None

    def test_loop_defaults(self):
        node = GraphNodeConfig(id="l1", type="loop")
        assert node.max_iterations == 3
        assert node.loop_exit_condition is None

    def test_decision_fields(self):
        node = GraphNodeConfig(id="d1", type="decision", condition="consensus_reached")
        assert node.condition == "consensus_reached"
        assert node.custom_condition is None


# ---------------------------------------------------------------------------
# GraphEdgeConfig
# ---------------------------------------------------------------------------

class TestGraphEdgeConfig:
    def test_basic(self):
        edge = GraphEdgeConfig(id="e1", source="a", target="b")
        assert edge.source == "a"
        assert edge.target == "b"
        assert edge.source_handle is None
        assert edge.label is None

    def test_with_handle(self):
        edge = GraphEdgeConfig(id="e1", source="loop1", target="gen1", source_handle="repeat")
        assert edge.source_handle == "repeat"


# ---------------------------------------------------------------------------
# GraphDefinition helpers
# ---------------------------------------------------------------------------

class TestGraphDefinition:
    @pytest.fixture()
    def graph(self):
        return GraphDefinition(
            nodes=[
                GraphNodeConfig(id="start", type="start"),
                GraphNodeConfig(id="gen1", type="generate"),
                GraphNodeConfig(id="loop1", type="loop"),
                GraphNodeConfig(id="end1", type="end"),
            ],
            edges=[
                GraphEdgeConfig(id="e1", source="start", target="gen1"),
                GraphEdgeConfig(id="e2", source="gen1", target="loop1"),
                GraphEdgeConfig(id="e3", source="loop1", target="gen1", source_handle="repeat"),
                GraphEdgeConfig(id="e4", source="loop1", target="end1", source_handle="done"),
            ],
        )

    def test_get_node_found(self, graph):
        node = graph.get_node("gen1")
        assert node is not None
        assert node.type == "generate"

    def test_get_node_not_found(self, graph):
        assert graph.get_node("nonexistent") is None

    def test_get_outgoing_edges(self, graph):
        edges = graph.get_outgoing_edges("loop1")
        assert len(edges) == 2
        targets = {e.target for e in edges}
        assert targets == {"gen1", "end1"}

    def test_get_outgoing_edges_empty(self, graph):
        assert graph.get_outgoing_edges("end1") == []

    def test_get_next_node_id_no_handle(self, graph):
        """Without a handle filter, returns the first matching edge."""
        assert graph.get_next_node_id("start") == "gen1"
        assert graph.get_next_node_id("gen1") == "loop1"

    def test_get_next_node_id_with_handle(self, graph):
        assert graph.get_next_node_id("loop1", handle="repeat") == "gen1"
        assert graph.get_next_node_id("loop1", handle="done") == "end1"

    def test_get_next_node_id_no_match(self, graph):
        assert graph.get_next_node_id("end1") is None
        assert graph.get_next_node_id("loop1", handle="nonexistent") is None


# ---------------------------------------------------------------------------
# Other state models
# ---------------------------------------------------------------------------

class TestAgentConfig:
    def test_defaults(self):
        agent = AgentConfig(id="a1", name="Alice", system_prompt="Be helpful")
        assert agent.temperature == 0.7
        assert agent.avatar_emoji == ""
        assert agent.avatar_color == "#6366f1"


class TestLLMConfig:
    def test_defaults(self):
        cfg = LLMConfig(base_url="http://localhost:11434", api_key="key", model="llama3")
        assert cfg.max_tokens == 4096

    def test_all_fields(self):
        cfg = LLMConfig(base_url="http://api.example.com", api_key="sk-123", model="gpt-4", max_tokens=8192)
        assert cfg.max_tokens == 8192


class TestNodeExecutionState:
    def test_defaults(self):
        nes = NodeExecutionState(node_id="n1", node_type="generate")
        assert nes.turns_completed == 0
        assert nes.max_turns == 1
        assert nes.current_agent_index == 0
        assert nes.evaluations == []
        assert nes.is_complete is False


class TestEvaluationResult:
    def test_creation(self):
        er = EvaluationResult(agent_id="a1", agent_name="Alice", scores={"clarity": 8.5})
        assert er.scores["clarity"] == 8.5
        assert er.vote is None
        assert er.reasoning == ""
