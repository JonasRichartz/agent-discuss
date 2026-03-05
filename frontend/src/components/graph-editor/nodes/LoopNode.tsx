import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { LoopNodeData } from '@/types/graph'

export const LoopNode = memo(function LoopNode(props: NodeProps<Node<LoopNodeData, 'loop'>>) {
  const { data } = props

  return (
    <BaseNode
      {...props}
      nodeType="loop"
      sourceHandles={['repeat', 'done']}
    >
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <span className="font-medium">Iterations:</span>{' '}
          {data.max_iterations}
        </p>
        {data.loop_exit_condition && (
          <p>
            <span className="font-medium">Early exit:</span>{' '}
            {data.loop_exit_condition === 'evaluate_agree' ? 'on consensus' : data.loop_exit_condition}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-500 rounded text-[10px]">
            repeat
          </span>
          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-500 rounded text-[10px]">
            done
          </span>
        </div>
      </div>
    </BaseNode>
  )
})
