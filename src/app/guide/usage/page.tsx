import { GuideHeader } from '../_components/guide-header'
import { TocNav } from '../_components/toc-nav'
import { Panel } from '@/components/ui'

const TOC = [
  { href: '#premise', label: '이 앱은 기록용' },
  { href: '#flow', label: '진행 흐름' },
  { href: '#dealer', label: '딜러 전용 기능' },
] as const

interface FlowStep {
  readonly title: string
  readonly description: string
}

const FLOW_STEPS: readonly FlowStep[] = [
  {
    title: '방 만들기',
    description:
      '게임 종류(섯다·고스톱·포커), 시작 칩, 입력 모드를 정합니다. 바로 반영은 각자 입력이 즉시 기록되고, 딜러 승인은 딜러가 승인해야 기록됩니다',
  },
  {
    title: '대기방에서 코드 공유',
    description:
      '방을 만들면 6자리 코드가 발급되고 입장 대기방이 열립니다. 코드나 링크를 공유하면 참가자 자리가 자동으로 생깁니다',
  },
  {
    title: '판 시작 (딜러)',
    description: '딜러나 방장이 판을 열면 전원의 화면이 테이블 뷰로 바뀌고 실시간으로 동기화됩니다',
  },
  {
    title: '각자 베팅',
    description:
      '베팅 버튼으로 자기 액션을 기록합니다. 콜 금액은 직전 베팅에 자동으로 맞춰집니다. 실물 칩은 그대로 쓰고 앱은 액수만 기록합니다',
  },
  {
    title: '판 종료 · 승자 지정',
    description:
      '딜러가 승자를 지정합니다. 섯다·포커는 팟이 승자에게 가고, 고스톱은 점수 × 점당 칩을 패자 전원이 승자에게 지불합니다',
  },
  {
    title: '세션 정산',
    description: '방장이 정산하면 참가자별 손익이 자동으로 집계됩니다',
  },
  {
    title: '랭킹',
    description: '정산된 세션은 누적 랭킹에 합산됩니다',
  },
]

interface DealerAction {
  readonly title: string
  readonly description: string
}

const DEALER_ACTIONS: readonly DealerAction[] = [
  { title: '승인 / 거절', description: '딜러 승인 방에서 대기 중인 베팅을 반영하거나 사유와 함께 거절합니다' },
  { title: '정정', description: '잘못 입력된 베팅을 사유와 함께 되돌립니다' },
  { title: '판 무효', description: '구사 등으로 판이 성립하지 않으면 베팅을 전액 환불하고 재경기합니다' },
  {
    title: '좌석 탭 — 멤버 관리',
    description:
      '테이블의 좌석을 탭하면 그 사람에 대한 대리 입력(폰 없는 참가자), 바이인 추가, 역할 변경(딜러·관전자), 방장 위임을 할 수 있습니다',
  },
  { title: '방 옵션', description: '헤더의 ⚙️에서 방 이름·입력 모드·점당 칩·삥 단위를 바꿉니다 (방장 전용)' },
  { title: '모니터링 화면', description: '헤더의 📺를 태블릿·TV에 띄우면 테이블과 기록이 전광판으로 보입니다' },
]

export default function UsageGuidePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 lg:px-8 lg:pt-12">
      <GuideHeader
        backHref="/guide"
        backLabel="가이드 목록으로"
        emoji="📱"
        title="앱 사용법"
        description="방 만들기부터 정산·랭킹까지 진행 순서"
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-9">
          <section id="premise" className="scroll-mt-6">
            <Panel className="border-accent/30 bg-[#1a2f24] space-y-1.5">
              <p className="font-brush font-bold text-accent">이 앱은 기록용입니다</p>
              <p className="text-sm text-muted">
                게임은 실물 화투·카드·칩으로 칩니다. 앱은 베팅 액수와 승부 결과를 기록해
                정산과 랭킹을 자동으로 계산합니다
              </p>
            </Panel>
          </section>

          <section id="flow" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">진행 흐름</h2>
            <ol className="space-y-3">
              {FLOW_STEPS.map((step, index) => (
                <li key={step.title}>
                  <Panel className="flex gap-4 py-4">
                    <span className="gilt font-brush shrink-0 text-2xl font-black tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="font-bold">{step.title}</p>
                      <p className="mt-1 text-sm text-muted">{step.description}</p>
                    </div>
                  </Panel>
                </li>
              ))}
            </ol>
          </section>

          <section id="dealer" className="scroll-mt-6 space-y-3">
            <h2 className="text-xl font-bold">딜러 전용 기능</h2>
            <p className="text-sm text-muted">
              딜러 또는 방장 전용 기능입니다. 입력 모드와 무관하게 정정·판 무효·바이인 추가는
              딜러 권한이 필요합니다
            </p>
            <Panel className="border-accent/30 space-y-3">
              <ul className="space-y-3">
                {DEALER_ACTIONS.map((action) => (
                  <li key={action.title} className="flex gap-3">
                    <span className="text-accent">●</span>
                    <div>
                      <p className="font-bold">{action.title}</p>
                      <p className="text-sm text-muted">{action.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
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
