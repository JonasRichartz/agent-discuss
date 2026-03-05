import { useState, useEffect } from 'react'
import { useAgents, useLLMProviders, useCreateAgent, useUpdateAgent, useDeleteAgent, useTestAgent } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { Plus, Pencil, Trash2, Play, Bot, Server, Thermometer, Hash } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { Agent, AgentCreate, LLMProvider } from '@/types'

const COLOR_OPTIONS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16']

export function AgentSettings() {
  const { data: agents, isLoading } = useAgents()
  const { data: providers } = useLLMProviders()
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setIsDialogOpen(true)
  }

  const handleCreate = () => {
    setEditingAgent(null)
    setIsDialogOpen(true)
  }

  const handleClose = () => {
    setIsDialogOpen(false)
    setEditingAgent(null)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agent Templates</CardTitle>
          <CardDescription>Create reusable participant presets for discussions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Templates</CardTitle>
        <CardDescription>Save agent configurations as templates to quickly add to discussions</CardDescription>
      </CardHeader>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AgentDialog agent={editingAgent} onClose={handleClose} />
      </Dialog>
      <CardContent>
        {agents?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No agent templates created yet.</p>
            <p className="text-sm">Create templates to quickly add participants to discussions.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={handleCreate}
              className="border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-all"
            >
              <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                <Plus className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Add Agent</span>
            </button>
            {agents?.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                providers={providers}
                onEdit={() => handleEdit(agent)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AgentCard({
  agent,
  providers,
  onEdit,
}: {
  agent: Agent
  providers: LLMProvider[] | undefined
  onEdit: () => void
}) {
  const deleteAgent = useDeleteAgent()
  const testAgent = useTestAgent()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)
  const [testPrompt, setTestPrompt] = useState('Hello, introduce yourself.')
  const [testResponse, setTestResponse] = useState<string | null>(null)

  const providerName = providers?.find((p) => p.id === agent.llm_provider_id)?.name

  const handleTest = async () => {
    try {
      const result = await testAgent.mutateAsync({ id: agent.id, prompt: testPrompt })
      if (result.status === 'success') {
        setTestResponse(result.response ?? 'No response')
      } else {
        toast({
          title: 'Test failed',
          description: result.message,
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Test failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this agent?')) return
    setIsDeleting(true)
    try {
      await deleteAgent.mutateAsync(agent.id)
      toast({ title: 'Agent deleted' })
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="group relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-all">
      {/* Header with avatar + name */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm"
          style={{
            backgroundColor: agent.avatar_color + '20',
            color: agent.avatar_color,
            border: `2px solid ${agent.avatar_color}40`,
          }}
        >
          {getInitials(agent.name)}
        </div>
        <div className="min-w-0 flex-1 pr-8">
          <p className="text-sm font-semibold text-foreground truncate">{agent.name}</p>
          {agent.description && (
            <p className="text-[11px] text-muted-foreground truncate">{agent.description}</p>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
          <Bot className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-foreground/90 truncate">{agent.model_name || 'No model'}</span>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
          <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-foreground/80 truncate">{providerName || 'No provider'}</span>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/40">
          <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-foreground/70 tabular-nums">{agent.max_tokens.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/40">
          <Thermometer className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-foreground/70 tabular-nums">{agent.temperature}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-accent">
              <Play className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Test Agent: {agent.name}</DialogTitle>
              <DialogDescription>
                Send a test message to see how the agent responds.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Test Prompt</Label>
                <Textarea
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder="Enter a test prompt..."
                />
              </div>
              {testResponse && (
                <div className="space-y-2">
                  <Label>Response</Label>
                  <ScrollArea className="h-48 border rounded-md p-3">
                    <p className="text-sm whitespace-pre-wrap">{testResponse}</p>
                  </ScrollArea>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={handleTest}
                disabled={testAgent.isPending || !testPrompt}
              >
                {testAgent.isPending ? 'Testing...' : 'Send'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-accent" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md hover:bg-destructive/10"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

function AgentDialog({
  agent,
  onClose,
}: {
  agent: Agent | null
  onClose: () => void
}) {
  const { data: providers } = useLLMProviders()
  const createAgent = useCreateAgent()
  const updateAgent = useUpdateAgent()
  const { toast } = useToast()

  const defaultFormData: AgentCreate = {
    name: '',
    description: '',
    system_prompt: 'You are a helpful AI assistant participating in a discussion.',
    llm_provider_id: undefined,
    model_name: undefined,
    temperature: 0.7,
    max_tokens: 4096,
    avatar_color: '#6366f1',
    avatar_emoji: '🤖',
  }

  const [formData, setFormData] = useState<AgentCreate>(defaultFormData)

  // Sync form data when agent prop changes (edit vs create)
  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
        description: agent.description ?? '',
        system_prompt: agent.system_prompt,
        llm_provider_id: agent.llm_provider_id ?? undefined,
        model_name: agent.model_name ?? undefined,
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
        avatar_color: agent.avatar_color,
        avatar_emoji: agent.avatar_emoji,
      })
    } else {
      setFormData(defaultFormData)
    }
  }, [agent?.id])

  // Build flattened model list: { value: "providerId:modelName", label: "modelName", providerName: "..." }
  const modelOptions = (providers ?? []).flatMap((provider) =>
    provider.available_models.map((model) => ({
      value: `${provider.id}:${model}`,
      label: model,
      providerName: provider.name,
    }))
  )

  // Current combined value for the model select
  const currentModelValue =
    formData.llm_provider_id && formData.model_name
      ? `${formData.llm_provider_id}:${formData.model_name}`
      : 'none'

  const handleModelChange = (value: string) => {
    if (value === 'none') {
      setFormData({ ...formData, llm_provider_id: undefined, model_name: undefined })
    } else {
      const [providerId, ...modelParts] = value.split(':')
      const modelName = modelParts.join(':') // Handle model names with colons
      setFormData({ ...formData, llm_provider_id: providerId, model_name: modelName })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (agent) {
        await updateAgent.mutateAsync({ id: agent.id, data: formData })
        toast({ title: 'Agent updated' })
      } else {
        await createAgent.mutateAsync(formData)
        toast({ title: 'Agent created' })
      }
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const isLoading = createAgent.isPending || updateAgent.isPending

  return (
    <DialogContent className="max-w-2xl">
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{agent ? 'Edit Agent' : 'Create Agent'}</DialogTitle>
          <DialogDescription>
            Configure an AI participant for your discussions.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-4 px-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Agent display name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Select value={currentModelValue} onValueChange={handleModelChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No model selected</SelectItem>
                    {modelOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label} ({opt.providerName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Short description of the agent's role"
                value={formData.description ?? ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="system_prompt">System Prompt</Label>
              <Textarea
                id="system_prompt"
                placeholder="Instructions that define the agent's behavior and personality"
                value={formData.system_prompt}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                className="min-h-[120px]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Temperature: {formData.temperature}</Label>
                <Slider
                  value={[formData.temperature ?? 0.7]}
                  onValueChange={([value]) => setFormData({ ...formData, temperature: value })}
                  min={0}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">
                  Lower = more focused, Higher = more creative
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_tokens">Max Tokens</Label>
                <Input
                  id="max_tokens"
                  type="number"
                  min={64}
                  value={formData.max_tokens}
                  onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) || 4096 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Avatar Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, avatar_color: color })}
                    className={`w-8 h-8 rounded-full border-2 transition-colors ${
                      formData.avatar_color === color
                        ? 'border-foreground scale-110'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{ backgroundColor: formData.avatar_color + '30', color: formData.avatar_color }}
              >
                {getInitials(formData.name || 'AG')}
              </div>
              <div>
                <p className="font-medium">{formData.name || 'Agent Name'}</p>
                <p className="text-sm text-muted-foreground">
                  {formData.description || 'No description'}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : agent ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
