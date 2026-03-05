import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import type { GraphNode, GraphEdge, NodeType, GraphNodeData } from '@/types/graph'
import { createDefaultNodeData } from '@/types/graph'

let nodeIdCounter = 0

const generateNodeId = () => `node_${++nodeIdCounter}`
const generateEdgeId = (source: string, target: string) => `edge_${source}_${target}`

export interface ValidationMessage {
  type: 'error' | 'warning'
  message: string
  nodeId?: string
}

interface GraphState {
  // Graph data
  nodes: GraphNode[]
  edges: GraphEdge[]

  // Selection
  selectedNodeId: string | null
  selectedEdgeId: string | null

  // Actions
  setNodes: (nodes: GraphNode[]) => void
  setEdges: (edges: GraphEdge[]) => void
  onNodesChange: (changes: NodeChange<GraphNode>[]) => void
  onEdgesChange: (changes: EdgeChange<GraphEdge>[]) => void
  onConnect: (connection: Connection) => void

  // Node operations
  addNode: (type: NodeType, position: { x: number; y: number }) => string
  updateNodeData: (nodeId: string, data: Partial<GraphNodeData>) => void
  deleteNode: (nodeId: string) => void

  // Edge operations
  updateEdgeLabel: (edgeId: string, label: string) => void
  deleteEdge: (edgeId: string) => void

  // Selection
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void

  // Graph operations
  loadGraph: (nodes: GraphNode[], edges: GraphEdge[]) => void
  clearGraph: () => void
  getGraphDefinition: () => { nodes: GraphNode[]; edges: GraphEdge[] }

  // Validation
  isValidConnection: (connection: Connection) => boolean
  validateGraph: () => ValidationMessage[]

  // History
  history: Array<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  historyIndex: number
  undo: () => void
  redo: () => void
}

// Default graph with just a start and end node
const createDefaultGraph = (): { nodes: GraphNode[]; edges: GraphEdge[] } => ({
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
  ],
  edges: [
    {
      id: 'edge_start_end',
      source: 'start',
      target: 'end',
    },
  ],
})

