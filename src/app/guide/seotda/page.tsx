import { CardPair } from '../_components/card-pair'
import { GuideHeader } from '../_components/guide-header'
import { TocNav } from '../_components/toc-nav'
import { Panel, Badge } from '@/components/ui'

const TOC = [
  { href: '#flow', label: '진행 방식' },
  { href: '#rank', label: '족보 서열표' },
  { href: '#traits', label: '특수 판정패' },
] as const

interface RankRow {
  readonly order: string
  readonly label: string
  readonly condition: string
}

// SEOTDA_RANK · SEOTDA_SPECIALS(features/seotda/types.ts) 순서 그대로. 값 자체가 아니라 대소 관계가 계약이다.
const RANK_ROWS: readonly RankRow[] = [
  { order: '1', label: '38광땡', condition: '3월 광 + 8월 광. 광땡 중 최강' },
  { order: '2', label: '18광땡', condition: '1월 광 + 8월 광' },
  { order: '3', label: '13광땡', condition: '1월 광 + 3월 광. 광땡 중 최약' },
  {
    order: '4',
    label: '땡',
    condition: '같은 월 카드 두 장. 월이 높을수록 강함 — 10땡(장땡)이 최고, 1땡이 최저',
  },
  { order: '5', label: '알리', condition: '1월 + 2월' },
  { order: '6', label: '독사', condition: '1월 + 4월' },
  { order: '7', label: '구삥', condition: '1월 + 9월' },
  { order: '8', label: '장삥', condition: '1월 + 10월' },
  { order: '9', label: '장사', condition: '4월 + 10월' },
  { order: '10', label: '세륙', condition: '4월 + 6월' },
  {
    order: '11',
    label: '끗',
    condition: '두 장 합의 끝자리 숫자. 갑오(9끗)가 최고, 망통(0끗)이 최저',
  },
]

export default function SeotdaGuidePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 lg:px-8 lg:pt-12">
      <GuideHeader
        backHref="/guide"
        backLabel="가이드 목록으로"
        emoji="🎴"
        title="섯다"
        description="두 장을 받고 베팅한 뒤 족보를 겨루는 게임. 서열이 높은 쪽이 판돈을 가져가요"
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-9">
          <section id="flow" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">진행 방식</h2>
            <Panel className="space-y-3">
              <ol className="list-inside list-decimal space-y-2 text-sm text-text">
                <li>각자 화투 두 장씩 받아요. 상대 패는 안 보여요</li>
                <li>순서대로 베팅해요 — 체크·콜·레이즈·다이·올인 중 하나</li>
                <li>남은 사람들끼리 패를 공개하고, 서열이 높은 쪽이 판돈을 가져가요</li>
                <li>특수 판정패(암행어사·땡잡이·구사)가 있으면 서열과 무관하게 결과가 바뀔 수 있어요</li>
              </ol>
              <p className="text-xs text-muted">
                같은 족보로 맞붙으면 기본 룰에서는 그 판을 다시 시작해요(재경기)
              </p>
            </Panel>
          </section>

          <section id="rank" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">족보 서열표</h2>
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gold/15 text-xs text-muted">
                    <th className="px-4 py-3 font-medium">서열</th>
                    <th className="px-4 py-3 font-medium">족보</th>
                    <th className="px-4 py-3 font-medium">조건</th>
                  </tr>
                </thead>
                <tbody>
                  {RANK_ROWS.map((row) => (
                    <tr key={row.order} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 text-muted tabular-nums">{row.order}</td>
                      <td className="px-4 py-3 font-brush font-bold">{row.label}</td>
                      <td className="px-4 py-3 text-muted">{row.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel className="space-y-3">
              <p className="text-sm font-medium text-muted">대표 족보 예시</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <CardPair ids={['03-gwang', '08-gwang']} label="38광땡" note="최강 족보" />
                <CardPair ids={['10-yeol', '10-tti']} label="장땡" note="땡 중 최강" />
                <CardPair ids={['01-gwang', '02-yeol']} label="알리" note="특수 하위 족보" />
              </div>
            </Panel>
          </section>

          <section id="traits" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">특수 판정패</h2>
            <p className="text-sm text-muted">
              서열표와는 별개로, 특정 상대를 만났을 때만 효력이 생기는 판정패예요. 기본 룰에서는
              세 가지 모두 켜져 있어요
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <TraitCard
                ids={['04-yeol', '07-yeol']}
                title="암행어사"
                badge="4 · 7"
                description="광땡을 잡아요. 상대가 어떤 광땡이든 이겨요"
              />
              <TraitCard
                ids={['03-gwang', '07-tti']}
                title="땡잡이"
                badge="3 · 7"
                description="땡을 잡아요. 단, 광땡에는 효력이 없어요"
              />
              <TraitCard
                ids={['04-tti', '09-yeol']}
                title="구사"
                badge="4 · 9"
                description="이 패를 든 사람이 있으면 그 판은 무효 — 다시 시작해요"
              />
            </div>
          </section>
        </div>

        <div className="lg:col-span-3">
          <TocNav items={TOC} />
        </div>
      </div>
    </main>
  )
}

function TraitCard({
  ids,
  title,
  badge,
  description,
}: {
  ids: readonly string[]
  title: string
  badge: string
  description: string
}) {
  return (
    <Panel className="space-y-3">
      <div className="flex justify-end">
        <Badge tone="accent">{badge}</Badge>
      </div>
      <div className="flex justify-center">
        <CardPair ids={ids} label={title} />
      </div>
      <p className="text-xs text-muted">{description}</p>
    </Panel>
  )
}
