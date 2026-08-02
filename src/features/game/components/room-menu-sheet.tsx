'use client'

import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { Button, Sheet } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

interface RoomMenuItem {
  readonly key: string
  readonly icon: string
  readonly label: string
  readonly hint: string
  readonly href?: Route
  readonly onSelect?: () => void
}

/**
 * 세로 화면 방 메뉴.
 *
 * 헤더에 아이콘만 다섯 개(🔊 🧾 🔮 📺 ⚙️) 늘어놓으면 두 가지가 동시에 깨진다 — 폭이
 * 272px이라 360px 화면에서 제목 줄을 밀어내고 헤더가 두 줄로 접히고, 이모지가 48px 상자
 * 안에서 19px로 렌더돼 눌러보기 전에는 무슨 기능인지 알 수 없다. 이 시트는 같은 항목을
 * 아이콘 + 이름 + 한 줄 설명으로 펼친다.
 *
 * 저장소에 팝오버 프리미티브가 없어서 `Sheet`를 쓴다 — `member-list-sheet`·
 * `dealer-tools-sheet`가 쓰는 것과 같은 "행 목록" 패턴이고, 바깥 클릭·ESC·포커스 트랩이
 * 이미 `useModalBehavior`에 들어 있다.
 */
export function RoomMenuSheet({
  open,
  onClose,
  code,
  isHost,
  onOpenAdvisor,
}: {
  open: boolean
  onClose: () => void
  code: string
  isHost: boolean
  onOpenAdvisor: () => void
}) {
  const { d } = useDict()

  const items: readonly RoomMenuItem[] = [
    {
      key: 'result',
      icon: '🧾',
      label: d.room.resultAria,
      hint: d.room.resultMenuHint,
      href: `/rooms/${code}/result` as Route,
    },
    {
      key: 'advisor',
      icon: '🔮',
      label: d.room.advisorAria,
      hint: d.room.advisorMenuHint,
      // 방을 떠나지 않고 시트로 연다. `/advisor`로 나가면 실시간 채널이 끊긴다.
      onSelect: onOpenAdvisor,
    },
    {
      key: 'monitor',
      icon: '📺',
      label: d.room.monitorTitle,
      hint: d.room.monitorMenuHint,
      href: `/rooms/${code}/monitor` as Route,
    },
    ...(isHost
      ? [
          {
            key: 'settings',
            icon: '⚙️',
            label: d.room.settingsTitle,
            hint: d.room.settingsMenuHint,
            href: `/rooms/${code}/settings` as Route,
          },
        ]
      : []),
  ]

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={d.room.menuTitle} className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-accent">{d.room.menuTitle}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {d.common.close}
        </Button>
      </header>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.key}>
            <MenuRow item={item} onClose={onClose} />
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

/** 행 전체가 눌리는 영역이다 — 아이콘만 좁게 눌러야 하면 폰에서 오조작이 난다. */
const ROW_CLASS =
  'flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left transition active:scale-[0.99] hover:brightness-110'

function MenuRow({ item, onClose }: { item: RoomMenuItem; onClose: () => void }) {
  const body: ReactNode = (
    <>
      <span aria-hidden="true" className="shrink-0 text-xl leading-none">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{item.label}</span>
        <span className="block truncate text-micro text-muted">{item.hint}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-muted">
        ›
      </span>
    </>
  )

  if (item.href) {
    return (
      <Link href={item.href} className={ROW_CLASS} onClick={onClose}>
        {body}
      </Link>
    )
  }
  return (
    <button
      type="button"
      className={ROW_CLASS}
      onClick={() => {
        onClose()
        item.onSelect?.()
      }}
    >
      {body}
    </button>
  )
}
