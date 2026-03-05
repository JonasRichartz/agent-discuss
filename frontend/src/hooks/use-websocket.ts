/**
 * WebSocket hooks for real-time discussion updates.
 *
 * Provides connection management, automatic reconnection,
 * and typed message handling.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'

// WebSocket message types from server
export interface WSConnectedMessage {
  type: 'connected'
  discussion_id: string
}

export interface WSNewMessage {
  type: 'message'
  message: {
    id: string
    agent_id: string | null
    agent_name: string | null
    content: string
    message_type: string
    sequence_number: number
    avatar_color?: string
    avatar_emoji?: string
  }
}

export interface WSTypingMessage {
  type: 'typing'
  agent_id: string
  agent_name: string
  is_typing: boolean
}

export interface WSStatusMessage {
  type: 'status'
  status: 'running' | 'paused' | 'completed' | 'failed'
  data?: Record<string, unknown>
}

export interface WSErrorMessage {
  type: 'error'
  message: string
}

export interface WSPongMessage {
  type: 'pong'
}

export interface WSControlAckMessage {
  type: 'control_ack'
  action: string
  status: string
}

export type WSMessage =
  | WSConnectedMessage
  | WSNewMessage
  | WSTypingMessage
  | WSStatusMessage
  | WSErrorMessage
  | WSPongMessage
  | WSControlAckMessage

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface UseDiscussionWebSocketOptions {
  onMessage?: (message: WSNewMessage['message']) => void
  onTyping?: (agentId: string, agentName: string, isTyping: boolean) => void
  onStatusChange?: (status: WSStatusMessage['status'], data?: Record<string, unknown>) => void
  onError?: (message: string) => void
  onConnect?: () => void
  onDisconnect?: () => void
  autoReconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

/**
 * Hook for real-time discussion updates via WebSocket.
 *
 * Automatically connects when discussionId is provided and
 * handles reconnection on disconnect.
 */
export function useDiscussionWebSocket(
  discussionId: string | undefined,
  options: UseDiscussionWebSocketOptions = {}
) {
  const {
    onMessage,
    onTyping,
    onStatusChange,
    onError,
    onConnect,
    onDisconnect,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options

  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [typingAgents, setTypingAgents] = useState<Map<string, string>>(new Map())

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const session = useAuthStore((state) => state.session)
  const accessToken = session?.access_token

  // Store callbacks in refs to avoid reconnection on callback changes
  const callbacksRef = useRef({
    onMessage,
    onTyping,
    onStatusChange,
    onError,
    onConnect,
    onDisconnect,
  })

  useEffect(() => {
    callbacksRef.current = {
      onMessage,
      onTyping,
      onStatusChange,
      onError,
      onConnect,
      onDisconnect,
    }
  }, [onMessage, onTyping, onStatusChange, onError, onConnect, onDisconnect])

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!discussionId || !accessToken) {
      return
    }

    cleanup()
    setStatus('connecting')

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = import.meta.env.VITE_API_URL?.replace(/^https?:\/\//, '') || window.location.host
    const wsUrl = `${protocol}//${host}/api/v1/ws/discussions/${discussionId}?token=${accessToken}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      reconnectAttemptsRef.current = 0
      callbacksRef.current.onConnect?.()

      // Start ping interval to keep connection alive
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000) // Ping every 30 seconds
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage

        switch (data.type) {
          case 'connected':
            // Connection confirmed by server
            break

          case 'message':
            callbacksRef.current.onMessage?.(data.message)
            break

          case 'typing':
            setTypingAgents((prev) => {
              const next = new Map(prev)
              if (data.is_typing) {
                next.set(data.agent_id, data.agent_name)
              } else {
                next.delete(data.agent_id)
              }
              return next
            })
            callbacksRef.current.onTyping?.(data.agent_id, data.agent_name, data.is_typing)
            break

          case 'status':
            callbacksRef.current.onStatusChange?.(data.status, data.data)
            break

          case 'error':
            callbacksRef.current.onError?.(data.message)
            break

          case 'pong':
            // Keep-alive response, no action needed
            break

          case 'control_ack':
            // Control command acknowledged
            break
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.onclose = (event) => {
      setStatus('disconnected')
      callbacksRef.current.onDisconnect?.()

      // Clear ping interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }

      // Only reconnect for unexpected disconnects (not normal close, auth failure, or page unload)
      const shouldReconnect =
        autoReconnect &&
        event.code !== 1000 && // Normal close
        event.code !== 1001 && // Going away (page navigation/reload)
        event.code !== 1005 && // No status (browser killed connection)
        event.code !== 1008    // Policy violation (auth failure)

      if (shouldReconnect) {
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, reconnectInterval)
        } else {
          setStatus('error')
        }
      }
    }

    ws.onerror = () => {
      // Only set error if we weren't already trying to disconnect
      if (wsRef.current === ws) {
        setStatus('error')
      }
    }
  }, [discussionId, accessToken, cleanup, autoReconnect, reconnectInterval, maxReconnectAttempts])

  // Connect when discussionId or token changes
  useEffect(() => {
    if (discussionId && accessToken) {
      connect()
    }

    return cleanup
  }, [discussionId, accessToken, connect, cleanup])

  // Send control command
  const sendControl = useCallback((action: 'pause' | 'stop') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', action }))
    }
  }, [])

  // Manual reconnect
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0
    connect()
  }, [connect])

  // Disconnect
  const disconnect = useCallback(() => {
    cleanup()
    setStatus('disconnected')
  }, [cleanup])

  return {
    status,
    typingAgents: Array.from(typingAgents.entries()).map(([id, name]) => ({ id, name })),
    sendControl,
    reconnect,
    disconnect,
  }
}

/**
 * Hook for typing indicator display text.
 */
export function useTypingIndicatorText(
  typingAgents: Array<{ id: string; name: string }>
): string {
  if (typingAgents.length === 0) {
    return ''
  }

  if (typingAgents.length === 1) {
    return `${typingAgents[0].name} is thinking...`
  }

  if (typingAgents.length === 2) {
    return `${typingAgents[0].name} and ${typingAgents[1].name} are thinking...`
  }

  return `${typingAgents[0].name} and ${typingAgents.length - 1} others are thinking...`
}