export const useGraphStore = create<GraphState>((set, get) => {
  const pushHistory = () => {
    const { nodes, edges, history, historyIndex } = get()
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  }

  return {
  // Initial state
  ...createDefaultGraph(),
  selectedNodeId: null,
  selectedEdgeId: null,
  history: [],
  historyIndex: -1,

  // Setters
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  // React Flow change handlers
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as GraphNode[],
    })
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges) as GraphEdge[],
    })
  },

  onConnect: (connection) => {
    if (!get().isValidConnection(connection)) return

    pushHistory()
    const newEdge: GraphEdge = {
      id: generateEdgeId(connection.source!, connection.target!),
      source: connection.source!,
      target: connection.target!,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
    }
    set({
      edges: addEdge(newEdge, get().edges) as GraphEdge[],
    })
  },

  // Node operations
  addNode: (type, position) => {
    pushHistory()
    const id = generateNodeId()
    const newNode: GraphNode = {
      id,
      type,
      position,
      data: createDefaultNodeData(type),
    }
    set({
      nodes: [...get().nodes, newNode],
      selectedNodeId: id,
    })
    return id
  },

  updateNodeData: (nodeId, data) => {
    pushHistory()
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
    })
  },

  deleteNode: (nodeId) => {
    // Don't allow deleting start or end nodes
    if (nodeId === 'start' || nodeId === 'end') return

    pushHistory()
    set({
      nodes: get().nodes.filter((node) => node.id !== nodeId),
      edges: get().edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    })
  },

  // Edge operations
  updateEdgeLabel: (edgeId, label) => {
    pushHistory()
    set({
      edges: get().edges.map((edge) =>
        edge.id === edgeId ? { ...edge, label } : edge
      ),
    })
  },

  deleteEdge: (edgeId) => {
    pushHistory()
    set({
      edges: get().edges.filter((edge) => edge.id !== edgeId),
      selectedEdgeId: get().selectedEdgeId === edgeId ? null : get().selectedEdgeId,
    })
  },

  // Selection
  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId, selectedEdgeId: null })
  },

  selectEdge: (edgeId) => {
    set({ selectedEdgeId: edgeId, selectedNodeId: null })
  },

  // Graph operations
  loadGraph: (nodes, edges) => {
    // Reset the counter based on existing nodes
    const maxId = nodes.reduce((max, node) => {
      const match = node.id.match(/node_(\d+)/)
      return match ? Math.max(max, parseInt(match[1])) : max
    }, 0)
    nodeIdCounter = maxId

    set({
      nodes,
      edges,
      selectedNodeId: null,
      selectedEdgeId: null,
    })
  },

  clearGraph: () => {
    pushHistory()
    nodeIdCounter = 0
    set({
      ...createDefaultGraph(),
      selectedNodeId: null,
      selectedEdgeId: null,
    })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    const snapshot = history[newIndex]
    set({
      nodes: structuredClone(snapshot.nodes),
      edges: structuredClone(snapshot.edges),
      historyIndex: newIndex,
      selectedNodeId: null,
      selectedEdgeId: null,
    })
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const newIndex = historyIndex + 1
    const snapshot = history[newIndex]
    set({
      nodes: structuredClone(snapshot.nodes),
      edges: structuredClone(snapshot.edges),
      historyIndex: newIndex,
      selectedNodeId: null,
      selectedEdgeId: null,
    })
  },

  isValidConnection: (connection) => {
    const { nodes, edges } = get()
    const source = connection.source
    const target = connection.target

    if (!source || !target) return false

    // No self-connections
    if (source === target) return false

    const sourceNode = nodes.find((n) => n.id === source)
    const targetNode = nodes.find((n) => n.id === target)
    if (!sourceNode || !targetNode) return false

    // End nodes can't have outgoing edges
    if (sourceNode.type === 'end') return false

    // Start nodes can't have incoming edges
    if (targetNode.type === 'start') return false

    // No duplicate edges (same source + target)
    const duplicate = edges.some(
      (e) => e.source === source && e.target === target
    )
    if (duplicate) return false

    return true
  },

  validateGraph: () => {
    const { nodes, edges } = get()
    const messages: ValidationMessage[] = []

    // Check for exactly one start node
    const startNodes = nodes.filter((n) => n.type === 'start')
    if (startNodes.length === 0) {
      messages.push({ type: 'error', message: 'Graph must have a start node' })
    } else if (startNodes.length > 1) {
      messages.push({ type: 'error', message: 'Graph must have exactly one start node' })
    }

    // Check for at least one end node
    const endNodes = nodes.filter((n) => n.type === 'end')
    if (endNodes.length === 0) {
      messages.push({ type: 'error', message: 'Graph must have at least one end node' })
    }

    // Check loop nodes have exactly 2 outgoing edges
    const loopNodes = nodes.filter((n) => n.type === 'loop')
    for (const loopNode of loopNodes) {
      const outgoing = edges.filter((e) => e.source === loopNode.id)
      if (outgoing.length !== 2) {
        messages.push({
          type: 'error',
          message: `Loop node "${loopNode.data.label}" must have exactly 2 outgoing edges (repeat and done)`,
          nodeId: loopNode.id,
        })
      }
    }

    // Check decision nodes have at least 2 outgoing edges
    const decisionNodes = nodes.filter((n) => n.type === 'decision')
    for (const decisionNode of decisionNodes) {
      const outgoing = edges.filter((e) => e.source === decisionNode.id)
      if (outgoing.length < 2) {
        messages.push({
          type: 'error',
          message: `Decision node "${decisionNode.data.label}" must have at least 2 outgoing edges (one per branch)`,
          nodeId: decisionNode.id,
        })
      }
    }

    // Check every non-end node has at least one outgoing edge (warning)
    for (const node of nodes) {
      if (node.type === 'end') continue
      const outgoing = edges.filter((e) => e.source === node.id)
      if (outgoing.length === 0) {
        messages.push({
          type: 'warning',
          message: `Node "${node.data.label}" has no outgoing edges`,
          nodeId: node.id,
        })
      }
    }

    // Check all nodes reachable from start
    if (startNodes.length === 1) {
      const reachable = new Set<string>()
      const queue = [startNodes[0].id]
      while (queue.length > 0) {
        const current = queue.pop()!
        if (reachable.has(current)) continue
        reachable.add(current)
        for (const edge of edges) {
          if (edge.source === current && !reachable.has(edge.target)) {
            queue.push(edge.target)
          }
        }
      }

      for (const node of nodes) {
        if (!reachable.has(node.id)) {
          messages.push({
            type: 'error',
            message: `Node "${node.data.label}" is not reachable from start`,
            nodeId: node.id,
          })
        }
      }
    }

    // Check for orphaned nodes (no edges at all)
    for (const node of nodes) {
      const hasEdge = edges.some(
        (e) => e.source === node.id || e.target === node.id
      )
      if (!hasEdge) {
        messages.push({
          type: 'error',
          message: `Node "${node.data.label}" has no connections`,
          nodeId: node.id,
        })
      }
    }

    return messages
  },

  getGraphDefinition: () => ({
    nodes: get().nodes,
    edges: get().edges,
  }),
}})
