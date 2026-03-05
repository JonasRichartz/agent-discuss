import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { DecisionNodeData } from '@/types/graph'

export const DecisionNode = memo(function DecisionNode(props: NodeProps<Node<DecisionNodeData, 'decision'>>) {
  const { data } = props

  return (
    <BaseNode
      {...props}
      nodeType="decision"
      sourceHandles={data.branches ?? ['agree', 'disagree']}
    >
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <span className="font-medium">Condition:</span>{' '}
          {data.condition ? data.condition.slice(0, 50) + (data.condition.length > 50 ? '...' : '') : 'Not set'}
        </p>
        <div className="flex gap-2 mt-2">
          {(data.branches ?? []).map((branch) => (
            <span
              key={branch}
              className="px-1.5 py-0.5 bg-pink-500/20 text-pink-500 rounded text-[10px]"
            >
              {branch}
            </span>
          ))}
        </div>
      </div>
    </BaseNode>
  )
})
