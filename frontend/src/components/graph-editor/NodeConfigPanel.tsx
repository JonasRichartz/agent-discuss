import { useGraphStore } from '@/stores/graphStore'
import { useDiscussionParticipants } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { NODE_STYLES, type NodeType, type GraphNodeData } from '@/types/graph'
import { X, Plus, Trash2, Check } from 'lucide-react'
import { useState } from 'react'
import { getInitials } from '@/lib/utils'

interface NodeConfigPanelProps {
  discussionId?: string
}

export function NodeConfigPanel({ discussionId }: NodeConfigPanelProps) {
  const nodes = useGraphStore((state) => state.nodes)
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const deleteNode = useGraphStore((state) => state.deleteNode)
  const selectNode = useGraphStore((state) => state.selectNode)

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  if (!selectedNode) {
    return (
      <div className="w-80 border-l bg-card p-4">
        <p className="text-sm text-muted-foreground text-center">
          Select a node to edit its properties
        </p>
      </div>
    )
  }

  const nodeType = selectedNode.type as NodeType
  const style = NODE_STYLES[nodeType]
  const canDelete = selectedNodeId !== 'start' && selectedNodeId !== 'end'

  const handleUpdate = (data: Partial<GraphNodeData>) => {
    if (selectedNodeId) {
      updateNodeData(selectedNodeId, data)
    }
  }

  return (
    <div className="w-80 border-l bg-card flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: style.color }}
          />
          <span className="font-medium capitalize">{nodeType} Node</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Label (all nodes) */}
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={selectedNode.data.label ?? ''}
              onChange={(e) => handleUpdate({ label: e.target.value })}
              placeholder="Node label"
            />
          </div>

          <Separator />

          {/* Type-specific fields */}
          <NodeTypeFields
            type={nodeType}
            data={selectedNode.data}
            onUpdate={handleUpdate}
            discussionId={discussionId}
          />
        </div>
      </ScrollArea>

      {/* Footer */}
      {canDelete && (
        <div className="p-4 border-t">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => deleteNode(selectedNodeId!)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Node
          </Button>
        </div>
      )}
    </div>
  )
}

interface NodeTypeFieldsProps {
  type: NodeType
  data: GraphNodeData
  onUpdate: (data: Partial<GraphNodeData>) => void
  discussionId?: string
}

function NodeTypeFields({ type, data, onUpdate, discussionId }: NodeTypeFieldsProps) {
  switch (type) {
    case 'start':
      return <StartEndInfo type="start" />
    case 'end':
      return <StartEndInfo type="end" />
    case 'generate':
      return <GenerateNodeFields data={data} onUpdate={onUpdate} discussionId={discussionId} />
    case 'evaluate':
      return <EvaluateNodeFields data={data} onUpdate={onUpdate} />
    case 'loop':
      return <LoopNodeFields data={data} onUpdate={onUpdate} />
    case 'decision':
      return <DecisionNodeFields data={data} onUpdate={onUpdate} />
    case 'summary':
      return <SummaryNodeFields data={data} onUpdate={onUpdate} />
    default:
      return null
  }
}

function StartEndInfo({ type }: { type: 'start' | 'end' }) {
  return (
    <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground space-y-1">
      <p>
        {type === 'start'
          ? 'Marks the beginning of the discussion. A notification is sent when the discussion starts.'
          : 'Marks the end of the discussion. A notification is sent when the discussion completes.'}
      </p>
      <p>
        {type === 'start'
          ? 'Add Generate, Evaluate, Loop, Decision, or Summary nodes after this to define conversation behavior.'
          : 'Connect here from the done handle of a Loop node or from an Evaluate node.'}
      </p>
    </div>
  )
}

