import { SEOTDA_DECK } from '@/features/hwatu/cards'
import type { HwatuCard } from '@/features/hwatu/types'
import { evaluateSeotdaHand } from '@/features/seotda/engine'
import { HwatuCardView } from '@/components/hwatu-card'
import { ButtonLink, PageShell, Panel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

const PLAINNESS: Record<string, number> = { pi: 0, tti: 1, yeol: 2, gwang: 3 }

function plainestOfMonth(month: number): HwatuCard | undefined {
  return SEOTDA_DECK.filter((card) => card.month === month).sort(
    (a, b) => (PLAINNESS[a.kind] ?? 9) - (PLAINNESS[b.kind] ?? 9),
  )[0]
}

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

export default async function NotFound() {
  const { d } = await getDict()

  return (
    <PageShell width="narrow" center>
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
    </PageShell>
  )
}