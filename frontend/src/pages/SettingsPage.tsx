import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LLMProviderSettings } from '@/components/settings/LLMProviderSettings'
import { AgentSettings } from '@/components/settings/AgentSettings'
import { DocumentList } from '@/components/documents'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useProfile, useUpdatePreferences } from '@/hooks/use-api'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/hooks/use-toast'
import { Server, Bot, FileText, Globe, SlidersHorizontal, Moon, Sun, Monitor } from 'lucide-react'

function APIKeysSettings() {
  const { data: profile } = useProfile()
  const updatePreferences = useUpdatePreferences()
  const { toast } = useToast()
  const [tavilyKey, setTavilyKey] = useState('')

  useEffect(() => {
    setTavilyKey(profile?.preferences?.tavily_api_key ?? '')
  }, [profile])

  const handleSave = () => {
    updatePreferences.mutate(
      { tavily_api_key: tavilyKey },
      {
        onSuccess: () => {
          toast({ title: 'API key saved', description: 'Your Tavily API key has been updated.' })
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to save API key.', variant: 'destructive' })
        },
      }
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tavily Web Search</CardTitle>
        <CardDescription>Configure Tavily for web search during discussions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tavily-key">Tavily API Key</Label>
          <Input
            id="tavily-key"
            type="password"
            placeholder="tvly-..."
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Used for web search in discussions. Get a free key at{' '}
            <a
              href="https://tavily.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              tavily.com
            </a>
          </p>
        </div>
        <Button onClick={handleSave} disabled={updatePreferences.isPending}>
          {updatePreferences.isPending ? 'Saving...' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}

function PreferencesSettings() {
  const { theme, setTheme } = useUIStore()

  const options: { value: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }[] = [
    { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
    { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Customize the application appearance.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Theme</Label>
          <div className="flex gap-3">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  theme === opt.value
                    ? 'border-foreground bg-accent text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="flex-1 p-6 md:p-8 lg:p-10 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage providers, agents, documents, and preferences.</p>
          </div>

          <Tabs defaultValue="providers" className="space-y-8">
            <TabsList className="w-full h-11">
              <TabsTrigger value="providers" className="flex-1 gap-2">
                <Server className="h-4 w-4" />
                LLM Providers
              </TabsTrigger>
              <TabsTrigger value="agents" className="flex-1 gap-2">
                <Bot className="h-4 w-4" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex-1 gap-2">
                <FileText className="h-4 w-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="api-keys" className="flex-1 gap-2">
                <Globe className="h-4 w-4" />
                Tavily
              </TabsTrigger>
              <TabsTrigger value="preferences" className="flex-1 gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Preferences
              </TabsTrigger>
            </TabsList>

            <TabsContent value="providers" className="mt-6">
              <LLMProviderSettings />
            </TabsContent>

            <TabsContent value="agents" className="mt-6">
              <AgentSettings />
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>Upload and manage documents for use in discussions</CardDescription>
                </CardHeader>
                <CardContent>
                  <DocumentList mode="manage" />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="api-keys" className="mt-6">
              <APIKeysSettings />
            </TabsContent>

            <TabsContent value="preferences" className="mt-6">
              <PreferencesSettings />
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </AppLayout>
  )
}
