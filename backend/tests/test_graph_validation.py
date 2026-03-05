"""
Tests for graph building and validation logic in app.agents.graph.

These are pure unit tests -- no database or external services required.
"""

import pytest
from app.agents.graph import build_discussion_graph
from app.agents.state import GraphDefinition, GraphNodeConfig, GraphEdgeConfig


# ---------------------------------------------------------------------------
# Helpers – reusable minimal graph fragments
# ---------------------------------------------------------------------------

def _node(id: str, type: str, **kwargs) -> dict:
    """Shorthand for a raw node dict (as it arrives from the frontend)."""
    return {"id": id, "type": type, **kwargs}


def _edge(source: str, target: str, source_handle: str | None = None) -> dict:
    return {
        "id": f"e-{source}-{target}",
        "source": source,
        "target": target,
        "sourceHandle": source_handle,
    }


# ---------------------------------------------------------------------------
# Validation: missing start node
# ---------------------------------------------------------------------------

class TestGraphMustHaveStartNode:
    def test_no_start_node_raises(self):
        """A graph with no 'start' node must raise ValueError."""
        graph_def = {
            "nodes": [
                _node("gen1", "generate"),
                _node("end1", "end"),
            ],
            "edges": [_edge("gen1", "end1")],
        }
        with pytest.raises(ValueError, match="start node"):
            build_discussion_graph(graph_def)

    def test_only_end_node_raises(self):
        """A graph containing only an end node should still fail."""
        graph_def = {
            "nodes": [_node("end1", "end")],
            "edges": [],
        }
        with pytest.raises(ValueError, match="start node"):
            build_discussion_graph(graph_def)


# ---------------------------------------------------------------------------
# Validation: decision nodes need >=2 outgoing edges
# ---------------------------------------------------------------------------

class TestDecisionNodeEdges:
    def test_decision_with_two_edges_compiles(self):
        """Decision node with 'agree' and 'disagree' handles should compile."""
        graph_def = {
            "nodes": [
                _node("start", "start"),
                _node("dec1", "decision"),
                _node("gen_a", "generate"),
                _node("gen_b", "generate"),
                _node("end1", "end"),
            ],
            "edges": [
                _edge("start", "dec1"),
                _edge("dec1", "gen_a", source_handle="agree"),
                _edge("dec1", "gen_b", source_handle="disagree"),
                _edge("gen_a", "end1"),
                _edge("gen_b", "end1"),
            ],
        }
        # Should not raise
        compiled = build_discussion_graph(graph_def)
        assert compiled is not None

    def test_decision_with_single_edge_compiles(self):
        """
        Decision node with only 1 edge still compiles (router falls back to
        the first edge), but this is a degenerate case.
        """
        graph_def = {
            "nodes": [
                _node("start", "start"),
                _node("dec1", "decision"),
                _node("end1", "end"),
            ],
            "edges": [
                _edge("start", "dec1"),
                _edge("dec1", "end1", source_handle="agree"),
            ],
        }
        compiled = build_discussion_graph(graph_def)
        assert compiled is not None


# ---------------------------------------------------------------------------
# Valid graphs compile without errors
# ---------------------------------------------------------------------------

class TestValidGraphs:
    def test_simple_linear_graph(self):
        """start -> generate -> end should compile cleanly."""
        graph_def = {
            "nodes": [
                _node("start", "start"),
                _node("gen1", "generate"),
                _node("end1", "end"),
            ],
            "edges": [
                _edge("start", "gen1"),
                _edge("gen1", "end1"),
            ],
        }
        compiled = build_discussion_graph(graph_def)
        assert compiled is not None

    def test_debate_graph_with_loop(self):
        """A debate-style graph: start -> generate -> evaluate -> loop -> end."""
        graph_def = {
            "nodes": [
                _node("start", "start"),
                _node("gen1", "generate", data={"max_turns": 2}),
                _node("eval1", "evaluate"),
                _node("loop1", "loop", data={"max_iterations": 3}),
                _node("end1", "end"),
            ],
            "edges": [
                _edge("start", "gen1"),
                _edge("gen1", "eval1"),
                _edge("eval1", "loop1"),
                _edge("loop1", "gen1", source_handle="repeat"),
                _edge("loop1", "end1", source_handle="done"),
            ],
        }
        compiled = build_discussion_graph(graph_def)
        assert compiled is not None

    def test_summary_node_graph(self):
        """start -> generate -> summary -> end."""
        graph_def = {
            "nodes": [
                _node("start", "start"),
                _node("gen1", "generate"),
                _node("sum1", "summary"),
                _node("end1", "end"),
            ],
            "edges": [
                _edge("start", "gen1"),
                _edge("gen1", "sum1"),
                _edge("sum1", "end1"),
            ],
        }
        compiled = build_discussion_graph(graph_def)
        assert compiled is not None


# ---------------------------------------------------------------------------
# GraphDefinition helper methods
# ---------------------------------------------------------------------------

class TestGraphDefinitionHelpers:
    """Tests for GraphDefinition.get_outgoing_edges and get_next_node_id."""

    @pytest.fixture()
    def graph_def(self):
        return GraphDefinition(
            nodes=[
                GraphNodeConfig(id="start", type="start"),
                GraphNodeConfig(id="gen1", type="generate"),
                GraphNodeConfig(id="end1", type="end"),
            ],
            edges=[
                GraphEdgeConfig(id="e1", source="start", target="gen1"),
                GraphEdgeConfig(id="e2", source="gen1", target="end1"),
            ],
        )

    def test_get_outgoing_edges(self, graph_def):
        edges = graph_def.get_outgoing_edges("start")
        assert len(edges) == 1
        assert edges[0].target == "gen1"

    def test_get_outgoing_edges_none(self, graph_def):
        edges = graph_def.get_outgoing_edges("end1")
        assert edges == []

    def test_get_next_node_id(self, graph_def):
        assert graph_def.get_next_node_id("start") == "gen1"
        assert graph_def.get_next_node_id("gen1") == "end1"
        assert graph_def.get_next_node_id("end1") is None
