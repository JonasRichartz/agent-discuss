import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMessages, useMessagesSince } from '@/hooks/use-api'
import { useDiscussionWebSocket, useTypingIndicatorText, type WSNewMessage } from '@/hooks/use-websocket'
import { useToast } from '@/hooks/use-toast'
import type { Message, DiscussionStatus } from '@/types'

interface UseDiscussionMessagesOptions {
  discussionId: string | undefined
  discussionStatus: DiscussionStatus | undefined
}

/**
 * Custom hook that manages discussion messages with WebSocket integration.
 *
 * Handles initial message loading, WebSocket real-time updates,
 * gap-filling via timestamp-based sync, and O(1) deduplication using a Map.
 */
export function useDiscussionMessages({ discussionId, discussionStatus }: UseDiscussionMessagesOptions) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: initialMessages, isLoading: isLoadingMessages } = useMessages(discussionId)

  // Unified state - single source of truth using Map for O(1) deduplication
  const [messages, setMessages] = useState<Map<string, Message>>(new Map())
  const [wsConnectTime, setWsConnectTime] = useState<string | undefined>(undefined)
  const hasInitializedRef = useRef(false)
  const prevDiscussionIdRef = useRef<string | undefined>(undefined)

  // Fetch synced messages created during WebSocket connection window
  const { data: syncedMessages } = useMessagesSince(discussionId, wsConnectTime)

  // Initialize from API messages — also clears state when discussionId changes
  useEffect(() => {
    // Clear state synchronously when the discussion changes, before loading new messages
    if (prevDiscussionIdRef.current !== discussionId) {
      prevDiscussionIdRef.current = discussionId
      setMessages(new Map())
      setWsConnectTime(undefined)
      hasInitializedRef.current = false
    }

    if (initialMessages && initialMessages.length > 0) {
      setMessages((prev) => {
        const newMap = new Map(prev)
        initialMessages.forEach((msg) => newMap.set(msg.id, msg))
        return newMap
      })
      hasInitializedRef.current = true
    }
  }, [initialMessages, discussionId])

  // Add synced messages
  useEffect(() => {
    if (syncedMessages && syncedMessages.length > 0) {
      setMessages((prev) => {
        const newMap = new Map(prev)
        syncedMessages.forEach((msg) => newMap.set(msg.id, msg))
        return newMap
      })
    }
  }, [syncedMessages])

  // Convert Map to sorted array
  const messageList = useMemo(() => {
    return Array.from(messages.values()).sort(
      (a, b) => a.sequence_number - b.sequence_number
    )
  }, [messages])

  // Handle new WebSocket message with deduplication
  const handleNewMessage = useCallback((wsMessage: WSNewMessage['message']) => {
    setMessages((prev) => {
      if (prev.has(wsMessage.id)) return prev
      const newMap = new Map(prev)
      newMap.set(wsMessage.id, {
        id: wsMessage.id,
        discussion_id: discussionId!,
        agent_id: wsMessage.agent_id,
        content: wsMessage.content,
        message_type: wsMessage.message_type as Message['message_type'],
        sequence_number: wsMessage.sequence_number,
        graph_node_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
        agents: wsMessage.agent_name ? {
          name: wsMessage.agent_name,
          avatar_emoji: wsMessage.avatar_emoji || '',
          avatar_color: wsMessage.avatar_color || '#6366f1',
        } : undefined,
      })
      return newMap
    })
  }, [discussionId])

  // Record connection time for sync
  const handleConnect = useCallback(() => {
    setWsConnectTime(new Date().toISOString())
  }, [])

  // Handle status change from WebSocket
  const handleStatusChange = useCallback((newStatus: DiscussionStatus) => {
    queryClient.invalidateQueries({ queryKey: ['discussions', discussionId] })
    if (newStatus === 'running' || newStatus === 'completed') {
      hasInitializedRef.current = false
      queryClient.invalidateQueries({ queryKey: ['messages', discussionId] })
    }
    if (newStatus === 'completed') {
      toast({ title: 'Discussion completed' })
    } else if (newStatus === 'failed') {
      toast({ title: 'Discussion failed', variant: 'destructive' })
    }
  }, [discussionId, queryClient, toast])

  // WebSocket connection
  const needsWebSocket = discussionStatus === 'running' || discussionStatus === 'paused'
  const { status: wsStatus, typingAgents, sendControl } = useDiscussionWebSocket(
    needsWebSocket ? discussionId : undefined,
    {
      onMessage: handleNewMessage,
      onStatusChange: handleStatusChange,
      onConnect: handleConnect,
      onError: (message) => toast({ title: 'WebSocket error', description: message, variant: 'destructive' }),
    }
  )

  const typingText = useTypingIndicatorText(typingAgents)

  // Refresh function
  const refresh = useCallback(async () => {
    setMessages(new Map())
    setWsConnectTime(undefined)
    hasInitializedRef.current = false
    await queryClient.invalidateQueries({ queryKey: ['messages', discussionId] })
    await queryClient.invalidateQueries({ queryKey: ['discussions', discussionId] })
  }, [discussionId, queryClient])

  return {
    messageList,
    isLoadingMessages,
    wsStatus,
    typingAgents,
    typingText,
    sendControl,
    refresh,
  }
}
