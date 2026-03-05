import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import type { ParticipantCreate, LLMProvider } from '@/types'

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']

interface ParticipantFormProps {
  formData: ParticipantCreate
  onChange: (data: ParticipantCreate) => void
  providers: LLMProvider[] | undefined
}

export function ParticipantForm({ formData, onChange, providers }: ParticipantFormProps) {
  return (
    <div className="space-y-4 pb-4 px-1">
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => onChange({ ...formData, name: e.target.value })}
          placeholder="Participant display name"
          required
        />
      </div>

      <div>
        <Label htmlFor="model">Model *</Label>
        <Select
          value={
            formData.provider_id && formData.model_name
              ? `${formData.provider_id}:${formData.model_name}`
              : ''
          }
          onValueChange={(value) => {
            const [providerId, ...modelParts] = value.split(':')
            const modelName = modelParts.join(':')
            onChange({ ...formData, provider_id: providerId, model_name: modelName })
          }}
        >
          <SelectTrigger id="model">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {providers?.flatMap((provider) =>
              provider.available_models.map((model) => (
                <SelectItem key={`${provider.id}:${model}`} value={`${provider.id}:${model}`}>
                  {model} ({provider.name})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="prompt">System Prompt *</Label>
        <Textarea
          id="prompt"
          value={formData.system_prompt}
          onChange={(e) => onChange({ ...formData, system_prompt: e.target.value })}
          placeholder="Instructions that define the participant's behavior"
          rows={4}
          required
        />
      </div>

      <div>
        <Label>Temperature: {formData.temperature}</Label>
        <Slider
          value={[formData.temperature ?? 0.7]}
          onValueChange={([v]) => onChange({ ...formData, temperature: v })}
          min={0}
          max={2}
          step={0.1}
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="maxTokens">Max Tokens</Label>
        <Input
          id="maxTokens"
          type="number"
          value={formData.max_tokens}
          onChange={(e) => onChange({ ...formData, max_tokens: parseInt(e.target.value) || 4096 })}
          min={100}
        />
      </div>

      <div>
        <Label>Avatar Color</Label>
        <div className="flex gap-1.5 flex-wrap mt-2">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`w-8 h-8 rounded-full border-2 transition-colors ${
                formData.avatar_color === color ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              onClick={() => onChange({ ...formData, avatar_color: color })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
