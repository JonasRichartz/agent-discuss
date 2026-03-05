import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
import { DiscussionHeader } from '@/components/discussions/DiscussionHeader'
import { MessageList } from '@/components/discussions/MessageList'
import { Play, MoreHorizontal, Pencil, Trash2, FileText, ChevronDown, ChevronRight, Users } from 'lucide-react'
import { STATUS_COLORS } from '@/lib/constants'
import type { GraphDefinition } from '@/types'
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showParticipants, setShowParticipants] = useState(true)
  const [showDocuments, setShowDocuments] = useState(false)
  const { data: linkedDocuments } = useDiscussionDocuments(id)

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

  const { startPolling } = usePausePolling(id)

  useEffect(() => {
    clearGraph()
  }, [id, clearGraph])

  useEffect(() => {
    if (discussion?.graph_definition) {
      const { nodes, edges } = discussion.graph_definition
      if (nodes && edges) {
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DiscussionHeader
        title={discussion.title}
        status={discussion.status}
        wsStatus={wsStatus}
        isPausing={isPausing}
        isStartPending={startDiscussion.isPending}
        isPausePending={pauseDiscussion.isPending}
        isStopPending={stopDiscussion.isPending}
        isResetPending={resetDiscussion.isPending}
        onStart={handleStart}
        onPause={handlePause}
        onStop={handleStop}
        onExport={handleExport}
        onEdit={handleEdit}
        onDeleteRequest={() => setConfirmDelete(true)}
        onResetRequest={() => setConfirmReset(true)}
      />

      <MessageList
        discussionId={id}
        discussionStatus={discussion.status}
        messageList={messageList}
        isLoadingMessages={isLoadingMessages}
        typingAgents={typingAgents}
        typingText={typingText}
      />

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
