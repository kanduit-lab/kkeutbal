'use client'

import { useRef, useState, useTransition } from 'react'
import { addLocalMember } from '../member-actions'
import { Button, Input } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import type { RunAction } from './shared'

/**
 * 로컬 플레이어 추가 — 계정 없이 이름만으로 좌석을 만든다.
 *
 * 가족·모임처럼 각자 폰으로 로그인시키기 번거로울 때, 한 대로 전원을 대신 기록하는 흐름의
 * 입구다. 만들어진 좌석은 딜러의 대리 베팅으로 조작하고 정산·결과에는 정상 포함된다.
 * 연달아 여러 명을 넣는 게 기본 사용 패턴이라 성공해도 폼을 닫지 않고 포커스를 유지한다.
 */
export function AddLocalMemberForm({
  roomId,
  runAction,
}: {
  roomId: string
  runAction: RunAction
}) {
  const { d } = useDict()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = name.trim()

  function submit() {
    if (isPending || !trimmed) return
    startTransition(async () => {
      const success = await runAction(
        () => addLocalMember({ roomId, name: trimmed }),
        (data) => ({
          event: 'member.joined',
          payload: {
            userId: data.userId,
            displayName: data.name,
            role: 'player',
            seatNo: data.seatNo,
          },
        }),
      )
      if (!success) return
      setName('')
      inputRef.current?.focus()
    })
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        + {d.lobby.addLocalMember}
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-xl bg-bg-deep/50 p-3">
      <p className="text-xs text-muted">{d.lobby.addLocalMemberHint}</p>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          autoFocus
          value={name}
          maxLength={20}
          placeholder={d.lobby.addLocalMemberPlaceholder}
          aria-label={d.lobby.addLocalMemberPlaceholder}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            // 한글 입력 중(IME 조합) 엔터는 조합 확정이라 제출로 삼으면 이름이 잘린다.
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <Button
          variant="primary"
          className="shrink-0"
          loading={isPending}
          loadingLabel={d.ui.processing}
          disabled={trimmed.length === 0}
          disabledReason={trimmed.length === 0 ? d.lobby.addLocalMemberNameRequired : undefined}
          onClick={submit}
        >
          {d.lobby.addLocalMemberSubmit}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => {
          setName('')
          setOpen(false)
        }}
      >
        {d.common.close}
      </Button>
    </div>
  )
}
