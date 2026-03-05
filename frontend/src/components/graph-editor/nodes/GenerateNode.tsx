import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import { useGraphEditorContext } from '../GraphEditorContext'
import { useDiscussionParticipants } from '@/hooks/use-api'
import type { GenerateNodeData } from '@/types/graph'
import { getInitials } from '@/lib/utils'

const MAX_AVATARS = 5

export const GenerateNode = memo(function GenerateNode(props: NodeProps<Node<GenerateNodeData, 'generate'>>) {
  const { data } = props
  const { discussionId } = useGraphEditorContext()
  const { data: participants } = useDiscussionParticipants(discussionId)

  // Filter participants based on selection mode
  const displayParticipants =
    data.agent_selection === 'specific' && data.specific_agent_ids
      ? (participants ?? []).filter((p) => data.specific_agent_ids!.includes(p.id))
      : (participants ?? [])

  const overflow = displayParticipants.length - MAX_AVATARS

  return (
    <BaseNode {...props} nodeType="generate">
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <span className="font-medium">Mode:</span>{' '}
          {data.agent_selection.replace('_', ' ')}
        </p>
        <p>
          <span className="font-medium">Turns:</span> {data.max_turns}
        </p>
      </div>

      {displayParticipants.length > 0 && (
        <div className="flex items-center mt-1.5 -space-x-1">
          {displayParticipants.slice(0, MAX_AVATARS).map((p) => (
            <span
              key={p.id}
              title={p.name}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-semibold border border-background"
              style={{ backgroundColor: p.avatar_color + '30', color: p.avatar_color }}
            >
              {getInitials(p.name)}
            </span>
          ))}
          {overflow > 0 && (
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium bg-muted border border-background">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </BaseNode>
  )
})
