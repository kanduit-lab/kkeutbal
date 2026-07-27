'use client'

import { useState, useTransition } from 'react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Panel,
  Segmented,
  useToast,
} from '@/components/ui'
import { format, translateError, useDict } from '@/lib/i18n/client'
import { createPromotion, deletePromotion, setPromotionActive } from '../actions'
import type { AdminPromotionView, PromotionKind } from '../types'

/** 관리자 콘솔의 배너·팝업 관리 섹션. admin-client 가 이미 커서 분리해 둔다. */

interface DraftState {
  kind: PromotionKind
  title: string
  body: string
  linkUrl: string
  linkLabel: string
  priority: string
  dismissHours: string
  startsInHours: string
  endsInHours: string
}

const EMPTY_DRAFT: DraftState = {
  kind: 'banner',
  title: '',
  body: '',
  linkUrl: '',
  linkLabel: '',
  priority: '0',
  dismissHours: '24',
  startsInHours: '0',
  endsInHours: '0',
}

/** 서버 스키마(actions.ts createSchema)와 같은 범위 — 눌러 보고 알게 하지 않는다. */
const NUMERIC_RANGE = {
  priority: { min: 0, max: 1000 },
  dismissHours: { min: 1, max: 24 * 30 },
  startsInHours: { min: 0, max: 24 * 365 },
  endsInHours: { min: 0, max: 24 * 365 },
} as const

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function inRange(value: string, key: keyof typeof NUMERIC_RANGE): boolean {
  const text = value.trim()
  if (!/^-?\d+$/.test(text)) return false
  const parsed = Number.parseInt(text, 10)
  return parsed >= NUMERIC_RANGE[key].min && parsed <= NUMERIC_RANGE[key].max
}

