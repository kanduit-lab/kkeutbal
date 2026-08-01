'use client'

import { clsx } from 'clsx'
import { Avatar, Badge } from '@/components/ui'
import { useDict } from '@/lib/i18n/client'
import type { MemberView } from '../types'
import { formatChips } from './shared'

/**
 * 내 상태 한 줄 — 세로 모바일 베팅 화면에서 고정 액션바 바로 위에 붙는다.
 *
 * 좌석 링을 걷어내면서 다른 사람 카드가 화면에서 사라졌다. 남은 문제는 "그럼 내 칩은
 * 어디서 보나"인데, 시트를 열어야 보이면 베팅 직전마다 화면을 덮어야 한다. 그래서 판단에
 * 꼭 필요한 세 숫자(잔액 / 손익 / 이번 판에 낸 돈)만 상시로 띄운다.
 *
 * 높이는 어떤 상태에서도 고정이다 — 이 줄이 한 줄이라도 늘었다 줄었다 하면 바로 아래
 * 액션바 버튼이 밀려서 오조작이 난다.
 */
export function SelfBar({
  self,
  myBet,
  online,
  className,
}: {
  self: MemberView

  /** 이번 판에 내가 이미 낸 누적 금액 */
  myBet: number
  online: boolean
  className?: string
}): React.JSX.Element {
  const { d, locale } = useDict()

  // 손익은 "지금 들고 있는 칩 - 지금까지 받은 칩". 바이인을 빼지 않으면 추가 지급이
  // 그대로 이익처럼 보인다.
  const net = self.balance - self.buyInTotal
  const netText = `${net > 0 ? '+' : ''}${formatChips(net, locale)}`

  return (
    <section
      className={clsx('lacquer flex h-16 items-center gap-2.5 rounded-2xl px-3', className)}
      aria-label={d.actionBar.myChips}
    >
      <span className="relative shrink-0">
        <Avatar name={self.displayName} url={self.avatarUrl} size={40} />
        {/* 접속 점은 좌석 카드에서 쓰던 표시와 같은 모양이어야 한다 — 같은 뜻인데 모양이
            다르면 전광판·좌석과 이 줄을 번갈아 볼 때 다시 학습해야 한다. */}
        <span
          aria-hidden
          className={clsx(
            'absolute -right-0.5 bottom-0 size-3 rounded-full border-2 border-black',
            online ? 'bg-win shadow-[0_0_6px_var(--color-win)]' : 'bg-white/25',
          )}
        />
        <span className="sr-only">{online ? d.common.online : d.common.offline}</span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-bold">{self.displayName}</span>
          <Badge tone="muted">{d.common.me}</Badge>
        </span>
        {/* 이번 판에 이미 낸 돈. 콜 금액을 판단할 때 잔액보다 먼저 보는 숫자라 이름 밑에 붙인다. */}
        <span className="flex min-w-0 items-center gap-1 text-micro text-muted">
          <span className="shrink-0">{d.memberSheet.selfBetTitle}</span>
          <span className="shrink-0 tabular-nums">{formatChips(myBet, locale)}</span>
        </span>
      </div>

      {/* 숫자 칸은 절대 줄어들면 안 된다 — 320px에서 잘려야 하는 쪽은 이름이지 금액이 아니다. */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="gilt text-xl font-black leading-tight tabular-nums">
          {formatChips(self.balance, locale)}
        </span>
        <span className="flex items-center gap-1 text-micro">
          <span className="text-muted">{d.memberSheet.statNet}</span>
          <span
            className={clsx(
              'tabular-nums font-bold',
              net > 0 && 'text-win',
              net < 0 && 'text-accent',
              net === 0 && 'text-muted',
            )}
          >
            {netText}
          </span>
        </span>
      </div>
    </section>
  )
}
