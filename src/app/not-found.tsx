import { SEOTDA_DECK } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import { HwatuCardView } from '@/components/hwatu-card'
import { ButtonLink, Panel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/**
 * 화려한 카드일수록 뒤로 — 망통 연출에 광이 끼면 패가 좋아 보여서 농담이 죽는다.
 * 같은 월에서 가장 안 화려한 카드를 고르는 데 쓴다.
 */
const PLAINNESS: Record<string, number> = { pi: 0, tti: 1, yeol: 2, gwang: 3 }

function plainestOfMonth(month: number): HwatuCard | undefined {
  return SEOTDA_DECK.filter((card) => card.month === month).sort(
    (a, b) => (PLAINNESS[a.kind] ?? 9) - (PLAINNESS[b.kind] ?? 9),
  )[0]
}

/**
 * 404 에 띄울 망통 패.
 *
 * 2월 + 8월 = 10 → 끗 0. 두 달이 다르니 땡이 아니고, 특수패(1·2, 1·4, 1·9, 1·10, 4·10, 4·6)
 * 도 판정패(4·7, 3·7, 4·9)도 아니라 반드시 망통이다. 사실 서로 다른 달로 0끗을 만드는 조합은
 * (1,9)·(3,7)·(4,6) 이 전부 특수패·판정패라 2+8 하나뿐이다.
 *
 * 엔진에 한 번 통과시켜 실제로 성립하는 패인지 확인한다 — 덱 구성이 바뀌어 판정이
 * 깨지면 카드 연출만 접고 404 자체는 계속 뜬다.
 */
const MANGTONG = (() => {
  const first = plainestOfMonth(2)
  const second = plainestOfMonth(8)
  if (!first || !second) return null
  try {
    evaluateSeotdaHand([first, second])
    return [first, second] as const
  } catch {
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
              <HwatuCardView card={MANGTONG[0]} size="sm" />
            </div>
            <p className="font-brush gilt pb-2 text-5xl font-black leading-none">404</p>
            <div className="w-20 rotate-6">
              <HwatuCardView card={MANGTONG[1]} size="sm" />
            </div>
          </div>
        ) : (
          <p className="font-brush gilt text-5xl font-black">404</p>
        )}

        <div className="space-y-1.5">
          <h1 className="text-xl font-bold">{d.errorPage.notFoundTitle}</h1>
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
