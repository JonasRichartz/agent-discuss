import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { EvaluateNodeData } from '@/types/graph'

export const EvaluateNode = memo(function EvaluateNode(props: NodeProps<Node<EvaluateNodeData, 'evaluate'>>) {
  const { data } = props

  return (
    <BaseNode {...props} nodeType="evaluate">
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <span className="font-medium">Method:</span>{' '}
          {data.voting_method}
        </p>
        <p>
          <span className="font-medium">Criteria:</span>{' '}
          {data.criteria.length}
        </p>
      </div>
    </BaseNode>
  )
})
