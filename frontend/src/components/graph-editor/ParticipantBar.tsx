import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { useDiscussionParticipants, useDeleteParticipant } from '@/hooks/use-api'
import { useQueryClient } from '@tanstack/react-query'
import { ParticipantDialog } from '@/components/discussions/ParticipantDialog'
import { Plus, X, Users, ChevronDown, ChevronRight, Cpu, Thermometer } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import type { DiscussionParticipant } from '@/types'

interface ParticipantBarProps {
  discussionId: string
  readOnly?: boolean
}

export function ParticipantBar({ discussionId, readOnly }: ParticipantBarProps) {
  const queryClient = useQueryClient()
  const { data: participants } = useDiscussionParticipants(discussionId)
  const deleteParticipant = useDeleteParticipant(discussionId)
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState<DiscussionParticipant | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  } | null>(null)

  const invalidateParticipants = () => {
    queryClient.invalidateQueries({ queryKey: ['participants', discussionId] })
  }

  const handleEdit = (participant: DiscussionParticipant) => {
    setEditingParticipant(participant)
    setDialogOpen(true)
  }

  const handleDelete = (participant: DiscussionParticipant) => {
    setConfirmDialog({
      open: true,
      title: `Delete "${participant.name}"?`,
      description: `Remove "${participant.name}" from this discussion? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await deleteParticipant.mutateAsync(participant.id)
          toast({ title: 'Participant removed' })
          invalidateParticipants()
        } catch (error) {
          toast({
            title: 'Failed to delete participant',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          })
        }
      },
    })
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingParticipant(null)
  }

  const handleSuccess = () => {
    handleDialogClose()
    invalidateParticipants()
  }

  const count = participants?.length ?? 0

  return (
    <>
      {/* Header row — always visible */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <button
          type="button"
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Users className="h-3.5 w-3.5" />
          Participants
          <span className="ml-0.5 text-[10px] tabular-nums bg-secondary px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </button>

        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>

      {/* Expanded participant cards */}
      {expanded && (
        <div className="border-b bg-background/50">
          {count === 0 ? (
            <div className="px-4 py-4 text-center">
              <p className="text-sm text-muted-foreground">No participants yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add at least 2 to start a discussion</p>
            </div>
          ) : (
            <div className="px-3 py-2 flex flex-wrap gap-2">
              {participants?.map((p) => (
                <ParticipantCard
                  key={p.id}
                  participant={p}
                  readOnly={readOnly}
                  onEdit={() => handleEdit(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ParticipantDialog
        discussionId={discussionId}
        participant={editingParticipant}
        open={dialogOpen}
        onClose={handleDialogClose}
        onSuccess={handleSuccess}
      />

      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => {
            if (!open) setConfirmDialog(null)
          }}
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={confirmDialog.onConfirm}
        />
      )}
    </>
  )
}


function ParticipantCard({
  participant: p,
  readOnly,
  onEdit,
  onDelete,
}: {
  participant: DiscussionParticipant
  readOnly?: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'group relative flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 min-w-[200px] max-w-[280px] transition-colors',
        !readOnly && 'cursor-pointer hover:bg-accent/50'
      )}
      onClick={() => !readOnly && onEdit()}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
        style={{
          backgroundColor: p.avatar_color + '20',
          color: p.avatar_color,
          border: `1.5px solid ${p.avatar_color}40`,
        }}
      >
        {getInitials(p.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate" style={{ color: p.avatar_color }}>
            {p.name}
          </span>
          {p.role && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0 rounded">
              {p.role}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-0.5 truncate">
            <Cpu className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{p.model_name || 'No model'}</span>
          </span>
          <span className="flex items-center gap-0.5 flex-shrink-0" title="Temperature">
            <Thermometer className="h-3 w-3" />
            {p.temperature}
          </span>
        </div>
      </div>

      {/* Delete button */}
      {!readOnly && (
        <button
          className="absolute top-1.5 right-1.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
