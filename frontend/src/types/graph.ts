import type { Node, Edge } from '@xyflow/react'

// Node types available in the editor
export type NodeType = 'start' | 'end' | 'generate' | 'evaluate' | 'loop' | 'decision' | 'summary'

// Base data all nodes share
// Index signature required for xyflow Node<Data> constraint (Data extends Record<string, unknown>)
export interface BaseNodeData {
  label: string
  [key: string]: unknown
}

// Start node - entry point (pure lifecycle marker, no conversational behavior)
export interface StartNodeData extends BaseNodeData {}

// End node - conclusion (pure lifecycle marker, no conversational behavior)
export interface EndNodeData extends BaseNodeData {}

// Generate node - agents produce content
export interface GenerateNodeData extends BaseNodeData {
  prompt_template: string
  agent_selection: 'round_robin' | 'parallel' | 'specific'
  specific_agent_ids?: string[]
  max_turns: number
  turn_timeout_seconds?: number
}

// Evaluate node - agents vote/score
export interface EvaluateNodeData extends BaseNodeData {
  criteria: string[]
  voting_method: 'consensus' | 'majority' | 'score'
  min_score_threshold?: number
  evaluation_prompt?: string
}

// Loop node - counted iteration control
export interface LoopNodeData extends BaseNodeData {
  max_iterations: number
  loop_exit_condition?: string  // "evaluate_agree" | null
}

// Decision node - conditional branching based on evaluation
export interface DecisionNodeData extends BaseNodeData {
  condition: 'consensus_reached' | 'max_turns' | 'custom'
  custom_condition?: string  // Used when condition is 'custom'
  branches: string[]  // Labels for each branch output handle
}

// Summary node - synthesize discussion content
export interface SummaryNodeData extends BaseNodeData {
  summary_prompt: string
  include_in_context: boolean
  max_length?: number
}

// Union type for all node data
export type GraphNodeData =
  | StartNodeData
  | EndNodeData
  | GenerateNodeData
  | EvaluateNodeData
  | LoopNodeData
  | DecisionNodeData
  | SummaryNodeData

// Typed node for React Flow
export type GraphNode = Node<GraphNodeData, NodeType>

// Edge with optional label for conditional routing
export interface GraphEdge extends Edge {
  label?: string
  animated?: boolean
}

// Default node data factories
export const createDefaultNodeData = (type: NodeType): GraphNodeData => {
  switch (type) {
    case 'start':
      return {
        label: 'Start',
      } as StartNodeData
    case 'end':
      return {
        label: 'End',
      } as EndNodeData
    case 'generate':
      return {
        label: 'Generate',
        prompt_template: 'Given the topic: {topic}\n\nShare your thoughts and ideas.',
        agent_selection: 'round_robin',
        max_turns: 3,
      } as GenerateNodeData
    case 'evaluate':
      return {
        label: 'Evaluate',
        criteria: ['quality', 'relevance', 'feasibility'],
        voting_method: 'consensus',
        evaluation_prompt: 'Evaluate the ideas discussed so far.',
      } as EvaluateNodeData
    case 'loop':
      return {
        label: 'Loop',
        max_iterations: 3,
      } as LoopNodeData
    case 'decision':
      return {
        label: 'Decision',
        condition: 'consensus_reached',
        branches: ['agree', 'disagree'],
      } as DecisionNodeData
    case 'summary':
      return {
        label: 'Summary',
        summary_prompt: 'Summarize the key points and conclusions from the discussion so far.',
        include_in_context: true,
      } as SummaryNodeData
  }
}

// Node styling info
export const NODE_STYLES: Record<NodeType, { color: string; icon: string; description: string }> = {
  start: {
    color: '#22c55e',
    icon: 'Play',
    description: 'Discussion start',
  },
  end: {
    color: '#ef4444',
    icon: 'Square',
    description: 'Discussion end',
  },
  generate: {
    color: '#6366f1',
    icon: 'MessageSquare',
    description: 'Agents generate content in turns',
  },
  evaluate: {
    color: '#f59e0b',
    icon: 'Star',
    description: 'Agents evaluate and vote',
  },
  loop: {
    color: '#8b5cf6',
    icon: 'Repeat',
    description: 'Repeat a section multiple times',
  },
  decision: {
    color: '#ec4899',
    icon: 'GitBranch',
    description: 'Branch based on conditions',
  },
  summary: {
    color: '#14b8a6',
    icon: 'FileText',
    description: 'Synthesize discussion content',
  },
}
