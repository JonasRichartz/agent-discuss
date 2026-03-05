import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDiscussion, useDiscussionParticipants, useStartDiscussion, usePauseDiscussion, useStopDiscussion, useResetDiscussion, useUpdateDiscussion, useDeleteDiscussion, useDiscussionDocuments } from '@/hooks/use-api'
import { useDiscussionMessages } from '@/hooks/use-discussion-messages'
import { usePausePolling } from '@/hooks/use-pause-polling'
import { useGraphStore } from '@/stores/graphStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { GraphEditorPanel } from '@/components/graph-editor'
import { DocumentList } from '@/components/documents'
import { ParticipantManager } from '@/components/discussions/ParticipantManager'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Play, Pause, Square, Loader2, ArrowDown, Download, MoreHorizontal, Pencil, Trash2, FileText, ChevronDown, ChevronRight, Eraser, MessageSquareText, Users } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/constants'
import type { Message, GraphDefinition } from '@/types'
import type { GraphNode, GraphEdge } from '@/types/graph'

export function DiscussionView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: discussion, isLoading: isLoadingDiscussion } = useDiscussion(id)
  const { data: participants } = useDiscussionParticipants(id)
  const startDiscussion = useStartDiscussion()
  const pauseDiscussion = usePauseDiscussion()
  const stopDiscussion = useStopDiscussion()
  const resetDiscussion = useResetDiscussion()
  const updateDiscussion = useUpdateDiscussion()
  const deleteDiscussion = useDeleteDiscussion()
  const loadGraph = useGraphStore((state) => state.loadGraph)
  const clearGraph = useGraphStore((state) => state.clearGraph)
  const { toast } = useToast()
  const [isPausing, setIsPausing] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showParticipants, setShowParticipants] = useState(true)
  const [showDocuments, setShowDocuments] = useState(false)
  const { data: linkedDocuments } = useDiscussionDocuments(id)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  // Delegate message state management to custom hook
  const {
    messageList,
    isLoadingMessages,
    wsStatus,
    typingAgents,
    typingText,
    sendControl,
  } = useDiscussionMessages({
    discussionId: id,
    discussionStatus: discussion?.status,
  })

  // Delegate pause polling to custom hook
  const { startPolling } = usePausePolling(id)

  // Detect if user scrolled up (to pause auto-scroll)
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isScrolledUp = distanceFromBottom > 100
    userScrolledUpRef.current = isScrolledUp
    setShowScrollButton(isScrolledUp)
  }, [])

  // Auto-scroll to bottom (only if user hasn't scrolled up)
  const scrollToBottom = useCallback((force = false) => {
    if (!force && userScrolledUpRef.current) return
    const el = scrollContainerRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // Reset scroll state when discussion changes
  useEffect(() => {
    userScrolledUpRef.current = false
    setShowScrollButton(false)
  }, [id])

  // Clear stale graph state when navigating to a different discussion
  useEffect(() => {
    clearGraph()
  }, [id, clearGraph])

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messageList.length > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom()))
    }
  }, [messageList.length, scrollToBottom])

  // Load the graph definition when the discussion loads
  useEffect(() => {
    if (discussion?.graph_definition) {
      const { nodes, edges } = discussion.graph_definition
      if (nodes && edges) {
        // DB graph_definition uses API types; cast to React Flow types (structurally compatible at runtime)
        loadGraph(nodes as unknown as GraphNode[], edges as unknown as GraphEdge[])
      }
    }
  }, [discussion?.graph_definition, loadGraph])

  const handleSaveGraph = async (graphDefinition: GraphDefinition) => {
    if (!id) return
    try {
      await updateDiscussion.mutateAsync({
        id,
        data: { graph_definition: graphDefinition },
      })
      toast({ title: 'Graph saved successfully' })
    } catch (error) {
      toast({
        title: 'Failed to save graph',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleStart = async () => {
    if (!id) return
    try {
      await startDiscussion.mutateAsync(id)
      toast({ title: 'Discussion started' })
    } catch (error) {
      toast({
        title: 'Failed to start discussion',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handlePause = async () => {
    if (!id) return

    setIsPausing(true)

    try {
      await pauseDiscussion.mutateAsync(id)
      sendControl('pause')

      startPolling(() => setIsPausing(false))

      toast({ title: 'Pausing discussion...' })
    } catch (error) {
      setIsPausing(false)
      toast({
        title: 'Failed to pause',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleStop = async () => {
    if (!id) return
    try {
      await stopDiscussion.mutateAsync(id)
      sendControl('stop')
      toast({ title: 'Discussion stopped' })
    } catch (error) {
      toast({
        title: 'Failed to stop discussion',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleResetConfirm = async () => {
    if (!id) return
    try {
      await resetDiscussion.mutateAsync(id)
      toast({ title: 'Discussion reset to draft', description: 'All messages cleared. You can now edit participants and restart.' })
    } catch (error) {
      toast({
        title: 'Failed to reset discussion',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleExport = () => {
    if (!discussion) return

    const lines = [
      `# ${discussion.title}`,
      `**Topic:** ${discussion.topic}`,
      discussion.description ? `**Description:** ${discussion.description}` : '',
      '',
      '---',
      '',
    ]

    messageList.forEach((msg) => {
      if (msg.message_type !== 'agent_message') {
        lines.push(`> *${msg.content}*`, '')
      } else {
        const meta = msg.metadata as Record<string, string> | undefined
        const name = msg.agents?.name || meta?.participant_name || 'Unknown'
        lines.push(`### ${name}`, '', msg.content, '')
      }
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${discussion.title.replace(/[^a-z0-9]/gi, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleEdit = () => {
    if (discussion?.status === 'running' || discussion?.status === 'paused') {
      toast({
        title: 'Cannot edit discussion',
        description: 'Stop or wait for the discussion to finish before editing',
        variant: 'destructive',
      })
      return
    }
    navigate(`/discussion/${id}/edit`)
  }

  const handleDeleteConfirm = async () => {
    if (!id) return
    try {
      await deleteDiscussion.mutateAsync(id)
      toast({ title: 'Discussion deleted successfully' })
      navigate('/')
    } catch (error) {
      toast({
        title: 'Failed to delete discussion',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  if (isLoadingDiscussion) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="border-b p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (!discussion) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Discussion not found</p>
      </div>
    )
  }

  // Show participant setup for draft discussions
  if (discussion.status === 'draft') {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="border-b p-4 bg-card/50">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold">{discussion.title}</h1>
                <Badge variant={STATUS_COLORS[discussion.status]}>
                  {discussion.status}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">{discussion.topic}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleStart}
                disabled={startDiscussion.isPending || !participants || participants.length < 2}
              >
                <Play className="h-4 w-4 mr-2" />
                Start Discussion
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={handleEdit}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Discussion
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Participants section */}
        <div className="px-4 py-2">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2"
            onClick={() => setShowParticipants(!showParticipants)}
          >
            {showParticipants ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Users className="h-4 w-4" />
            Participants
            {participants && participants.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {participants.length}
              </Badge>
            )}
          </button>
          {showParticipants && id && (
            <div className="mt-2">
              <ParticipantManager
                discussionId={id}
                participants={participants || []}
                onUpdate={() => queryClient.invalidateQueries({ queryKey: ['participants', id] })}
              />
            </div>
          )}
        </div>

        {/* Documents section */}
        <div className="flex-1 overflow-auto px-4 py-2">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2"
            onClick={() => setShowDocuments(!showDocuments)}
          >
            {showDocuments ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <FileText className="h-4 w-4" />
            Documents
            {linkedDocuments && linkedDocuments.length > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {linkedDocuments.length}
              </Badge>
            )}
          </button>
          {showDocuments && (
            <div className="mt-2">
              <DocumentList mode="link" discussionId={id} />
            </div>
          )}
        </div>

        <GraphEditorPanel discussionId={id} onSave={handleSaveGraph} />

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete "${discussion.title}"?`}
          description="Are you sure you want to delete this discussion? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleDeleteConfirm}
        />
      </div>
    )
  }

  // Show messages for non-draft discussions
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b px-6 py-3 flex-shrink-0 bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">{discussion.title}</h1>
            <StatusDot status={discussion.status} />
            {discussion.status === 'running' && (
              <ConnectionIndicator status={wsStatus} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {(discussion.status === 'paused' || discussion.status === 'completed' || discussion.status === 'failed') && (
              <Button size="sm" className="shadow-soft" onClick={handleStart} disabled={startDiscussion.isPending}>
                <Play className="h-4 w-4 mr-2" />
                {discussion.status === 'paused' ? 'Resume' : 'Restart'}
              </Button>
            )}
            {discussion.status === 'running' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="shadow-soft"
                  onClick={handlePause}
                  disabled={pauseDiscussion.isPending || isPausing}
                >
                  {isPausing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Pause className="h-4 w-4 mr-2" />
                  )}
                  {isPausing ? 'Pausing...' : 'Pause'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="shadow-soft"
                  onClick={handleStop}
                  disabled={stopDiscussion.isPending}
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              </>
            )}
            {discussion.status === 'completed' && (
              <Button size="sm" variant="outline" className="shadow-soft" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
            {discussion.status !== 'running' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmReset(true)}
                disabled={resetDiscussion.isPending}
                title="Clear all messages and reset to draft"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={handleEdit}
                  disabled={discussion.status === 'running' || discussion.status === 'paused'}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Discussion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Messages area - scrollable */}
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
                  {discussion.status === 'running'
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

        {/* Scroll to bottom pill */}
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

      <GraphEditorPanel discussionId={id} readOnly />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={discussion.status === 'running' ? 'Delete running discussion?' : `Delete "${discussion.title}"?`}
        description={discussion.status === 'running'
          ? `This discussion is currently running. Deleting "${discussion.title}" will stop it immediately. This action cannot be undone.`
          : `Are you sure you want to delete "${discussion.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset discussion?"
        description="This will delete all messages and return the discussion to draft status. You can then edit participants and settings before restarting. This cannot be undone."
        confirmLabel="Clear & Reset"
        variant="destructive"
        onConfirm={handleResetConfirm}
      />
    </div>
  )
}

// --- Sub-components ---

function ConnectionIndicator({ status }: { status: 'connecting' | 'connected' | 'disconnected' | 'error' }) {
  const dotColor = cn(
    'w-2 h-2 rounded-full flex-shrink-0',
    status === 'connected' && 'bg-green-500',
    status === 'connecting' && 'bg-yellow-500 animate-pulse',
    (status === 'disconnected' || status === 'error') && 'bg-red-500'
  )

  const label =
    status === 'connected' ? 'Live' :
    status === 'connecting' ? 'Connecting' :
    status === 'disconnected' ? 'Disconnected' :
    'Error'

  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className={dotColor} />
      <span className="text-[11px] text-muted-foreground hidden sm:inline">{label}</span>
    </div>
  )
}

const STATUS_DOT_COLORS: Record<string, string> = {
  draft: 'bg-muted-foreground',
  running: 'bg-green-500',
  paused: 'bg-yellow-500',
  completed: 'bg-blue-500',
  failed: 'bg-red-500',
}

function StatusDot({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[status] || 'bg-muted-foreground', status === 'running' && 'animate-pulse')} />
      <span className="text-xs text-muted-foreground capitalize">{status}</span>
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

/** Custom renderers for react-markdown. */
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

  // Fall back to metadata from discussion_participants system when agents join is unavailable
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
          {/* Avatar */}
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

          {/* Content */}
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