export function PromotionsAdmin({
  promotions,
  onDataChanged,
}: {
  promotions: readonly AdminPromotionView[]
  onDataChanged?: () => void
}) {
  const { d } = useDict()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [confirmTarget, setConfirmTarget] = useState<AdminPromotionView | null>(null)

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }))

  const numericKeys = Object.keys(NUMERIC_RANGE) as (keyof typeof NUMERIC_RANGE)[]
  const invalidNumeric = numericKeys.filter((key) => !inRange(draft[key], key))
  const blockedReason = !draft.title.trim()
    ? d.promotionsAdmin.titleRequired
    : invalidNumeric.length > 0
      ? d.promotionsAdmin.rangeInvalid
      : undefined

  const numericError = (key: keyof typeof NUMERIC_RANGE) =>
    draft[key].trim() !== '' && !inRange(draft[key], key)
      ? d.promotionsAdmin.rangeInvalid
      : undefined

  const submit = () => {
    if (pending || blockedReason) return
    startTransition(async () => {
      const result = await createPromotion({
        kind: draft.kind,
        title: draft.title.trim(),
        body: draft.body.trim(),
        linkUrl: draft.linkUrl.trim(),
        linkLabel: draft.linkLabel.trim(),
        priority: toInt(draft.priority),
        dismissHours: toInt(draft.dismissHours),
        startsInHours: toInt(draft.startsInHours),
        endsInHours: toInt(draft.endsInHours),
      })
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      toast(d.promotionsAdmin.created, 'success')
      setDraft(EMPTY_DRAFT)
      onDataChanged?.()
    })
  }

  const toggle = (promotion: AdminPromotionView) => {
    if (pending) return
    startTransition(async () => {
      const result = await setPromotionActive({
        promotionId: promotion.id,
        isActive: !promotion.isActive,
      })
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      // 성공 피드백이 없으면 재조회가 끝날 때까지 아무 일도 없어 보여 다시 누르게 된다.
      toast(promotion.isActive ? d.promotionsAdmin.paused : d.promotionsAdmin.resumed, 'success')
      onDataChanged?.()
    })
  }

  const remove = (promotion: AdminPromotionView) => {
    setConfirmTarget(null)
    startTransition(async () => {
      const result = await deletePromotion({ promotionId: promotion.id })
      if (!result.success) {
        toast(translateError(d, result.error), 'error')
        return
      }
      toast(d.promotionsAdmin.removed, 'success')
      onDataChanged?.()
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="font-brush text-xl font-bold">{d.promotionsAdmin.title}</h2>

      <Panel className="space-y-3">
        <Segmented
          value={draft.kind}
          onChange={(kind) => set('kind', kind)}
          options={[
            { value: 'banner' as const, label: d.promotionsAdmin.kindBanner },
            { value: 'popup' as const, label: d.promotionsAdmin.kindPopup },
          ]}
          ariaLabel={d.promotionsAdmin.kindLabel}
          size="sm"
          className="grid-cols-2"
        />

        <Field label={d.promotionsAdmin.titleLabel} required>
          {(control) => (
            <Input
              {...control}
              value={draft.title}
              onChange={(event) => set('title', event.target.value)}
              maxLength={80}
              placeholder={d.promotionsAdmin.titlePlaceholder}
            />
          )}
        </Field>
        <Field label={d.promotionsAdmin.bodyLabel}>
          {(control) => (
            <Input
              {...control}
              value={draft.body}
              onChange={(event) => set('body', event.target.value)}
              maxLength={300}
              placeholder={d.promotionsAdmin.bodyPlaceholder}
            />
          )}
        </Field>
        <Field label={d.promotionsAdmin.linkUrlLabel}>
          {(control) => (
            <Input
              {...control}
              value={draft.linkUrl}
              onChange={(event) => set('linkUrl', event.target.value)}
              maxLength={500}
              placeholder={d.promotionsAdmin.linkUrlPlaceholder}
              autoCapitalize="off"
            />
          )}
        </Field>
        <Field label={d.promotionsAdmin.linkLabelLabel}>
          {(control) => (
            <Input
              {...control}
              value={draft.linkLabel}
              onChange={(event) => set('linkLabel', event.target.value)}
              maxLength={30}
              placeholder={d.promotionsAdmin.linkLabelPlaceholder}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['priority', d.promotionsAdmin.priorityLabel],
              ['dismissHours', d.promotionsAdmin.dismissHoursLabel],
              ['startsInHours', d.promotionsAdmin.startsInHoursLabel],
              ['endsInHours', d.promotionsAdmin.endsInHoursLabel],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} error={numericError(key)}>
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  inputMode="numeric"
                  value={draft[key]}
                  onChange={(event) => set(key, event.target.value)}
                  min={NUMERIC_RANGE[key].min}
                  max={NUMERIC_RANGE[key].max}
                  step={1}
                />
              )}
            </Field>
          ))}
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={submit}
          loading={pending}
          disabled={Boolean(blockedReason)}
          disabledReason={blockedReason}
        >
          {d.promotionsAdmin.submit}
        </Button>
      </Panel>

      {promotions.length === 0 ? (
        <EmptyState title={d.promotionsAdmin.empty} hint={d.promotionsAdmin.emptyHint} />
      ) : (
        <ul className="space-y-2">
          {promotions.map((promotion) => (
            <li key={promotion.id}>
              <Panel className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={promotion.kind === 'popup' ? 'accent' : 'warn'}>
                    {promotion.kind === 'popup'
                      ? d.promotionsAdmin.kindPopup
                      : d.promotionsAdmin.kindBanner}
                  </Badge>
                  <Badge tone={promotion.isLive ? 'win' : promotion.isActive ? 'warn' : 'muted'}>
                    {promotion.isLive
                      ? d.promotionsAdmin.live
                      : promotion.isActive
                        ? d.promotionsAdmin.scheduled
                        : d.promotionsAdmin.stopped}
                  </Badge>
                  <span className="font-bold">{promotion.title}</span>
                </div>
                {promotion.body ? <p className="text-sm text-muted">{promotion.body}</p> : null}
                <p className="text-xs text-muted">
                  {format(d.promotionsAdmin.meta, {
                    priority: promotion.priority,
                    hours: promotion.dismissHours,
                    author: promotion.createdByName,
                  })}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => toggle(promotion)} loading={pending}>
                    {promotion.isActive ? d.promotionsAdmin.pause : d.promotionsAdmin.resume}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setConfirmTarget(promotion)}
                    loading={pending}
                  >
                    {d.promotionsAdmin.remove}
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        title={format(d.promotionsAdmin.removeTitle, { title: confirmTarget?.title ?? '' })}
        body={d.promotionsAdmin.removeBody}
        confirmLabel={d.promotionsAdmin.remove}
        tone="danger"
        onConfirm={() => confirmTarget && remove(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
      />
    </section>
  )
}
