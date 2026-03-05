// LLM Provider types
export interface LLMProvider {
  id: string
  name: string
  base_url: string
  available_models: string[]
  is_default: boolean
  embedding_model: string | null
}

export interface LLMProviderCreate {
  name: string
  base_url: string
  api_key?: string
  available_models: string[]
  is_default?: boolean
  embedding_model?: string | null
}

// Agent types
export interface Agent {
  id: string
  name: string
  description: string | null
  system_prompt: string
  llm_provider_id: string | null
  model_name: string | null
  temperature: number
  max_tokens: number
  avatar_color: string
  avatar_emoji: string
}

export interface AgentCreate {
  name: string
  description?: string
  system_prompt: string
  llm_provider_id?: string
  model_name?: string
  temperature?: number
  max_tokens?: number
  avatar_color?: string
  avatar_emoji?: string
}

// Agent Template alias (for clarity in UI)
export type AgentTemplate = Agent

// Discussion Participant types (new architecture)
export interface DiscussionParticipant {
  id: string
  discussion_id: string
  name: string
  system_prompt: string
  provider_id: string
  model_name: string  // Per-participant model (user enters manually)
  temperature: number
  max_tokens: number
  avatar_color: string
  avatar_emoji: string
  role: string | null
  order_index: number
  created_at: string
  updated_at: string
  llm_providers?: {
    name: string
  }
}

export interface ParticipantCreate {
  name: string
  system_prompt: string
  provider_id: string
  model_name: string
  temperature?: number
  max_tokens?: number
  avatar_color?: string
  avatar_emoji?: string
  role?: string
}

export interface ParticipantUpdate {
  name?: string
  system_prompt?: string
  provider_id?: string
  model_name?: string
  temperature?: number
  max_tokens?: number
  avatar_color?: string
  avatar_emoji?: string
  role?: string
}

// Discussion types
export type DiscussionStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed'

export interface Discussion {
  id: string
  title: string
  topic: string
  description: string | null
  status: DiscussionStatus
  graph_definition: GraphDefinition
  web_search_enabled: boolean
  created_at: string
}

export interface DiscussionDetail extends Discussion {
  execution_state: Record<string, unknown> | null
  context_summary: string | null
  started_at: string | null
  completed_at: string | null
}

export interface DiscussionCreate {
  title: string
  topic: string
  description?: string
  graph_definition: GraphDefinition
  web_search_enabled?: boolean
}

export interface DiscussionUpdate {
  title?: string
  topic?: string
  description?: string
  graph_definition?: GraphDefinition
  web_search_enabled?: boolean
}

// Graph types
export interface GraphNode {
  id: string
  type: 'start' | 'end' | 'generate' | 'evaluate' | 'loop' | 'decision' | 'summary'
  label: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface GraphDefinition {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Template types
export interface GraphTemplate {
  id: string
  name: string
  description: string | null
  graph_definition: GraphDefinition
  is_system: boolean
}

// Message types
export type MessageType = 'agent_message' | 'system_message' | 'node_transition' | 'summary' | 'error'

export interface Message {
  id: string
  discussion_id: string
  agent_id: string | null
  message_type: MessageType
  content: string
  graph_node_id: string | null
  metadata: Record<string, unknown>
  sequence_number: number
  created_at: string
  agents?: {
    name: string
    avatar_color: string
    avatar_emoji: string
  }
}

// Document types
export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed'

export interface Document {
  id: string
  filename: string
  original_filename: string
  mime_type: string
  file_size: number
  status: DocumentStatus
  chunk_count: number
  error_message: string | null
  created_at: string
}

// Profile types
export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  preferences: {
    theme?: 'light' | 'dark'
    tavily_api_key?: string
  }
}
