'use client'

import { useState, useTransition } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Panel,
  PanelHeader,
  Select,
  useToast,
} from '@/components/ui'
import { translateError, useDict } from '@/lib/i18n/client'
import { saveVisionSettings } from '@/features/jokbo-advisor/vision/settings-actions'
import type { VisionProvider, VisionSettingsView } from '@/features/jokbo-advisor/vision/settings'

const DEFAULT_VISION_MODELS: Record<VisionProvider, string> = {
  anthropic: 'claude-sonnet-5',
  gemini: 'gemini-3.6-flash',
}

export function VisionSettingsPanel({
  settings,
  onDataChanged,
}: {
  settings: VisionSettingsView
  onDataChanged: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [provider, setProvider] = useState<VisionProvider>(settings.provider)
  const [model, setModel] = useState(settings.model)

  const providerAvailable =
    provider === 'anthropic' ? settings.hasAnthropicApiKey : settings.hasGeminiApiKey
  const live = enabled && providerAvailable
  const blockedReason = !model.trim()
    ? d.adminConsole.vision.modelRequired
    : enabled && !providerAvailable
      ? d.adminConsole.vision.keyRequired
      : undefined

  function save() {
    if (isPending || blockedReason) return
    startTransition(async () => {
      const result = await saveVisionSettings({ enabled, provider, model: model.trim() })
      if (result.success) {
        toast(enabled ? d.adminConsole.vision.savedEnabled : d.adminConsole.vision.saved, 'success')
        onDataChanged()
      } else {
        toast(translateError(d, result.error), 'error')
      }
    })
  }

  return (
    <Panel className="space-y-4">
      <PanelHeader
        title={d.adminConsole.vision.title}
        description={d.adminConsole.vision.description}
        badge={
          <Badge tone={live ? 'win' : 'muted'}>{live ? d.adminConsole.on : d.adminConsole.off}</Badge>
        }
      />
      <Checkbox
        label={d.adminConsole.vision.enable}
        checked={enabled}
        disabled={!providerAvailable && !enabled}
        hint={providerAvailable ? undefined : d.adminConsole.vision.keyRequired}
        title={providerAvailable ? undefined : d.adminConsole.vision.keyRequired}
        onChange={(event) => setEnabled(event.target.checked)}
      />
      <Field label={d.adminConsole.vision.providerLabel}>
        {(control) => (
          <Select
            {...control}
            value={provider}
            onChange={(event) => {
              const next = event.target.value as VisionProvider
              setProvider(next)
              setModel(DEFAULT_VISION_MODELS[next])
              const available =
                next === 'anthropic' ? settings.hasAnthropicApiKey : settings.hasGeminiApiKey
              if (!available) setEnabled(false)
            }}
          >
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </Select>
        )}
      </Field>
      <Field label={d.adminConsole.vision.modelLabel}>
        {(control) => (
          <Input
            {...control}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={DEFAULT_VISION_MODELS[provider]}
            maxLength={120}
            autoCapitalize="off"
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone={settings.hasAnthropicApiKey ? 'win' : 'muted'}>
          {d.adminConsole.vision.anthropicKey}:{' '}
          {settings.hasAnthropicApiKey
            ? d.adminConsole.vision.keySet
            : d.adminConsole.vision.keyUnset}
        </Badge>
        <Badge tone={settings.hasGeminiApiKey ? 'win' : 'muted'}>
          {d.adminConsole.vision.geminiKey}:{' '}
          {settings.hasGeminiApiKey ? d.adminConsole.vision.keySet : d.adminConsole.vision.keyUnset}
        </Badge>
      </div>
      <p className="text-xs text-muted">{d.adminConsole.vision.note}</p>
      <Button
        type="button"
        variant="primary"
        className="w-full"
        loading={isPending}
        disabled={Boolean(blockedReason)}
        disabledReason={blockedReason}
        onClick={save}
      >
        {d.adminConsole.vision.save}
      </Button>
    </Panel>
  )
}