import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDiscussions, useDeleteDiscussion } from '@/hooks/use-api'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { CreateDiscussionDialog } from '@/components/discussions/CreateDiscussionDialog'
import { getInitials } from '@/lib/utils'
import {
  Plus,
  Settings,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  MessageSquare,
  LogOut,
} from 'lucide-react'
import type { DiscussionStatus } from '@/types'

// Status dot color mapping (Tailwind bg classes)
const STATUS_DOT_COLORS: Record<DiscussionStatus, string> = {
  draft: 'bg-muted-foreground/50',
  running: 'bg-success',
  paused: 'bg-warning',
  completed: 'bg-foreground/40',
  failed: 'bg-destructive',
}

/** Return a short human-friendly relative time string. */
function timeAgo(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const seconds = Math.floor((now - then) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

function UserMenu() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { toast } = useToast()

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      navigate('/login')
    } catch {
      toast({ variant: 'destructive', title: 'Logout failed' })
    }
  }

  const email = user?.email || ''
  const displayName = email.split('@')[0] || 'User'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground flex-shrink-0">
            {getInitials(displayName)}
          </div>
          <span className="truncate text-[13px]">{email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: discussions, isLoading } = useDiscussions()
  const deleteDiscussion = useDeleteDiscussion()
  const { toast } = useToast()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    variant: 'default' | 'destructive'
    onConfirm: () => void
  } | null>(null)

  const filteredDiscussions = discussions?.filter(
    (d) =>
      !searchQuery ||
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.topic.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleEdit = (discussionId: string, status: DiscussionStatus) => {
    if (status === 'running' || status === 'paused') {
      toast({
        title: 'Cannot edit discussion',
        description: 'Stop or wait for the discussion to finish before editing',
        variant: 'destructive',
      })
      return
    }

    navigate(`/discussion/${discussionId}/edit`)
  }

  const handleDelete = (discussionId: string, discussionTitle: string, status: DiscussionStatus) => {
    const isRunning = status === 'running'

    setConfirmDialog({
      open: true,
      title: isRunning ? 'Delete running discussion?' : `Delete "${discussionTitle}"?`,
      description: isRunning
        ? `This discussion is currently running. Deleting "${discussionTitle}" will stop it immediately. This action cannot be undone.`
        : `Are you sure you want to delete "${discussionTitle}"? This action cannot be undone.`,
      variant: isRunning ? 'destructive' : 'default',
      onConfirm: async () => {
        try {
          await deleteDiscussion.mutateAsync(discussionId)
          toast({ title: 'Discussion deleted successfully' })

          // If we're currently viewing this discussion, redirect to home
          if (location.pathname === `/discussion/${discussionId}`) {
            navigate('/')
          }
        } catch (error) {
          toast({
            title: 'Failed to delete discussion',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          })
        }
      },
    })
  }

  return (
    <>
      <aside className="flex flex-col border-r bg-sidebar w-72">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 h-14 border-b">
          <MessageSquare className="h-5 w-5 text-foreground/70 flex-shrink-0" />
          <Link to="/" className="font-semibold text-[15px] tracking-tight">
            Multi-LLM Project
          </Link>
        </div>

        {/* Actions */}
        <div className="px-4 pt-4 pb-3 space-y-3">
          <Button
            className="w-full shadow-soft text-[13px]"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Discussion
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 text-sm pl-9 bg-muted/50 border-transparent focus:border-border focus:bg-background"
            />
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        {/* Discussion List */}
        <ScrollArea className="flex-1 px-3 pt-3">
          <p className="px-2 pb-2 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
            Discussions
          </p>
          <nav className="space-y-1">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : filteredDiscussions?.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground/60 text-center">
                {searchQuery ? 'No matching discussions' : 'No discussions yet'}
              </p>
            ) : (
              filteredDiscussions?.map((discussion) => {
                const isActive = location.pathname === `/discussion/${discussion.id}`

                return (
                  <div
                    key={discussion.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/discussion/${discussion.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/discussion/${discussion.id}`) } }}
                    className={cn(
                      'group relative flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer',
                      isActive
                        ? 'bg-accent/50 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-foreground/70'
                        : 'hover:bg-accent/30'
                    )}
                  >
                    {/* Status dot */}
                    <span
                      className={cn(
                        'mt-[7px] h-2 w-2 rounded-full flex-shrink-0',
                        STATUS_DOT_COLORS[discussion.status]
                      )}
                      title={discussion.status}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn(
                          'truncate text-sm leading-snug',
                          isActive ? 'font-medium text-foreground' : 'text-foreground/80'
                        )}>
                          {discussion.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground/50 flex-shrink-0 tabular-nums">
                          {timeAgo(discussion.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/50 truncate mt-0.5 leading-relaxed">
                        {discussion.topic}
                      </p>
                    </div>

                    {/* Three-dot menu - visible on hover only */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="flex-shrink-0 p-1 rounded hover:bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => handleEdit(discussion.id, discussion.status)}
                          disabled={discussion.status === 'running' || discussion.status === 'paused'}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleDelete(discussion.id, discussion.title, discussion.status)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Discussion
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              })
            )}
          </nav>
        </ScrollArea>

        {/* User Menu */}
        <div className="border-t p-3">
          <UserMenu />
        </div>
      </aside>

      <CreateDiscussionDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
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
          variant={confirmDialog.variant}
          onConfirm={confirmDialog.onConfirm}
        />
      )}
    </>
  )
}
