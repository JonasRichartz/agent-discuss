import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDiscussion, useUpdateDiscussion } from '@/hooks/use-api'
import { useGraphStore } from '@/stores/graphStore'
import type { DiscussionUpdate, GraphDefinition } from '@/types'
import type { GraphNode, GraphEdge } from '@/types/graph'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { GraphEditorPanel } from '@/components/graph-editor'
import { ArrowLeft, AlertTriangle, Save } from 'lucide-react'

export function EditDiscussionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: discussion, isLoading } = useDiscussion(id)
  const updateDiscussion = useUpdateDiscussion()
  const loadGraph = useGraphStore((state) => state.loadGraph)

  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)

  // Initialize form with discussion data
  useEffect(() => {
    if (discussion) {
      setTitle(discussion.title)
      setTopic(discussion.topic)
      setDescription(discussion.description || '')
      setWebSearchEnabled(discussion.web_search_enabled ?? false)
    }
  }, [discussion])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!id) return

    if (discussion?.status === 'running' || discussion?.status === 'paused') {
      toast({
        title: 'Cannot edit discussion',
        description: 'Cannot modify a discussion while it is running or paused',
        variant: 'destructive',
      })
      return
    }

    try {
      const updateData: DiscussionUpdate = {
        title,
        topic,
        description: description || undefined,
        web_search_enabled: webSearchEnabled,
      }

      await updateDiscussion.mutateAsync({
        id,
        data: updateData,
      })

      toast({ title: 'Discussion updated successfully' })
      navigate(`/discussion/${id}`)
    } catch (error) {
      toast({
        title: 'Failed to update discussion',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleCancel = () => {
    navigate(`/discussion/${id}`)
  }

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

  // Load graph definition when discussion data arrives
  useEffect(() => {
    if (discussion?.graph_definition) {
      const { nodes, edges } = discussion.graph_definition
      if (nodes && edges) {
        loadGraph(nodes as unknown as GraphNode[], edges as unknown as GraphEdge[])
      }
    }
  }, [discussion?.graph_definition, loadGraph])

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="border-b p-4">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex-1 p-6 max-w-4xl mx-auto">
          <Skeleton className="h-64 w-full" />
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

  const isReadOnly = discussion.status === 'running' || discussion.status === 'paused'

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Edit Discussion</h1>
            <p className="text-sm text-muted-foreground">{discussion.title}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-4xl mx-auto space-y-6">
          {/* Read-only warning */}
          {isReadOnly && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This discussion is <strong>{discussion.status}</strong> and cannot be edited.
                Stop or wait for it to finish before making changes.
              </AlertDescription>
            </Alert>
          )}

          {/* Basic Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Edit Discussion</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={isReadOnly}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="topic">Topic / Question</Label>
                  <Textarea
                    id="topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="min-h-[80px]"
                    disabled={isReadOnly}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Context (optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isReadOnly}
                  />
                </div>

                <div className="flex items-start gap-3 py-2">
                  <input
                    type="checkbox"
                    id="web-search"
                    checked={webSearchEnabled}
                    onChange={(e) => setWebSearchEnabled(e.target.checked)}
                    disabled={isReadOnly}
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

                {!isReadOnly && (
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={handleCancel}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateDiscussion.isPending}>
                      <Save className="h-4 w-4 mr-2" />
                      {updateDiscussion.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

        </div>
      </ScrollArea>

      {/* Graph Editor with integrated Participant Bar */}
      <GraphEditorPanel
        discussionId={id}
        readOnly={isReadOnly}
        onSave={!isReadOnly ? handleSaveGraph : undefined}
      />
    </div>
  )
}
