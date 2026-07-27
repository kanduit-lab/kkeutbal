'use client'

import { useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Field, Input, Panel, Segmented, useToast } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

/**
 * 1회용 비밀값(가입코드·게스트 토큰) 발급 패널. 두 패널이 라벨만 다른 채 복붙돼 있었고
 * 그래서 "한 번만 확인할 수 있습니다" 안내가 한쪽에만 붙어 있었다 — 하나로 합친다.
 *
 * 서버는 해시만 저장하므로 여기 화면에서 사라진 평문은 복구할 수 없다. 그래서
 * 발급 즉시 자동 복사를 시도하고, 값이 떠 있는 동안에는 재발급을 막는다 —
 * 새 발급이 이전 값을 조용히 덮어써서 잃어버리는 경로를 없앤다.
 */

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
  // 같은 값에 대해 자동 복사는 한 번만 — 리렌더마다 클립보드를 다시 덮어쓰지 않는다.
  const autoCopiedValue = useRef<string | null>(null)

  useEffect(() => {
    if (!latestValue || autoCopiedValue.current === latestValue) return
    autoCopiedValue.current = latestValue
    if (!navigator.clipboard) return
    // 실패해도 조용히 넘어가지 않는다 — 아래 복사 버튼을 쓰라는 안내가 뜬다.
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
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
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
