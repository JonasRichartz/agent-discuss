import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import type {
  LLMProvider,
  LLMProviderCreate,
  Agent,
  AgentCreate,
  Discussion,
  DiscussionDetail,
  DiscussionCreate,
  DiscussionParticipant,
  ParticipantCreate,
  ParticipantUpdate,
  GraphTemplate,
  Message,
  Document,
  Profile,
} from '@/types'

// Helper to get token
function useToken() {
  const { session } = useAuthStore()
  return session?.access_token
}

// ============ LLM Providers ============

export function useLLMProviders() {
  const token = useToken()
  return useQuery({
    queryKey: ['llm-providers'],
    queryFn: () => api.get<LLMProvider[]>('/llm-providers', token),
    enabled: !!token,
  })
}

export function useCreateLLMProvider() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: LLMProviderCreate) =>
      api.post<LLMProvider>('/llm-providers', data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
    },
  })
}

export function useUpdateLLMProvider() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LLMProviderCreate> }) =>
      api.patch<LLMProvider>(`/llm-providers/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
    },
  })
}

export function useDeleteLLMProvider() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/llm-providers/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
    },
  })
}

export function useTestLLMProvider() {
  const token = useToken()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string; message: string; response?: string }>(
        `/llm-providers/${id}/test`,
        undefined,
        token
      ),
  })
}

// ============ Agents ============

export function useAgents() {
  const token = useToken()
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/agents', token),
    enabled: !!token,
  })
}

export function useCreateAgent() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: AgentCreate) => api.post<Agent>('/agents', data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useUpdateAgent() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AgentCreate> }) =>
      api.patch<Agent>(`/agents/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useDeleteAgent() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useTestAgent() {
  const token = useToken()

  return useMutation({
    mutationFn: ({ id, prompt }: { id: string; prompt?: string }) =>
      api.post<{ status: string; response?: string; message?: string }>(
        `/agents/${id}/test${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ''}`,
        undefined,
        token
      ),
  })
}

// ============ Discussions ============

export function useDiscussions() {
  const token = useToken()
  return useQuery({
    queryKey: ['discussions'],
    queryFn: () => api.get<Discussion[]>('/discussions', token),
    enabled: !!token,
  })
}

export function useDiscussion(id: string | undefined) {
  const token = useToken()
  return useQuery({
    queryKey: ['discussions', id],
    queryFn: () => api.get<DiscussionDetail>(`/discussions/${id}`, token),
    enabled: !!token && !!id,
  })
}

export function useCreateDiscussion() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: DiscussionCreate) =>
      api.post<Discussion>('/discussions', data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
    },
  })
}

export function useUpdateDiscussion() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DiscussionCreate> }) =>
      api.patch<Discussion>(`/discussions/${id}`, data, token),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      queryClient.invalidateQueries({ queryKey: ['discussions', id] })
    },
  })
}

export function useDeleteDiscussion() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/discussions/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
    },
  })
}

export function useStartDiscussion() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string }>(`/discussions/${id}/start`, undefined, token),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      queryClient.invalidateQueries({ queryKey: ['discussions', id] })
      queryClient.invalidateQueries({ queryKey: ['messages', id] })
    },
  })
}

export function usePauseDiscussion() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string }>(`/discussions/${id}/pause`, undefined, token),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      queryClient.invalidateQueries({ queryKey: ['discussions', id] })
    },
  })
}

export function useStopDiscussion() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string }>(`/discussions/${id}/stop`, undefined, token),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      queryClient.invalidateQueries({ queryKey: ['discussions', id] })
    },
  })
}

export function useResetDiscussion() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string }>(`/discussions/${id}/reset`, undefined, token),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      queryClient.invalidateQueries({ queryKey: ['discussions', id] })
      queryClient.invalidateQueries({ queryKey: ['messages', id] })
    },
  })
}

// ============ Messages ============

/** Populate agents display info from metadata when the DB join is empty. */
function enrichMessages(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (msg.agents || msg.message_type !== 'agent_message') return msg
    const meta = msg.metadata as Record<string, string> | undefined
    if (!meta?.participant_name) return msg
    return {
      ...msg,
      agents: {
        name: meta.participant_name,
        avatar_color: (meta.participant_avatar_color as string) || '#6366f1',
        avatar_emoji: (meta.participant_avatar_emoji as string) || '',
      },
    }
  })
}

