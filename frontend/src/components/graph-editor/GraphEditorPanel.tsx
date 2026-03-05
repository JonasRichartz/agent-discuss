import { ReactFlowProvider } from '@xyflow/react'
import { useUIStore } from '@/stores/uiStore'
import { useGraphStore } from '@/stores/graphStore'
import { Button } from '@/components/ui/button'
import { GraphCanvas } from './GraphCanvas'
import { GraphToolbar } from './GraphToolbar'
import { NodeConfigPanel } from './NodeConfigPanel'

import { GraphEditorProvider } from './GraphEditorContext'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GraphEditorPanelProps {
  discussionId?: string
  readOnly?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave?: (graphDefinition: { nodes: any[]; edges: any[] }) => void
  onClose?: () => void
}

export function GraphEditorPanel({ discussionId, readOnly, onSave, onClose }: GraphEditorPanelProps) {
  const { graphPanelOpen, setGraphPanelOpen } = useUIStore()
  const getGraphDefinition = useGraphStore((state) => state.getGraphDefinition)

  const handleSave = () => {
    const definition = getGraphDefinition()
    onSave?.(definition)
  }

  const handleClose = () => {
    setGraphPanelOpen(false)
    onClose?.()
  }

  return (
    <GraphEditorProvider value={{ discussionId }}>
      <div className="flex-shrink-0">
      {/* Collapsed Bar — no border-t to align with Settings above */}
      {!graphPanelOpen && (
        <div className="p-2 border-t bg-muted/40">
          <button
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setGraphPanelOpen(true)}
          >
            <ChevronUp className="h-4 w-4" />
            Open Graph Editor
          </button>
        </div>
      )}

      {/* Expanded Panel */}
      <div
        className={cn(
          'border-t bg-card transition-all duration-300 overflow-hidden',
          graphPanelOpen ? (readOnly ? 'h-[35vh]' : 'h-[60vh]') : 'h-0'
        )}
      >
        {graphPanelOpen && (
          <div className="h-full flex flex-col">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
              <span className="text-sm font-medium">Conversation Flow Editor</span>
              <div className="flex items-center gap-2">
                {onClose && (
                  <Button variant="ghost" size="icon" onClick={handleClose}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGraphPanelOpen(false)}
                >
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Minimize
                </Button>
              </div>
            </div>

            {/* Main Content — canvas with floating toolbar */}
            <div className="flex-1 flex overflow-hidden">
              {/* Canvas with overlaid toolbar */}
              <div className="flex-1 relative">
                {!readOnly && <GraphToolbar onSave={onSave ? handleSave : undefined} />}
                <ReactFlowProvider>
                  <GraphCanvas />
                </ReactFlowProvider>
              </div>

              {/* Config Panel */}
              <NodeConfigPanel discussionId={discussionId} />
            </div>
          </div>
        )}
      </div>
      </div>
    </GraphEditorProvider>
  )
}
