import { BackToTop } from '../_components/back-to-top'
import { GuideHeader } from '../_components/guide-header'
import { PokerCardChip } from '../_components/poker-card-chip'
import { ScrollTable } from '../_components/scroll-table'
import { TocNav } from '../_components/toc-nav'
import { PageShell, Panel } from '@/components/ui'
import type { Metadata } from 'next'
import { getDict } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDict()
  return { title: `포커 가이드 · ${d.common.appName}` }
}

const TOC = [
  { href: '#flow', label: '진행 방식' },
  { href: '#rank', label: '족보 서열표' },
] as const

interface PokerHandRow {
  readonly label: string
  readonly description: string

  readonly cardIds: readonly string[]
}

const POKER_HANDS: readonly PokerHandRow[] = [
  {
    label: '로열 플러시',
    description: '한 무늬로 10-J-Q-K-A. 포커에서 가장 강한 패',
    cardIds: ['TS', 'JS', 'QS', 'KS', 'AS'],
  },
  {
    label: '스트레이트 플러시',
    description: '한 무늬로 숫자가 5장 연속',
    cardIds: ['5H', '6H', '7H', '8H', '9H'],
  },
  {
    label: '포카드',
    description: '같은 숫자 4장 + 아무 카드 1장',
    cardIds: ['KC', 'KS', 'KH', 'KD', '2C'],
  },
  {
    label: '풀하우스',
    description: '트리플 + 원페어 조합',
    cardIds: ['QS', 'QH', 'QD', '7C', '7S'],
  },
  {
    label: '플러시',
    description: '숫자는 상관없이 같은 무늬 5장',
    cardIds: ['AD', 'JD', '8D', '6D', '3D'],
  },
  {
    label: '스트레이트',
    description: '무늬 상관없이 숫자가 5장 연속',
    cardIds: ['9S', '8H', '7D', '6C', '5S'],
  },
  {
    label: '트리플',
    description: '같은 숫자 3장 + 아무 카드 2장',
    cardIds: ['8C', '8S', '8H', 'KD', '4C'],
  },
  {
    label: '투페어',
    description: '페어 두 쌍 + 아무 카드 1장',
    cardIds: ['JS', 'JH', '4D', '4C', '9S'],
  },
  {
    label: '원페어',
    description: '같은 숫자 2장 + 아무 카드 3장',
    cardIds: ['7H', '7D', 'KS', '9C', '3H'],
  },
  {
    label: '하이카드',
    description: '위 조합이 하나도 없을 때, 제일 높은 카드로 승부',
    cardIds: ['AS', 'JH', '8D', '6C', '2S'],
  },
]

export default async function PokerGuidePage() {
  const { d } = await getDict()

  return (
    <PageShell width="wide">
      <GuideHeader
        backHref="/guide"
        backLabel={d.guide.backToList}
        emoji="♠"
        title="포커"
        description="텍사스 홀덤 기준 족보 서열표. 5~7장 중 가장 좋은 5장 조합으로 승부합니다"
      />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:order-2 lg:col-span-3">
          <TocNav items={TOC} />
        </div>
        <div className="min-w-0 space-y-8 lg:order-1 lg:col-span-9">
          <section id="flow" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">진행 방식</h2>
            <Panel>
              <p className="text-sm text-muted">
                각자 받은 카드와 공용 카드를 합쳐 5~7장 중 가장 좋은 5장으로 족보를 만듭니다. 표에서
                위에 있을수록 강한 패입니다
              </p>
            </Panel>
          </section>
          <section id="rank" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">족보 서열표</h2>
            <ol className="space-y-2 sm:hidden">
              {POKER_HANDS.map((hand, index) => (
                <li key={hand.label}>
                  <Panel className="space-y-2 py-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-black tabular-nums text-muted">
                        {index + 1}
                      </span>
                      <p className="font-brush text-lg font-bold">{hand.label}</p>
                    </div>
                    <p className="text-sm text-muted">{hand.description}</p>
                    <div className="flex gap-1">
                      {hand.cardIds.map((id) => (
                        <PokerCardChip key={id} id={id} />
                      ))}
                    </div>
                  </Panel>
                </li>
              ))}
            </ol>
            <div className="hidden sm:block">
              <ScrollTable title="족보 서열표">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gold/15 text-xs text-muted [&>th]:whitespace-nowrap">
                      <th className="px-4 py-3 font-medium">서열</th>
                      <th className="px-4 py-3 font-medium">족보</th>
                      <th className="px-4 py-3 font-medium">설명</th>
                      <th className="px-4 py-3 font-medium">예시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POKER_HANDS.map((hand, index) => (
                      <tr key={hand.label} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-3 text-muted tabular-nums">{index + 1}</td>
                        <td className="px-4 py-3 font-brush font-bold whitespace-nowrap">
                          {hand.label}
                        </td>
                        <td className="px-4 py-3 text-muted">{hand.description}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {hand.cardIds.map((id) => (
                              <PokerCardChip key={id} id={id} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </div>
          </section>
          <BackToTop />
        </div>
      </div>
    </PageShell>
  )
}