import { useParams, Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { DiscussionView } from '@/components/discussions/DiscussionView'
import { Button } from '@/components/ui/button'
import { MessageSquarePlus } from 'lucide-react'

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <AppLayout>
      {id ? (
        <DiscussionView />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-sm animate-fade-in">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
              <MessageSquarePlus className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">Welcome to Multi-LLM Project</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create a new discussion or select one from the sidebar.
                Set up your LLM providers and agents in Settings to get started.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shadow-soft">
              <Link to="/settings">Go to Settings</Link>
            </Button>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
