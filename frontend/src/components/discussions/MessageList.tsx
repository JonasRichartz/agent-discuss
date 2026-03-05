import { useRef, useEffect, useCallback, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowDown, MessageSquareText } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { getInitials } from '@/lib/utils'
import type { Message, DiscussionStatus } from '@/types'

interface MessageListProps {
  discussionId: string | undefined
  discussionStatus: DiscussionStatus
  messageList: Message[]
  isLoadingMessages: boolean
  typingAgents: Array<{ id: string; name: string }>
  typingText: string
}

export function MessageList({
  discussionId,
  discussionStatus,
  messageList,
  isLoadingMessages,
  typingAgents,
  typingText,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isScrolledUp = distanceFromBottom > 100
    userScrolledUpRef.current = isScrolledUp
    setShowScrollButton(isScrolledUp)
  }, [])

  const scrollToBottom = useCallback((force = false) => {
    if (!force && userScrolledUpRef.current) return
    const el = scrollContainerRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    userScrolledUpRef.current = false
    setShowScrollButton(false)
  }, [discussionId])

  useEffect(() => {
    if (messageList.length > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom()))
    }
  }, [messageList.length, scrollToBottom])

  return (
    <div className="flex-1 min-h-0 relative">
      <div
        ref={scrollContainerRef}
        className="absolute inset-0 overflow-y-auto chat-scrollbar"
        onScroll={handleScroll}
      >
        {isLoadingMessages ? (
          <div className="max-w-4xl mx-auto px-4 py-5">
            <MessageSkeleton />
            <MessageSkeleton />
            <MessageSkeleton />
          </div>
        ) : messageList.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center mb-4">
                <MessageSquareText className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-base font-medium text-foreground/80">No messages yet</p>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-[280px]">
                {discussionStatus === 'running'
                  ? 'Waiting for the first response...'
                  : 'Start the discussion to see agents exchange ideas'}
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 pt-5 pb-4">
            {messageList.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}

            {typingAgents.length > 0 && (
              <TypingIndicator text={typingText} />
            )}

            <div ref={scrollAnchorRef} className="h-1" />
          </div>
        )}
      </div>

      {showScrollButton && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
            bg-background/95 backdrop-blur-sm border shadow-elevated rounded-full
            px-3.5 py-1.5 flex items-center gap-1.5
            hover:bg-accent transition-all text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowDown className="h-3 w-3" />
          New messages
        </button>
      )}
    </div>
  )
}

function MessageSkeleton() {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-4 mb-3">
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
    </div>
  )
}

function TypingIndicator({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 mb-3 rounded-lg bg-muted/30 border border-border/30">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-muted-foreground">{text}</span>
    </div>
  )
}

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: (props: any) => (
    <div className="overflow-x-auto rounded-lg border border-border my-3">
      <table className="msg-table">{props.children}</table>
    </div>
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pre: (props: any) => (
    <div className="relative group/code">
      <pre className="msg-code-block">{props.children}</pre>
    </div>
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: (props: any) => (
    <a href={props.href} target="_blank" rel="noopener noreferrer" className="msg-link">
      {props.children}
    </a>
  ),
}

function MessageRow({ message }: { message: Message }) {
  const isSystem = message.message_type !== 'agent_message'
  const agent = message.agents

  if (isSystem) {
    return (
      <div className="flex justify-center py-4">
        <span className="text-[11px] text-muted-foreground/70 bg-muted/40 px-4 py-1 rounded-full font-medium tracking-wide uppercase">
          {message.content}
        </span>
      </div>
    )
  }

  const meta = message.metadata as Record<string, string> | undefined
  const displayName = agent?.name || meta?.participant_name || 'Unknown'
  const avatarColor = agent?.avatar_color || meta?.participant_avatar_color || '#6366f1'
  const avatarEmoji = agent?.avatar_emoji || meta?.participant_avatar_emoji || ''

  return (
    <div
      className="group mb-3 animate-slide-up rounded-lg border border-border/40 bg-card/30 hover:bg-card/50 transition-colors"
      style={{ borderLeftWidth: '3px', borderLeftColor: avatarColor + '60' }}
    >
      <div className="p-4">
        <div className="flex gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 shadow-soft"
            style={{
              backgroundColor: avatarColor + '15',
              color: avatarColor,
              border: `1.5px solid ${avatarColor}25`,
            }}
          >
            {avatarEmoji || getInitials(displayName)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-sm" style={{ color: avatarColor }}>
                {displayName}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="msg-markdown text-sm leading-relaxed text-foreground/90">
              <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>{message.content}</Markdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
