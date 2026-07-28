'use client'

import { useRef, useState, useTransition } from 'react'
import { addLocalMember } from '../member-actions'
import { Button, Input } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import type { RunAction } from './shared'

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