'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Panel,
  PanelHeader,
  Segmented,
  useToast,
} from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

const EXPIRY_PRESETS = [
  { value: '24', hours: 24 },
  { value: '72', hours: 72 },
  { value: '168', hours: 168 },
  { value: '0', hours: 0 },
] as const

export function IssueSecretPanel({
  title,
  description,
  issueLabel,
  latestLabel,
  copiedMessage,
  latestValue,
  isPending,
  onIssue,
  onAcknowledge,
}: {
  title: string
  description: string
  issueLabel: string
  latestLabel: string
  copiedMessage: string
  latestValue: string | null
  isPending: boolean
  onIssue: (input: { label: string; expiresInHours: number }) => void
  onAcknowledge: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [label, setLabel] = useState('')
  const [expiry, setExpiry] = useState<string>('72')

  const autoCopiedValue = useRef<string | null>(null)

  useEffect(() => {
    if (!latestValue || autoCopiedValue.current === latestValue) return
    autoCopiedValue.current = latestValue
    if (!navigator.clipboard) return

    void navigator.clipboard
      .writeText(latestValue)
      .then(() => toast(d.adminConsole.autoCopied, 'success'))
      .catch(() => toast(d.adminConsole.copyFailed, 'error'))
  }, [latestValue, toast, d])

  const expiryOptions = [
    { value: EXPIRY_PRESETS[0].value, label: d.adminConsole.expiry.h24 },
    { value: EXPIRY_PRESETS[1].value, label: d.adminConsole.expiry.h72 },
    { value: EXPIRY_PRESETS[2].value, label: d.adminConsole.expiry.h168 },
    { value: EXPIRY_PRESETS[3].value, label: d.adminConsole.expiry.never },
  ]

  function copy(value: string, message: string) {
    if (!navigator.clipboard) {
      toast(d.adminConsole.copyUnsupported, 'error')
      return
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast(message, 'success'))
      .catch(() => toast(d.adminConsole.copyFailed, 'error'))
  }

  function issue() {
    if (isPending || latestValue !== null || !label.trim()) return
    onIssue({ label: label.trim(), expiresInHours: Number(expiry) })
    setLabel('')
  }

  const blockedReason = latestValue !== null ? d.adminConsole.acknowledgeFirst : undefined
  const missingLabel = !label.trim() ? d.adminConsole.memoRequired : undefined

  return (
    <Panel className="space-y-4">
      <PanelHeader title={title} description={description} />
      <Field label={d.adminConsole.memoLabel}>
        {(control) => (
          <Input
            {...control}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={d.adminConsole.memoPlaceholder}
            maxLength={40}
          />
        )}
      </Field>
      <Segmented
        value={expiry}
        onChange={setExpiry}
        options={expiryOptions}
        ariaLabel={d.adminConsole.expiryLabel}
        size="sm"
        className="grid-cols-4"
      />
      <Button
        type="button"
        variant="primary"
        className="w-full"
        loading={isPending}
        disabled={latestValue !== null || !label.trim()}
        disabledReason={blockedReason ?? missingLabel}
        onClick={issue}
      >
        {issueLabel}
      </Button>
      {latestValue ? (
        <Alert tone="warn" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs">{latestLabel}</p>
            <Badge tone="warn">{d.adminConsole.oneTimeWarning}</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <code className="min-w-0 truncate font-mono text-lg font-bold tracking-[0.18em] text-text">
              {latestValue}
            </code>
            <Button type="button" size="sm" onClick={() => copy(latestValue, copiedMessage)}>
              {d.adminConsole.copy}
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={onAcknowledge}
          >
            {d.adminConsole.acknowledge}
          </Button>
        </Alert>
      ) : null}
    </Panel>
  )
}