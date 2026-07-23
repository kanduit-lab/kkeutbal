'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, ConfirmDialog, Field, Input, Panel, useToast } from '@/components/ui'
import { createPromotion, deletePromotion, setPromotionActive } from '../actions'
import type { AdminPromotionView, PromotionKind } from '../types'

/** 관리자 콘솔의 배너·팝업 관리 섹션. admin-client 가 이미 커서 분리해 둔다. */

const KIND_LABEL: Record<PromotionKind, string> = {
  banner: '배너',
  popup: '팝업',
}

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
  title: '(광고문의)',
  body: '',
  linkUrl: '',
  linkLabel: '',
  priority: '0',
  dismissHours: '24',
  startsInHours: '0',
  endsInHours: '0',
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function PromotionsAdmin({ promotions }: { promotions: readonly AdminPromotionView[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [confirmTarget, setConfirmTarget] = useState<AdminPromotionView | null>(null)

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }))

  const submit = () => {
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
        toast(result.error, 'error')
        return
      }
      toast('등록했습니다', 'success')
      setDraft(EMPTY_DRAFT)
      router.refresh()
    })
  }

  const toggle = (promotion: AdminPromotionView) => {
    startTransition(async () => {
      const result = await setPromotionActive({
        promotionId: promotion.id,
        isActive: !promotion.isActive,
      })
      if (!result.success) {
        toast(result.error, 'error')
        return
      }
      router.refresh()
    })
  }

  const remove = (promotion: AdminPromotionView) => {
    setConfirmTarget(null)
    startTransition(async () => {
      const result = await deletePromotion({ promotionId: promotion.id })
      if (!result.success) {
        toast(result.error, 'error')
        return
      }
      toast('삭제했습니다', 'success')
      router.refresh()
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="font-brush text-xl font-bold">배너 · 팝업</h2>

      <Panel className="space-y-3">
        <div className="flex gap-2">
          {(['banner', 'popup'] as const).map((kind) => (
            <Button
              key={kind}
              variant={draft.kind === kind ? 'primary' : 'surface'}
              size="sm"
              pressed={draft.kind === kind}
              onClick={() => set('kind', kind)}
            >
              {KIND_LABEL[kind]}
            </Button>
          ))}
        </div>

        <Field label="제목">
          <Input
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
            maxLength={80}
            placeholder="(광고문의)"
          />
        </Field>
        <Field label="본문 (선택)">
          <Input
            value={draft.body}
            onChange={(event) => set('body', event.target.value)}
            maxLength={300}
            placeholder="배너·팝업에 함께 보일 설명"
          />
        </Field>
        <Field label="링크 주소 (선택)">
          <Input
            value={draft.linkUrl}
            onChange={(event) => set('linkUrl', event.target.value)}
            maxLength={500}
            placeholder="https://… 또는 /about"
            autoCapitalize="off"
          />
        </Field>
        <Field label="링크 문구 (선택)">
          <Input
            value={draft.linkLabel}
            onChange={(event) => set('linkLabel', event.target.value)}
            maxLength={30}
            placeholder="자세히 보기"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="우선순위 (클수록 먼저)">
            <Input
              value={draft.priority}
              onChange={(event) => set('priority', event.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="다시 보지 않기 (시간)">
            <Input
              value={draft.dismissHours}
              onChange={(event) => set('dismissHours', event.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="시작까지 (시간, 0=즉시)">
            <Input
              value={draft.startsInHours}
              onChange={(event) => set('startsInHours', event.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="종료까지 (시간, 0=무기한)">
            <Input
              value={draft.endsInHours}
              onChange={(event) => set('endsInHours', event.target.value)}
              inputMode="numeric"
            />
          </Field>
        </div>

        <Button variant="primary" className="w-full" onClick={submit} disabled={pending}>
          {pending ? '처리 중…' : '등록'}
        </Button>
      </Panel>

      {promotions.length === 0 ? (
        <Panel className="py-6 text-center text-sm text-muted">등록된 배너·팝업이 없습니다</Panel>
      ) : (
        <ul className="space-y-2">
          {promotions.map((promotion) => (
            <li key={promotion.id}>
              <Panel className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={promotion.kind === 'popup' ? 'accent' : 'warn'}>
                    {KIND_LABEL[promotion.kind]}
                  </Badge>
                  <Badge tone={promotion.isLive ? 'win' : promotion.isActive ? 'warn' : 'muted'}>
                    {promotion.isLive ? '노출 중' : promotion.isActive ? '대기' : '중지'}
                  </Badge>
                  <span className="font-bold">{promotion.title}</span>
                </div>
                {promotion.body ? <p className="text-sm text-muted">{promotion.body}</p> : null}
                <p className="text-xs text-muted">
                  우선순위 {promotion.priority} · {promotion.dismissHours}시간 숨김 ·{' '}
                  {promotion.createdByName}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => toggle(promotion)} disabled={pending}>
                    {promotion.isActive ? '중지' : '재개'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setConfirmTarget(promotion)}
                    disabled={pending}
                  >
                    삭제
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        title={`${confirmTarget?.title ?? ''} 을(를) 삭제할까요?`}
        body="되돌릴 수 없습니다. 잠시만 내리려면 중지를 쓰세요"
        confirmLabel="삭제"
        tone="danger"
        onConfirm={() => confirmTarget && remove(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
      />
    </section>
  )
}
