import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import {
  useCreateParticipant,
  useUpdateParticipant,
  useCreateParticipantFromTemplate,
  useLLMProviders,
  useAgentTemplates,
} from '@/hooks/use-api'
import { ParticipantForm } from './ParticipantForm'
import { getInitials } from '@/lib/utils'
import { Bot, Server, Thermometer, Hash } from 'lucide-react'
import type { DiscussionParticipant, ParticipantCreate } from '@/types'

interface ParticipantDialogProps {
  discussionId: string
  participant?: DiscussionParticipant | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ParticipantDialog({
  discussionId,
  participant,
  open,
  onClose,
  onSuccess,
}: ParticipantDialogProps) {
  const isEditing = !!participant
  const { toast } = useToast()

  const [formData, setFormData] = useState<ParticipantCreate>({
    name: '',
    system_prompt: '',
    provider_id: '',
    model_name: '',
    temperature: 0.7,
    max_tokens: 4096,
    avatar_color: '#6366f1',
    avatar_emoji: '🤖',
  })

  const { data: providers } = useLLMProviders()
  const { data: templates } = useAgentTemplates()
  const createParticipant = useCreateParticipant(discussionId)
  const updateParticipant = useUpdateParticipant(discussionId)
  const createFromTemplate = useCreateParticipantFromTemplate(discussionId)

  // Populate form when editing
  useEffect(() => {
    if (participant) {
      setFormData({
        name: participant.name,
        system_prompt: participant.system_prompt,
        provider_id: participant.provider_id,
        model_name: participant.model_name,
        temperature: participant.temperature,
        max_tokens: participant.max_tokens,
        avatar_color: participant.avatar_color,
        avatar_emoji: participant.avatar_emoji,
        role: participant.role || undefined,
      })
    } else {
      // Reset form for new participant
      setFormData({
        name: '',
        system_prompt: '',
        provider_id: providers?.[0]?.id || '',
        model_name: '',
        temperature: 0.7,
        max_tokens: 4096,
        avatar_color: '#6366f1',
        avatar_emoji: '🤖',
      })
    }
  }, [participant, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.system_prompt || !formData.provider_id || !formData.model_name) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }

    try {
      if (isEditing) {
        await updateParticipant.mutateAsync({
          participantId: participant.id,
          data: formData,
        })
        toast({ title: 'Participant updated successfully' })
      } else {
        await createParticipant.mutateAsync(formData)
        toast({ title: 'Participant created successfully' })
      }
      onSuccess()
    } catch (error) {
      toast({
        title: `Failed to ${isEditing ? 'update' : 'create'} participant`,
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleCreateFromTemplate = async (agentId: string) => {
    try {
      await createFromTemplate.mutateAsync(agentId)
      toast({ title: 'Participant created from template' })
      onSuccess()
    } catch (error) {
      toast({
        title: 'Failed to create participant',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Participant' : 'Add Participant'}</DialogTitle>
        </DialogHeader>

        {isEditing ? (
          // Edit mode: just show the form
          <form onSubmit={handleSubmit} className="space-y-4">
            <ScrollArea className="max-h-[60vh]">
              <ParticipantForm formData={formData} onChange={setFormData} providers={providers} />
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createParticipant.isPending || updateParticipant.isPending}>
                {isEditing ? 'Update' : 'Create'} Participant
              </Button>
            </div>
          </form>
        ) : (
          // Create mode: show tabs
          <Tabs defaultValue="custom" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="custom">Custom</TabsTrigger>
              <TabsTrigger value="template">Template</TabsTrigger>
            </TabsList>

            <TabsContent value="custom" className="mt-0">
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <ScrollArea className="max-h-[60vh]">
                  <ParticipantForm formData={formData} onChange={setFormData} providers={providers} />
                </ScrollArea>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createParticipant.isPending}>
                    Create Participant
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="template" className="mt-0 pt-4">
              <ScrollArea className="h-[50vh]">
                <div className="space-y-3">
                  {templates && templates.length > 0 ? (
                    templates.map((template) => {
                      const providerName = providers?.find(
                        (p) => p.id === template.llm_provider_id
                      )?.name
                      return (
                        <div
                          key={template.id}
                          className="group relative rounded-xl border bg-card shadow-sm hover:shadow-md cursor-pointer transition-all"
                          onClick={() => handleCreateFromTemplate(template.id)}
                        >
                          {/* Header with avatar + name */}
                          <div className="flex items-center gap-3 p-4 pb-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm"
                              style={{
                                backgroundColor: template.avatar_color + '20',
                                color: template.avatar_color,
                                border: `2px solid ${template.avatar_color}40`,
                              }}
                            >
                              {getInitials(template.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate">{template.name}</p>
                              {template.description && (
                                <p className="text-[11px] text-muted-foreground truncate">{template.description}</p>
                              )}
                            </div>
                          </div>

                          {/* Info grid */}
                          <div className="grid grid-cols-4 gap-2 px-4 pb-4">
                            {template.model_name && (
                              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
                                <Bot className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-xs font-medium text-foreground/90 truncate">{template.model_name}</span>
                              </div>
                            )}
                            {providerName && (
                              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
                                <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-xs text-foreground/80 truncate">{providerName}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/40">
                              <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs text-foreground/70 tabular-nums">{template.max_tokens.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/40">
                              <Thermometer className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs text-foreground/70 tabular-nums">{template.temperature}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No agent templates available.</p>
                      <p className="text-sm mt-2">Create templates in Settings → Agents.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