export function useMessages(discussionId: string | undefined, limit = 1000, offset = 0) {
  const token = useToken()
  return useQuery({
    queryKey: ['messages', discussionId, limit, offset],
    queryFn: async () => {
      const messages = await api.get<Message[]>(
        `/discussions/${discussionId}/messages?limit=${limit}&offset=${offset}`,
        token
      )
      return enrichMessages(messages)
    },
    enabled: !!token && !!discussionId,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

export function useMessagesSince(
  discussionId: string | undefined,
  since: string | undefined
) {
  const token = useToken()
  return useQuery({
    queryKey: ['messages-since', discussionId, since],
    queryFn: async () => {
      const messages = await api.get<Message[]>(
        `/discussions/${discussionId}/messages/since?since=${encodeURIComponent(since!)}`,
        token
      )
      return enrichMessages(messages)
    },
    enabled: !!token && !!discussionId && !!since,
    staleTime: 0,
  })
}

// ============ Participants ============

export function useDiscussionParticipants(discussionId: string | undefined) {
  const token = useToken()
  return useQuery({
    queryKey: ['participants', discussionId],
    queryFn: () =>
      api.get<DiscussionParticipant[]>(
        `/discussions/${discussionId}/participants`,
        token
      ),
    enabled: !!token && !!discussionId,
  })
}

export function useCreateParticipant(discussionId: string) {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: ParticipantCreate) =>
      api.post<DiscussionParticipant>(
        `/discussions/${discussionId}/participants`,
        data,
        token
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants', discussionId] })
      queryClient.invalidateQueries({ queryKey: ['discussions', discussionId] })
    },
  })
}

export function useUpdateParticipant(discussionId: string) {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ participantId, data }: { participantId: string; data: ParticipantUpdate }) =>
      api.patch<DiscussionParticipant>(
        `/discussions/${discussionId}/participants/${participantId}`,
        data,
        token
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants', discussionId] })
    },
  })
}

export function useDeleteParticipant(discussionId: string) {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (participantId: string) =>
      api.delete(`/discussions/${discussionId}/participants/${participantId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants', discussionId] })
      queryClient.invalidateQueries({ queryKey: ['discussions', discussionId] })
    },
  })
}

export function useCreateParticipantFromTemplate(discussionId: string) {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: string) =>
      api.post<DiscussionParticipant>(
        `/discussions/${discussionId}/participants/from-template/${agentId}`,
        undefined,
        token
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants', discussionId] })
      queryClient.invalidateQueries({ queryKey: ['discussions', discussionId] })
    },
  })
}

// Agent Templates (alias for clarity)
export const useAgentTemplates = useAgents

// ============ Templates ============

export function useTemplates() {
  const token = useToken()
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<GraphTemplate[]>('/templates', token),
    enabled: !!token,
  })
}

// ============ Profile ============

export function useProfile() {
  const token = useToken()
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/profile', token),
    enabled: !!token,
  })
}

export function useUpdateProfile() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<Profile>) =>
      api.patch<Profile>('/profile', data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useUpdatePreferences() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<Profile['preferences']>) =>
      api.patch<Profile>('/profile/preferences', data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

// ============ Documents ============

export function useDocuments() {
  const token = useToken()
  const query = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<Document[]>('/documents', token),
    enabled: !!token,
    refetchInterval: (query) => {
      const docs = query.state.data
      const hasProcessing = docs?.some((d) => d.status === 'processing' || d.status === 'uploading')
      return hasProcessing ? 3000 : false
    },
  })
  return query
}

export function useDocument(documentId: string | undefined) {
  const token = useToken()
  return useQuery({
    queryKey: ['document', documentId],
    queryFn: () => api.get<Document>(`/documents/${documentId}`, token),
    enabled: !!token && !!documentId,
  })
}

export function useUploadDocument() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)

      const baseUrl = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${baseUrl}/api/v1/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Upload failed')
      }

      return response.json() as Promise<Document>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

export function useDeleteDocument() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (documentId: string) =>
      api.delete(`/documents/${documentId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

export function useDiscussionDocuments(discussionId: string | undefined) {
  const token = useToken()
  return useQuery({
    queryKey: ['discussion-documents', discussionId],
    queryFn: () =>
      api.get<Document[]>(`/documents/discussions/${discussionId}/documents`, token),
    enabled: !!token && !!discussionId,
  })
}

export function useLinkDocument() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ discussionId, documentId }: { discussionId: string; documentId: string }) =>
      api.post(`/documents/discussions/${discussionId}/documents`, { document_id: documentId }, token),
    onSuccess: (_, { discussionId }) => {
      queryClient.invalidateQueries({ queryKey: ['discussion-documents', discussionId] })
    },
  })
}

export function useUnlinkDocument() {
  const token = useToken()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ discussionId, documentId }: { discussionId: string; documentId: string }) =>
      api.delete(`/documents/discussions/${discussionId}/documents/${documentId}`, token),
    onSuccess: (_, { discussionId }) => {
      queryClient.invalidateQueries({ queryKey: ['discussion-documents', discussionId] })
    },
  })
}
