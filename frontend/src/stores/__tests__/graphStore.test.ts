import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from '../graphStore'
import type { GraphNode, GraphEdge } from '@/types/graph'
import { createDefaultNodeData } from '@/types/graph'

// Reset store state before each test
beforeEach(() => {
  const store = useGraphStore.getState()
  store.clearGraph()
  // Reset history after clearGraph so tests start clean
  useGraphStore.setState({ history: [], historyIndex: -1 })
})

describe('graphStore', () => {
  describe('addNode', () => {
    it('adds a node to the store', () => {
      const store = useGraphStore.getState()
      const initialCount = store.nodes.length

      const newNodeId = store.addNode('generate', { x: 200, y: 300 })

      const updated = useGraphStore.getState()
      expect(updated.nodes.length).toBe(initialCount + 1)

      const addedNode = updated.nodes.find((n) => n.id === newNodeId)
      expect(addedNode).toBeDefined()
      expect(addedNode!.type).toBe('generate')
      expect(addedNode!.position).toEqual({ x: 200, y: 300 })
      expect(addedNode!.data.label).toBe('Generate')
      // addNode selects the new node
      expect(updated.selectedNodeId).toBe(newNodeId)
    })
  })

  describe('validateGraph', () => {
    it('catches missing start node', () => {
      // Set up a graph with no start node
      useGraphStore.setState({
        nodes: [
          {
            id: 'end',
            type: 'end',
            position: { x: 500, y: 200 },
            data: createDefaultNodeData('end'),
          },
        ] as GraphNode[],
        edges: [] as GraphEdge[],
      })

      const messages = useGraphStore.getState().validateGraph()
      const startError = messages.find((m) =>
        m.message.includes('start node')
      )
      expect(startError).toBeDefined()
      expect(startError!.type).toBe('error')
    })

    it('catches disconnected nodes', () => {
      // Set up a graph where a node is not reachable from start
      useGraphStore.setState({
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 100, y: 200 },
            data: createDefaultNodeData('start'),
          },
          {
            id: 'end',
            type: 'end',
            position: { x: 500, y: 200 },
            data: createDefaultNodeData('end'),
          },
          {
            id: 'isolated',
            type: 'generate',
            position: { x: 300, y: 400 },
            data: createDefaultNodeData('generate'),
          },
        ] as GraphNode[],
        edges: [
          { id: 'edge_start_end', source: 'start', target: 'end' },
        ] as GraphEdge[],
      })

      const messages = useGraphStore.getState().validateGraph()

      // The isolated node should trigger both "not reachable" and "no connections" errors
      const reachableError = messages.find(
        (m) => m.message.includes('not reachable') && m.nodeId === 'isolated'
      )
      expect(reachableError).toBeDefined()
      expect(reachableError!.type).toBe('error')

      const noConnectionError = messages.find(
        (m) => m.message.includes('no connections') && m.nodeId === 'isolated'
      )
      expect(noConnectionError).toBeDefined()
    })

    it('passes for a valid simple graph', () => {
      // The default graph (start -> end) should be valid
      useGraphStore.setState({
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 100, y: 200 },
            data: createDefaultNodeData('start'),
          },
          {
            id: 'end',
            type: 'end',
            position: { x: 500, y: 200 },
            data: createDefaultNodeData('end'),
          },
        ] as GraphNode[],
        edges: [
          { id: 'edge_start_end', source: 'start', target: 'end' },
        ] as GraphEdge[],
      })

      const messages = useGraphStore.getState().validateGraph()
      const errors = messages.filter((m) => m.type === 'error')
      expect(errors).toHaveLength(0)
    })
  })

  describe('undo/redo', () => {
    it('undoes and redoes node additions', () => {
      const store = useGraphStore.getState()

      // Default graph has start + end = 2 nodes
      expect(store.nodes.length).toBe(2)

      // Add a node (this pushes history)
      store.addNode('generate', { x: 200, y: 300 })
      expect(useGraphStore.getState().nodes.length).toBe(3)

      // Add another node
      useGraphStore.getState().addNode('evaluate', { x: 300, y: 300 })
      expect(useGraphStore.getState().nodes.length).toBe(4)

      // Undo restores the snapshot saved *before* the last addNode call
      // History: [{2 nodes}, {3 nodes}], so first undo → index 0 → 2 nodes
      // (the "4 nodes" state is the live state, not in history)
      useGraphStore.getState().undo()
      expect(useGraphStore.getState().nodes.length).toBe(2)

      // Redo should go forward to 3 nodes (index 1)
      useGraphStore.getState().redo()
      expect(useGraphStore.getState().nodes.length).toBe(3)
    })
  })
})
