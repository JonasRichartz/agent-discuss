import { useGraphStore } from '@/stores/graphStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NODE_STYLES, type NodeType } from '@/types/graph'
import type { LucideProps } from 'lucide-react'
import {
  Plus,
  Trash2,
  Save,
  Undo2,
  Redo2,
  Play,
  Square,
  MessageSquare,
  Star,
  Repeat,
  GitBranch,
  FileText,
} from 'lucide-react'

const ICONS: Record<NodeType, React.ComponentType<LucideProps>> = {
  start: Play,
  end: Square,
  generate: MessageSquare,
  evaluate: Star,
  loop: Repeat,
  decision: GitBranch,
  summary: FileText,
}

// Node types that can be added (not start/end as they're always present)
const ADDABLE_NODE_TYPES: NodeType[] = ['generate', 'evaluate', 'loop', 'decision', 'summary']

interface GraphToolbarProps {
  onSave?: () => void
}

export function GraphToolbar({ onSave }: GraphToolbarProps) {
  const addNode = useGraphStore((state) => state.addNode)
  const deleteNode = useGraphStore((state) => state.deleteNode)
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const nodes = useGraphStore((state) => state.nodes)
  const undo = useGraphStore((s) => s.undo)
  const redo = useGraphStore((s) => s.redo)
  const canUndo = useGraphStore((s) => s.historyIndex > 0)
  const canRedo = useGraphStore((s) => s.historyIndex < s.history.length - 1)

  const handleAddNode = (type: NodeType) => {
    // Calculate position for new node
    // Place it to the right of the rightmost node
    const maxX = Math.max(...nodes.map((n) => n.position.x), 0)
    const avgY = nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length || 200

    addNode(type, { x: maxX + 250, y: avgY })
  }

  const handleDelete = () => {
    if (selectedNodeId && selectedNodeId !== 'start' && selectedNodeId !== 'end') {
      deleteNode(selectedNodeId)
    }
  }

  const canDelete =
    selectedNodeId && selectedNodeId !== 'start' && selectedNodeId !== 'end'

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg border bg-card/95 backdrop-blur-sm shadow-sm px-2 py-1.5">
      {/* Add Node Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Node
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {ADDABLE_NODE_TYPES.map((type) => {
            const Icon = ICONS[type]
            const style = NODE_STYLES[type]
            return (
              <DropdownMenuItem
                key={type}
                onClick={() => handleAddNode(type)}
                className="gap-2"
              >
                <Icon className="h-4 w-4" style={{ color: style.color }} />
                <div>
                  <p className="font-medium capitalize">{type}</p>
                  <p className="text-xs text-muted-foreground">
                    {style.description}
                  </p>
                </div>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-4 w-px bg-border" />

      {/* Delete Selected */}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={handleDelete}
        disabled={!canDelete}
        title="Delete selected node"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <div className="h-4 w-px bg-border" />

      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      {onSave && (
        <>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onSave} title="Save graph">
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
        </>
      )}
    </div>
  )
}
