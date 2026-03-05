import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateDiscussion, useTemplates } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import type { GraphDefinition } from '@/types'

const BLANK_GRAPH: GraphDefinition = {
  nodes: [
    { id: 'start', type: 'start', label: 'Start', position: { x: 100, y: 200 }, data: {} },
    { id: 'end', type: 'end', label: 'End', position: { x: 400, y: 200 }, data: {} },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'end' },
  ],
}

interface CreateDiscussionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateDiscussionDialog({
  open,
  onOpenChange,
}: CreateDiscussionDialogProps) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: templates } = useTemplates()
  const createDiscussion = useCreateDiscussion()

  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(null)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)

  const [useBlankGraph, setUseBlankGraph] = useState(false)

  const resetForm = () => {
    setTitle('')
    setTopic('')
    setDescription('')
    setSelectedTemplate(null)
    setUseBlankGraph(false)
    setWebSearchEnabled(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm()
    onOpenChange(open)
  }

  const handleTemplateChange = (templateId: string) => {
    if (templateId === 'blank') {
      setSelectedTemplate(null)
      setUseBlankGraph(true)
    } else {
      const template = templates?.find((t) => t.id === templateId)
      setSelectedTemplate(template ?? null)
      setUseBlankGraph(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedTemplate && !useBlankGraph) {
      toast({
        title: 'Please select a template',
        variant: 'destructive',
      })
      return
    }

    const graphDefinition = useBlankGraph ? BLANK_GRAPH : selectedTemplate!.graph_definition

    try {
      const discussion = await createDiscussion.mutateAsync({
        title,
        topic,
        description: description || undefined,
        graph_definition: graphDefinition,
        web_search_enabled: webSearchEnabled,
      })

      toast({ title: 'Discussion created' })
      handleOpenChange(false)
      navigate(`/discussion/${discussion.id}`)
    } catch (error) {
      toast({
        title: 'Failed to create discussion',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Discussion</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 py-4 px-1">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Discussion title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="topic">Topic / Question</Label>
                <Textarea
                  id="topic"
                  placeholder="The main question or topic for agents to discuss"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="min-h-[80px]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Context (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Background context or constraints for the discussion"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Conversation Template</Label>
                <Select onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blank">
                      Blank (Start / End only)
                    </SelectItem>
                    {templates?.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {useBlankGraph && (
                  <p className="text-sm text-muted-foreground">
                    Empty graph with just Start and End nodes. Add conversation nodes in the graph editor after creation.
                  </p>
                )}
              </div>

              <div className="flex items-start gap-3 py-2">
                <input
                  type="checkbox"
                  id="web-search"
                  checked={webSearchEnabled}
                  onChange={(e) => setWebSearchEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border"
                />
                <div>
                  <Label htmlFor="web-search" className="cursor-pointer">
                    Enable web search
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Agents can search the web for up-to-date information during the discussion.
                    Requires a Tavily API key in your server configuration.
                  </p>
                </div>
              </div>

            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createDiscussion.isPending}>
              {createDiscussion.isPending ? 'Creating...' : 'Create Discussion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
