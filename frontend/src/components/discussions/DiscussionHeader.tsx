import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Play, Pause, Square, Loader2, Download, MoreHorizontal, Pencil, Trash2, Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiscussionStatus } from '@/types'

interface DiscussionHeaderProps {
  title: string
  status: DiscussionStatus
  wsStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  isPausing: boolean
  isStartPending: boolean
  isPausePending: boolean
  isStopPending: boolean
  isResetPending: boolean
  onStart: () => void
  onPause: () => void
  onStop: () => void
  onExport: () => void
  onEdit: () => void
  onDeleteRequest: () => void
  onResetRequest: () => void
}

export function DiscussionHeader({
  title,
  status,
  wsStatus,
  isPausing,
  isStartPending,
  isPausePending,
  isStopPending,
  isResetPending,
  onStart,
  onPause,
  onStop,
  onExport,
  onEdit,
  onDeleteRequest,
  onResetRequest,
}: DiscussionHeaderProps) {
  return (
    <div className="border-b px-6 py-3 flex-shrink-0 bg-card/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <StatusDot status={status} />
          {status === 'running' && (
            <ConnectionIndicator status={wsStatus} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {(status === 'paused' || status === 'completed' || status === 'failed') && (
            <Button size="sm" className="shadow-soft" onClick={onStart} disabled={isStartPending}>
              <Play className="h-4 w-4 mr-2" />
              {status === 'paused' ? 'Resume' : 'Restart'}
            </Button>
          )}
          {status === 'running' && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="shadow-soft"
                onClick={onPause}
                disabled={isPausePending || isPausing}
              >
                {isPausing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-2" />
                )}
                {isPausing ? 'Pausing...' : 'Pause'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="shadow-soft"
                onClick={onStop}
                disabled={isStopPending}
              >
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            </>
          )}
          {status === 'completed' && (
            <Button size="sm" variant="outline" className="shadow-soft" onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
          {status !== 'running' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onResetRequest}
              disabled={isResetPending}
              title="Clear all messages and reset to draft"
            >
              <Eraser className="h-4 w-4" />
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={onEdit}
                disabled={status === 'running' || status === 'paused'}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDeleteRequest} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Discussion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

function ConnectionIndicator({ status }: { status: 'connecting' | 'connected' | 'disconnected' | 'error' }) {
  const dotColor = cn(
    'w-2 h-2 rounded-full flex-shrink-0',
    status === 'connected' && 'bg-green-500',
    status === 'connecting' && 'bg-yellow-500 animate-pulse',
    (status === 'disconnected' || status === 'error') && 'bg-red-500'
  )

  const label =
    status === 'connected' ? 'Live' :
    status === 'connecting' ? 'Connecting' :
    status === 'disconnected' ? 'Disconnected' :
    'Error'

  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className={dotColor} />
      <span className="text-[11px] text-muted-foreground hidden sm:inline">{label}</span>
    </div>
  )
}

const STATUS_DOT_COLORS: Record<string, string> = {
  draft: 'bg-muted-foreground',
  running: 'bg-green-500',
  paused: 'bg-yellow-500',
  completed: 'bg-blue-500',
  failed: 'bg-red-500',
}

function StatusDot({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[status] || 'bg-muted-foreground', status === 'running' && 'animate-pulse')} />
      <span className="text-xs text-muted-foreground capitalize">{status}</span>
    </div>
  )
}
