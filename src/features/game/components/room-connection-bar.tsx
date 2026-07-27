'use client'

import { Button } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'

/**
 * 연결·동기화 경고 슬롯.
 *
 * 예전에는 헤더 아이콘 줄의 첫 자식으로 버튼이 끼어들었다 — 모바일에서 흔한
 * CLOSED→SUBSCRIBED 왕복마다 🔇/🧾/📺/⚙️ 가 통째로 밀려 오탭을 만들었다.
 * 헤더 밖 전용 줄로 빼면 나타나고 사라져도 헤더 배치가 흔들리지 않는다.
 *
 * 라이브 리전(컨테이너)은 **항상** 트리에 남기고 내용만 조건부로 렌더한다. 컨테이너째
 * 언마운트하거나 aria-hidden 으로 덮으면 스크린리더가 등장을 아예 알리지 못한다.
 *
 * syncFailed 는 "스냅샷이 임의로 낡았다"는 뜻이라 단순 안내로 끝내면 안 된다.
 * 호출부는 같은 조건으로 조작 UI 를 게이팅한다 (room-client 의 staleReason).
 */
export function RoomConnectionBar({
  syncFailed,
  disconnected,
  onReconnect,
}: {
  syncFailed: boolean
  disconnected: boolean
  onReconnect: () => void
}) {
  const { d } = useDict()
  const visible = syncFailed || disconnected
  return (
    <div role="status" aria-live="polite" className={visible ? 'mb-3' : undefined}>
      {visible ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-warn">
              {syncFailed ? d.room.syncFailedTitle : d.room.disconnectedTitle}
            </p>
            <p className="text-micro text-muted">{d.room.staleBody}</p>
          </div>
          <Button type="button" size="sm" variant="surface" className="shrink-0" onClick={onReconnect}>
            {d.room.reconnect}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
