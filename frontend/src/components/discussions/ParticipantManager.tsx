import { useState } from 'react'
import { Trash2, Edit, Plus, Bot, Server, Hash, Thermometer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { useDeleteParticipant } from '@/hooks/use-api'
import { ParticipantDialog } from './ParticipantDialog'
import { getInitials } from '@/lib/utils'
import type { DiscussionParticipant } from '@/types'

interface ParticipantManagerProps {
  discussionId: string
  participants: DiscussionParticipant[]
  onUpdate: () => void
}

export function ParticipantManager({ discussionId, participants, onUpdate }: ParticipantManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState<DiscussionParticipant | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  } | null>(null)
  const { toast } = useToast()
  const deleteParticipant = useDeleteParticipant(discussionId)

  const handleEdit = (participant: DiscussionParticipant) => {
    setEditingParticipant(participant)
    setDialogOpen(true)
  }

  const handleDelete = (participant: DiscussionParticipant) => {
    setConfirmDialog({
      open: true,
      title: `Delete "${participant.name}"?`,
      description: `Are you sure you want to delete participant "${participant.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await deleteParticipant.mutateAsync(participant.id)
          toast({ title: 'Participant deleted successfully' })
          onUpdate()
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
    onUpdate()
  }

  return (
    <div className="space-y-4">
      {participants.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p>No participants yet. Add at least 2 to start the discussion.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Participant
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => setDialogOpen(true)}
            className="w-[280px] border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-all"
          >
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">Add Participant</span>
          </button>
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="group relative w-[280px] rounded-xl border bg-card shadow-sm hover:shadow-md transition-all"
            >
              {/* Header with avatar + name */}
              <div className="flex items-center gap-3 p-4 pb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm"
                  style={{
                    backgroundColor: participant.avatar_color + '20',
                    color: participant.avatar_color,
                    border: `2px solid ${participant.avatar_color}40`,
                  }}
                >
                  {getInitials(participant.name)}
                </div>
                <div className="min-w-0 flex-1 pr-8">
                  <p className="text-sm font-semibold text-foreground truncate">{participant.name}</p>
                  {participant.role && (
                    <p className="text-[11px] text-muted-foreground truncate">{participant.role}</p>
                  )}
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-medium text-foreground/90 truncate">{participant.model_name}</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
                  <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-foreground/80 truncate">{participant.llm_providers?.name || 'No provider'}</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/40">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-foreground/70 tabular-nums">{participant.max_tokens.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/40">
                  <Thermometer className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-foreground/70 tabular-nums">{participant.temperature}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md hover:bg-accent"
                  onClick={() => handleEdit(participant)}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md hover:bg-destructive/10"
                  onClick={() => handleDelete(participant)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
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
    </div>
  )
}
