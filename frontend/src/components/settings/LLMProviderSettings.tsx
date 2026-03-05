import { useState, useEffect } from 'react'
import { useLLMProviders, useCreateLLMProvider, useUpdateLLMProvider, useDeleteLLMProvider, useTestLLMProvider } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { Plus, Pencil, Trash2, Play, Server, X } from 'lucide-react'
import type { LLMProvider, LLMProviderCreate } from '@/types'

export function LLMProviderSettings() {
  const { data: providers, isLoading } = useLLMProviders()
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleEdit = (provider: LLMProvider) => {
    setEditingProvider(provider)
    setIsDialogOpen(true)
  }

  const handleCreate = () => {
    setEditingProvider(null)
    setIsDialogOpen(true)
  }

  const handleClose = () => {
    setIsDialogOpen(false)
    setEditingProvider(null)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>LLM Providers</CardTitle>
          <CardDescription>Configure your vLLM connections</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>LLM Providers</CardTitle>
          <CardDescription>
            Configure LLM provider connections. Model names are specified per-participant.
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          </DialogTrigger>
          <ProviderDialog
            provider={editingProvider}
            onClose={handleClose}
          />
        </Dialog>
      </CardHeader>
      <CardContent>
        {providers?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No LLM providers configured yet.</p>
            <p className="text-sm">Add your vLLM server to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {providers?.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onEdit={() => handleEdit(provider)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProviderCard({
  provider,
  onEdit,
}: {
  provider: LLMProvider
  onEdit: () => void
}) {
  const deleteProvider = useDeleteLLMProvider()
  const testProvider = useTestLLMProvider()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleTest = async () => {
    try {
      const result = await testProvider.mutateAsync(provider.id)
      toast({
        title: result.status === 'success' ? 'Connection successful' : 'Connection failed',
        description: result.message,
        variant: result.status === 'success' ? 'default' : 'destructive',
      })
    } catch (error) {
      toast({
        title: 'Test failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this provider?')) return
    setIsDeleting(true)
    try {
      await deleteProvider.mutateAsync(provider.id)
      toast({ title: 'Provider deleted' })
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
    <div className="group relative p-4 border rounded-lg shadow-soft hover:shadow-elevated transition-shadow duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2.5 min-w-0 flex-1">
          <h3 className="font-medium tracking-tight">{provider.name}</h3>

          <div className="bg-muted/30 rounded-md px-2.5 py-1.5">
            <p className="text-xs font-mono text-muted-foreground truncate">{provider.base_url}</p>
          </div>

          {provider.embedding_model && (
            <p className="text-xs text-muted-foreground">
              Embeddings: <span className="font-mono">{provider.embedding_model}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {provider.available_models.length > 0 ? (
              provider.available_models.map((model) => (
                <span
                  key={model}
                  className="bg-muted text-muted-foreground text-xs rounded-full px-2.5 py-0.5"
                >
                  {model}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground italic">No models added</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs"
            onClick={handleTest}
            disabled={testProvider.isPending}
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            {testProvider.isPending ? 'Testing...' : 'Test'}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProviderDialog({
  provider,
  onClose,
}: {
  provider: LLMProvider | null
  onClose: () => void
}) {
  const createProvider = useCreateLLMProvider()
  const updateProvider = useUpdateLLMProvider()
  const { toast } = useToast()

  const [formData, setFormData] = useState<LLMProviderCreate>({
    name: provider?.name ?? '',
    base_url: provider?.base_url ?? '',
    api_key: '',
    available_models: provider?.available_models ?? [],
    embedding_model: provider?.embedding_model ?? '',
  })
  const [newModel, setNewModel] = useState('')

  // Sync form when switching between providers
  useEffect(() => {
    setFormData({
      name: provider?.name ?? '',
      base_url: provider?.base_url ?? '',
      api_key: '',
      available_models: provider?.available_models ?? [],
      embedding_model: provider?.embedding_model ?? '',
    })
    setNewModel('')
  }, [provider])

  const handleAddModel = () => {
    const model = newModel.trim()
    if (!model) return
    if (formData.available_models.includes(model)) {
      toast({ title: 'Model already added', variant: 'destructive' })
      return
    }
    setFormData({ ...formData, available_models: [...formData.available_models, model] })
    setNewModel('')
  }

  const handleRemoveModel = (model: string) => {
    setFormData({
      ...formData,
      available_models: formData.available_models.filter((m) => m !== model),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (provider) {
        const { api_key, ...rest } = formData
        await updateProvider.mutateAsync({
          id: provider.id,
          data: api_key ? formData : rest,
        })
        toast({ title: 'Provider updated' })
      } else {
        await createProvider.mutateAsync(formData)
        toast({ title: 'Provider created' })
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

  const isLoading = createProvider.isPending || updateProvider.isPending

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>
            {provider ? 'Edit Provider' : 'Add LLM Provider'}
          </DialogTitle>
          <DialogDescription>
            Configure your vLLM or OpenAI-compatible API endpoint.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Provider display name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="base_url">Base URL</Label>
            <Input
              id="base_url"
              placeholder="OpenAI-compatible API base URL"
              value={formData.base_url}
              onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api_key">API Key (optional)</Label>
            <Input
              id="api_key"
              type="password"
              placeholder={provider ? 'Leave blank to keep current key' : 'Enter API key...'}
              value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="embedding_model">Embedding Model (optional)</Label>
            <Input
              id="embedding_model"
              placeholder="Embedding model name for RAG"
              value={formData.embedding_model ?? ''}
              onChange={(e) => setFormData({ ...formData, embedding_model: e.target.value || null })}
            />
            <p className="text-xs text-muted-foreground">
              Used for document processing (RAG). Leave blank to use ChromaDB's built-in embedder.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Models</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Model name to add"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddModel()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAddModel} className="flex-shrink-0">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            {formData.available_models.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formData.available_models.map((model) => (
                  <Badge key={model} variant="secondary" className="flex items-center gap-1 pr-1">
                    {model}
                    <button
                      type="button"
                      onClick={() => handleRemoveModel(model)}
                      className="ml-1 rounded-full hover:bg-background/80 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : provider ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