function GenerateNodeFields({ data, onUpdate, discussionId }: { data: GraphNodeData; onUpdate: (d: Partial<GraphNodeData>) => void; discussionId?: string }) {
  // Uses discussion participants (not agent templates) — specific_agent_ids stores participant IDs
  const { data: participants } = useDiscussionParticipants(discussionId)
  const genData = data as {
    prompt_template: string
    agent_selection: string
    specific_agent_ids?: string[]
    max_turns: number
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Prompt Template</Label>
        <Textarea
          value={genData.prompt_template ?? ''}
          onChange={(e) => onUpdate({ prompt_template: e.target.value })}
          placeholder="Instructions for participants..."
          className="min-h-[120px]"
        />
        <p className="text-xs text-muted-foreground">
          Use {'{topic}'}, {'{context}'}, {'{previous}'} as placeholders.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Participant Selection</Label>
        <Select
          value={genData.agent_selection ?? 'round_robin'}
          onValueChange={(value) => onUpdate({ agent_selection: value as 'round_robin' | 'parallel' | 'specific' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="round_robin">Round Robin</SelectItem>
            <SelectItem value="parallel">Parallel (all at once)</SelectItem>
            <SelectItem value="specific">Specific Participants</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {genData.agent_selection === 'specific' && (
        <div className="space-y-2">
          <Label>Select Participants</Label>
          {!discussionId ? (
            <p className="text-xs text-muted-foreground">
              Save the discussion first to select participants.
            </p>
          ) : !participants || participants.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No participants yet. Add participants using the bar above.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {participants.map((participant) => {
                const isSelected = genData.specific_agent_ids?.includes(participant.id)
                return (
                  <Badge
                    key={participant.id}
                    variant={isSelected ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      const current = genData.specific_agent_ids ?? []
                      const updated = isSelected
                        ? current.filter((id) => id !== participant.id)
                        : [...current, participant.id]
                      onUpdate({ specific_agent_ids: updated })
                    }}
                  >
                    {getInitials(participant.name)} {participant.name}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Max Turns: {genData.max_turns ?? 3}</Label>
        <Slider
          value={[genData.max_turns ?? 3]}
          onValueChange={([value]) => onUpdate({ max_turns: value })}
          min={1}
          max={20}
          step={1}
        />
        <p className="text-xs text-muted-foreground">
          Number of participant responses before moving to next node.
        </p>
      </div>
    </div>
  )
}

function EvaluateNodeFields({ data, onUpdate }: { data: GraphNodeData; onUpdate: (d: Partial<GraphNodeData>) => void }) {
  const evalData = data as {
    criteria: string[]
    voting_method: string
    min_score_threshold?: number
    evaluation_prompt?: string
  }
  const [newCriterion, setNewCriterion] = useState('')

  const addCriterion = () => {
    if (newCriterion.trim()) {
      onUpdate({ criteria: [...(evalData.criteria ?? []), newCriterion.trim()] })
      setNewCriterion('')
    }
  }

  const removeCriterion = (index: number) => {
    onUpdate({ criteria: (evalData.criteria ?? []).filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Evaluation Prompt</Label>
        <Textarea
          value={evalData.evaluation_prompt ?? ''}
          onChange={(e) => onUpdate({ evaluation_prompt: e.target.value })}
          placeholder="Instructions for evaluation..."
          className="min-h-[80px]"
        />
      </div>

      <div className="space-y-2">
        <Label>Criteria</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {(evalData.criteria ?? []).map((criterion, index) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {criterion}
              <button
                onClick={() => removeCriterion(index)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            placeholder="Add criterion..."
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCriterion())}
          />
          <Button size="icon" variant="outline" onClick={addCriterion}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Voting Method</Label>
        <Select
          value={evalData.voting_method ?? 'consensus'}
          onValueChange={(value) => onUpdate({ voting_method: value as 'consensus' | 'majority' | 'score' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="consensus">Consensus</SelectItem>
            <SelectItem value="majority">Majority</SelectItem>
            <SelectItem value="score">Score Threshold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {evalData.voting_method === 'score' && (
        <div className="space-y-2">
          <Label>Min Score: {evalData.min_score_threshold ?? 7}/10</Label>
          <Slider
            value={[evalData.min_score_threshold ?? 7]}
            onValueChange={([value]) => onUpdate({ min_score_threshold: value })}
            min={1}
            max={10}
            step={1}
          />
        </div>
      )}
    </div>
  )
}

function LoopNodeFields({ data, onUpdate }: { data: GraphNodeData; onUpdate: (d: Partial<GraphNodeData>) => void }) {
  const loopData = data as {
    max_iterations: number
    loop_exit_condition?: string
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Max Iterations: {loopData.max_iterations ?? 3}</Label>
        <Slider
          value={[loopData.max_iterations ?? 3]}
          onValueChange={([value]) => onUpdate({ max_iterations: value })}
          min={1}
          max={50}
          step={1}
        />
        <p className="text-xs text-muted-foreground">
          Number of times to repeat the loop body before exiting.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Early Exit Condition</Label>
        <Select
          value={loopData.loop_exit_condition ?? 'none'}
          onValueChange={(value) => onUpdate({ loop_exit_condition: value === 'none' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (run all iterations)</SelectItem>
            <SelectItem value="evaluate_agree">Exit when consensus reached</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Optionally exit early when an evaluate node reaches agreement.
        </p>
      </div>

      <div className="p-3 bg-muted rounded-lg text-sm">
        <p className="font-medium mb-1">Output Handles</p>
        <p className="text-muted-foreground text-xs">
          <span className="font-medium text-violet-500">repeat</span> — connect to the loop body (e.g., Generate node).
          <br />
          <span className="font-medium text-emerald-500">done</span> — connect to the exit path (e.g., End node).
        </p>
      </div>
    </div>
  )
}

function DecisionNodeFields({ data, onUpdate }: { data: GraphNodeData; onUpdate: (d: Partial<GraphNodeData>) => void }) {
  const decisionData = data as {
    condition: 'consensus_reached' | 'max_turns' | 'custom'
    custom_condition?: string
    branches: string[]
  }
  const [newBranch, setNewBranch] = useState('')

  const addBranch = () => {
    if (newBranch.trim()) {
      onUpdate({ branches: [...(decisionData.branches ?? []), newBranch.trim()] })
      setNewBranch('')
    }
  }

  const removeBranch = (index: number) => {
    const updated = (decisionData.branches ?? []).filter((_, i) => i !== index)
    if (updated.length >= 2) {
      onUpdate({ branches: updated })
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Condition Type</Label>
        <Select
          value={decisionData.condition ?? 'consensus_reached'}
          onValueChange={(value) => onUpdate({ condition: value as 'consensus_reached' | 'max_turns' | 'custom' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="consensus_reached">Consensus Reached</SelectItem>
            <SelectItem value="max_turns">Max Turns Reached</SelectItem>
            <SelectItem value="custom">Custom (LLM-evaluated)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Determines how the decision is evaluated to pick a branch.
        </p>
      </div>

      {decisionData.condition === 'custom' && (
        <div className="space-y-2">
          <Label>Custom Condition</Label>
          <Textarea
            value={decisionData.custom_condition ?? ''}
            onChange={(e) => onUpdate({ custom_condition: e.target.value })}
            placeholder="Describe the branching condition for LLM evaluation..."
            className="min-h-[80px]"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Branches</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {(decisionData.branches ?? []).map((branch, index) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {branch}
              {(decisionData.branches ?? []).length > 2 && (
                <button
                  onClick={() => removeBranch(index)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            placeholder="Add branch..."
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBranch())}
          />
          <Button size="icon" variant="outline" onClick={addBranch}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Each branch creates an output handle. Minimum 2 branches required.
        </p>
      </div>

      <div className="p-3 bg-muted rounded-lg text-sm">
        <p className="font-medium mb-1">Output Handles</p>
        <p className="text-muted-foreground text-xs">
          Each branch label becomes a separate output handle.
          Connect each to different paths in your discussion graph.
        </p>
      </div>
    </div>
  )
}

function SummaryNodeFields({ data, onUpdate }: { data: GraphNodeData; onUpdate: (d: Partial<GraphNodeData>) => void }) {
  const summaryData = data as {
    summary_prompt: string
    include_in_context: boolean
    max_length?: number
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Summary Prompt</Label>
        <Textarea
          value={summaryData.summary_prompt ?? ''}
          onChange={(e) => onUpdate({ summary_prompt: e.target.value })}
          placeholder="Instructions for generating the summary..."
          className="min-h-[120px]"
        />
        <p className="text-xs text-muted-foreground">
          Use {'{topic}'}, {'{context}'} as placeholders.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Include in Context</Label>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={summaryData.include_in_context ? 'default' : 'outline'}
            onClick={() => onUpdate({ include_in_context: true })}
          >
            <Check className="h-3 w-3 mr-1" />
            Add to Context
          </Button>
          <Button
            size="sm"
            variant={!summaryData.include_in_context ? 'default' : 'outline'}
            onClick={() => onUpdate({ include_in_context: false })}
          >
            Standalone Only
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          When enabled, the summary is added to the running context for subsequent nodes.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Max Length (tokens): {summaryData.max_length ?? 'Unlimited'}</Label>
        <Slider
          value={[summaryData.max_length ?? 0]}
          onValueChange={([value]) => onUpdate({ max_length: value === 0 ? undefined : value })}
          min={0}
          max={4000}
          step={100}
        />
        <p className="text-xs text-muted-foreground">
          Set to 0 for unlimited. Limits the summary output length.
        </p>
      </div>
    </div>
  )
}
