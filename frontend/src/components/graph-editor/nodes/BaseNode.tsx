import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { useGraphStore } from '@/stores/graphStore'
import type { GraphNodeData, NodeType } from '@/types/graph'
import { NODE_STYLES } from '@/types/graph'
import type { LucideProps } from 'lucide-react'
import {
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

interface BaseNodeProps extends NodeProps<Node<GraphNodeData, NodeType>> {
  nodeType: NodeType
  showSourceHandle?: boolean
  showTargetHandle?: boolean
  sourceHandles?: string[]
  children?: React.ReactNode
}

export const BaseNode = memo(function BaseNode({
  id,
  data,
  selected,
  nodeType,
  showSourceHandle = true,
  showTargetHandle = true,
  sourceHandles,
  children,
}: BaseNodeProps) {
  const selectNode = useGraphStore((state) => state.selectNode)
  const style = NODE_STYLES[nodeType]
  const Icon = ICONS[nodeType]

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border-2 bg-card shadow-md min-w-[150px] max-w-[200px] transition-shadow',
        selected && 'shadow-lg ring-2 ring-primary/50'
      )}
      style={{ borderColor: style.color }}
      onClick={() => selectNode(id)}
    >
      {/* Target Handle (input) */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div
          className="p-1 rounded"
          style={{ backgroundColor: style.color + '20' }}
        >
          <Icon className="w-4 h-4" style={{ color: style.color }} />
        </div>
        <span className="font-medium text-sm truncate">{data.label}</span>
      </div>

      {/* Node type indicator */}
      <div
        className="text-[10px] uppercase tracking-wide mb-2"
        style={{ color: style.color }}
      >
        {nodeType}
      </div>

      {/* Custom content */}
      {children}

      {/* Source Handle(s) (output) */}
      {showSourceHandle && !sourceHandles && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
        />
      )}

      {/* Multiple source handles for decision nodes */}
      {sourceHandles?.map((handleId, index) => (
        <Handle
          key={handleId}
          id={handleId}
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
          style={{
            top: `${30 + index * 30}%`,
          }}
        />
      ))}
    </div>
  )
})
