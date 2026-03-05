import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { SummaryNodeData } from '@/types/graph'

export const SummaryNode = memo(function SummaryNode(props: NodeProps<Node<SummaryNodeData, 'summary'>>) {
  const { data } = props

  return (
    <BaseNode {...props} nodeType="summary">
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <span className="font-medium">Messages:</span>{' '}
          {data.include_all_messages ? 'All' : 'Filtered'}
        </p>
        {data.max_length && (
          <p>
            <span className="font-medium">Max length:</span>{' '}
            {data.max_length}
          </p>
        )}
      </div>
    </BaseNode>
  )
})
