import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { EndNodeData } from '@/types/graph'

export const EndNode = memo(function EndNode(props: NodeProps<Node<EndNodeData, 'end'>>) {
  return (
    <BaseNode
      {...props}
      nodeType="end"
      showSourceHandle={false}
    >
      <p className="text-xs text-muted-foreground">
        End
      </p>
    </BaseNode>
  )
})
