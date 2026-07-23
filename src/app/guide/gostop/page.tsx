import { CardPair } from '../_components/card-pair'
import { GuideHeader } from '../_components/guide-header'
import { TocNav } from '../_components/toc-nav'
import { Panel } from '@/components/ui'

const TOC = [
  { href: '#flow', label: '진행 방식' },
  { href: '#score', label: '점수표' },
  { href: '#go-stop', label: '고 / 스톱' },
  { href: '#multiplier', label: '배수' },
] as const

interface ScoreRow {
  readonly combo: string
  readonly points: string
  readonly note: string
}

// 기본 룰(GOSTOP_RULES_STANDARD, features/gostop/types.ts) 기준. 방마다 룰 프리셋으로 조정될 수 있다.
const SCORE_ROWS: readonly ScoreRow[] = [
  { combo: '광 3장', points: '3점', note: '비광 제외 3장. 비광 포함이면 2점' },
  { combo: '광 4장', points: '4점', note: '' },
  { combo: '광 5장', points: '15점', note: '광 전부' },
  { combo: '고도리', points: '5점', note: '2 · 4 · 8월 새 3장' },
  { combo: '홍단 / 청단 / 초단', points: '각 3점', note: '월별 지정된 띠 3장 조합' },
  { combo: '열끗 5장부터', points: '1점', note: '6장째부터 1장마다 +1점' },
  { combo: '띠 5장부터', points: '1점', note: '6장째부터 1장마다 +1점' },
  { combo: '피 10장부터', points: '1점', note: '쌍피는 2장으로 계산, 11장째부터 1장마다 +1점' },
]

interface MultiplierRow {
  readonly source: string
  readonly effect: string
}

const MULTIPLIER_ROWS: readonly MultiplierRow[] = [
  { source: '1고 / 2고', effect: '+1점 / +2점 고정 가산' },
  { source: '3고부터', effect: '점수 전체에 배수가 붙습니다. 고를 부를수록 커지지만 역전당하면 그만큼 크게 잃습니다' },
  { source: '흔들기', effect: '같은 월 패 3장을 처음부터 들고 흔들면 그 판 점수 ×2' },
  { source: '폭탄', effect: '같은 월 카드로 상대가 낸 패를 한 번에 먹으면 그 판 점수 ×2' },
  { source: '피박', effect: '피를 5장 미만밖에 못 먹은 사람에게는 이긴 사람 점수가 ×2' },
  { source: '광박', effect: '광을 하나도 못 먹은 사람에게는 광으로 이긴 사람 점수가 ×2' },
  { source: '멍박', effect: '기본 룰에서는 비활성 (방장이 켤 수 있음)' },
  { source: '총통', effect: '처음 받은 패에 같은 월 4장이 모이면 그 자리에서 즉시 승리' },
]

export default function GostopGuidePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 lg:px-8 lg:pt-12">
      <GuideHeader
        backHref="/guide"
        backLabel="가이드 목록으로"
        emoji="🌸"
        title="고스톱"
        description="바닥 패와 맞춰 광·열끗·띠·피를 모으고, 점수가 나면 고 또는 스톱을 선택합니다"
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-9">
          <section id="flow" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">진행 방식</h2>
            <Panel>
              <ol className="list-inside list-decimal space-y-2 text-sm text-text">
                <li>각자 패를 받고, 바닥에도 몇 장이 깔립니다</li>
                <li>내 패와 같은 월의 바닥 패가 있으면 짝을 맞춰 가져옵니다</li>
                <li>광·열끗·띠·피를 모아 점수가 나면 고 또는 스톱을 선택합니다</li>
                <li>스톱을 선언하면 그 자리에서 점수가 확정됩니다</li>
              </ol>
            </Panel>
          </section>

          <section id="score" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">점수표</h2>
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gold/15 text-xs text-muted">
                    <th className="px-4 py-3 font-medium">조합</th>
                    <th className="px-4 py-3 font-medium">점수</th>
                    <th className="px-4 py-3 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORE_ROWS.map((row) => (
                    <tr key={row.combo} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 font-bold">{row.combo}</td>
                      <td className="gilt px-4 py-3 font-bold tabular-nums">{row.points}</td>
                      <td className="px-4 py-3 text-muted">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <p className="text-xs text-muted">
              기본 룰에서는 3점 이상 모아야 스톱을 선언할 수 있습니다
            </p>

            <Panel className="space-y-3">
              <p className="text-sm font-medium text-muted">대표 조합 예시</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CardPair ids={['02-yeol', '04-yeol', '08-yeol']} label="고도리" />
                <CardPair ids={['01-gwang', '03-gwang', '08-gwang']} label="광 3장" note="비광 제외" />
                <CardPair ids={['01-tti', '02-tti', '03-tti']} label="홍단" />
                <CardPair ids={['06-tti', '09-tti', '10-tti']} label="청단" />
              </div>
            </Panel>
          </section>

          <section id="go-stop" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">고 / 스톱</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Panel className="space-y-1.5">
                <p className="font-brush font-bold text-win">고</p>
                <p className="text-sm text-muted">
                  점수가 났을 때 판을 계속 이어가는 선언입니다. 더 큰 점수를 노릴 수 있지만,
                  역전당하면 그만큼 손해가 커집니다
                </p>
              </Panel>
              <Panel className="space-y-1.5">
                <p className="font-brush font-bold text-accent">스톱</p>
                <p className="text-sm text-muted">
                  그 자리에서 판을 끝내고 지금까지 모은 점수를 확정합니다
                </p>
              </Panel>
            </div>
          </section>

          <section id="multiplier" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">배수</h2>
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gold/15 text-xs text-muted">
                    <th className="px-4 py-3 font-medium">항목</th>
                    <th className="px-4 py-3 font-medium">효과</th>
                  </tr>
                </thead>
                <tbody>
                  {MULTIPLIER_ROWS.map((row) => (
                    <tr key={row.source} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 font-bold whitespace-nowrap">{row.source}</td>
                      <td className="px-4 py-3 text-muted">{row.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>
        </div>

        <div className="lg:col-span-3">
          <TocNav items={TOC} />
        </div>
      </div>
    </main>
  )
}
