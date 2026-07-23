import { SEOTDA_DECK } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import { HwatuCardView } from '@/components/hwatu-card'
import { ButtonLink, Panel } from '@/components/ui'
import { format } from '@/lib/i18n/format'
import { getDict } from '@/lib/i18n/server'

/**
 * 404 에 띄울 망통 패.
 *
 * 2월 + 8월 = 10 → 끗 0. 두 달이 다르니 땡이 아니고, 특수패(1·2, 1·4, 1·9, 1·10, 4·10, 4·6)
 * 도 판정패(4·7, 3·7, 4·9)도 아니라 반드시 망통이다. 그래도 이름은 하드코딩하지 않고
 * 엔진이 판정한 label 을 쓴다 — 덱이나 룰이 바뀌면 화면이 거짓말하는 대신 같이 바뀐다.
 */
const MANGTONG = (() => {
  const first = SEOTDA_DECK.find((card) => card.month === 2)
  const second = SEOTDA_DECK.find((card) => card.month === 8)
  if (!first || !second) return null
  try {
    const hand = evaluateSeotdaHand([first as HwatuCard, second as HwatuCard])
    return { cards: [first, second] as const, label: hand.label }
  } catch {
    // 덱 구성이 바뀌어 판정에 실패하면 카드 연출만 접는다 — 404 자체는 계속 떠야 한다.
    return null
  }
})()

/** 앱 공통 404 — 프레임워크 기본 화면 대신 망통 한 패와 홈으로 돌아갈 동선을 준다. */
export default async function NotFound() {
  const { d } = await getDict()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <Panel className="space-y-4 py-8 text-center">
        {MANGTONG ? (
          <div className="flex items-end justify-center gap-3">
            <div className="w-20 -rotate-6">
              <HwatuCardView card={MANGTONG.cards[0]} size="sm" />
            </div>
            <p className="font-brush gilt pb-2 text-5xl font-black leading-none">404</p>
            <div className="w-20 rotate-6">
              <HwatuCardView card={MANGTONG.cards[1]} size="sm" />
            </div>
          </div>
        ) : (
          <p className="font-brush gilt text-5xl font-black">404</p>
        )}

        <div className="space-y-1.5">
          <h1 className="text-xl font-bold">{d.errorPage.notFoundTitle}</h1>
          {MANGTONG ? (
            <p className="text-sm text-muted">
              {format(d.errorPage.notFoundQuip, { hand: MANGTONG.label })}
            </p>
          ) : null}
          <p className="text-sm text-muted">{d.errorPage.notFoundBody}</p>
        </div>

        <div className="pt-1">
          <ButtonLink href="/" variant="primary" className="w-full">
            {d.common.home}
          </ButtonLink>
        </div>
      </Panel>
    </main>
  )
}
