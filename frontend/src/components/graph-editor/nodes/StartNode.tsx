import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { StartNodeData } from '@/types/graph'

export const StartNode = memo(function StartNode(props: NodeProps<Node<StartNodeData, 'start'>>) {
  return (
    <BaseNode
      {...props}
      nodeType="start"
      showTargetHandle={false}
    >
      <p className="text-xs text-muted-foreground">
        Start
      </p>
    </BaseNode>
  )
})
