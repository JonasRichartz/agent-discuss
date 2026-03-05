import { StartNode } from './StartNode'
import { EndNode } from './EndNode'
import { GenerateNode } from './GenerateNode'
import { EvaluateNode } from './EvaluateNode'
import { LoopNode } from './LoopNode'
import { DecisionNode } from './DecisionNode'
import { SummaryNode } from './SummaryNode'
import type { NodeTypes } from '@xyflow/react'

export const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  generate: GenerateNode,
  evaluate: EvaluateNode,
  loop: LoopNode,
  decision: DecisionNode,
  summary: SummaryNode,
}

export {
  StartNode,
  EndNode,
  GenerateNode,
  EvaluateNode,
  LoopNode,
  DecisionNode,
  SummaryNode,
}
