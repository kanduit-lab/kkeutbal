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
      '게임 종류(섯다·고스톱·포커), 시작 칩, 입력 모드를 정해요. 신뢰 모드는 각자 입력이 바로 반영되고, 승인 모드는 딜러가 승인해야 반영돼요',
  },
  {
    title: '코드 공유',
    description: '방이 만들어지면 6자리 코드가 나와요. 같이 있는 사람들에게 알려주면 각자 폰으로 입장해요',
  },
  {
    title: '판 시작 (딜러)',
    description: '딜러나 방장이 새 판을 열면, 그 순간부터 모두의 화면이 실시간으로 동기화돼요',
  },
  {
    title: '각자 베팅',
    description:
      '체크·콜·레이즈·다이·올인 버튼으로 자기 액션을 기록해요. 실물 칩은 테이블에 그대로 놓고 치면 되고, 앱은 그 액수만 따라서 기록해요',
  },
  {
    title: '판 종료 · 승자 지정',
    description: '딜러가 승자를 고르고 족보나 점수 메모를 남기면 그 판이 정산돼요',
  },
  {
    title: '세션 정산',
    description: '판을 다 마치고 방장이 정산하면, 참가자별 손익이 자동으로 집계돼요',
  },
  {
    title: '랭킹',
    description: '정산된 세션은 누적 랭킹에 반영돼서 지금까지 전적을 확인할 수 있어요',
  },
]

interface DealerAction {
  readonly title: string
  readonly description: string
}

const DEALER_ACTIONS: readonly DealerAction[] = [
  { title: '승인 / 거절', description: '승인 모드일 때, 대기 중인 베팅을 확인하고 반영하거나 거절해요' },
  { title: '정정', description: '잘못 입력된 베팅을 사유와 함께 바로잡아요' },
  { title: '판 무효', description: '구사가 나오는 등 판이 성립하지 않을 때, 그 판을 무효로 하고 다시 시작해요' },
  { title: '대리 입력', description: '핸드폰이 없거나 조작이 서툰 사람 대신 베팅을 입력해줘요' },
  { title: '바이인 추가', description: '칩이 부족한 사람에게 시작 칩 외에 추가로 칩을 지급해요' },
]

export default function UsageGuidePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 lg:px-8 lg:pt-12">
      <GuideHeader
        backHref="/guide"
        backLabel="가이드 목록으로"
        emoji="📱"
        title="앱 사용법"
        description="방 만들기부터 랭킹까지, 끗발을 실제로 쓰는 흐름을 순서대로 정리했어요"
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-9">
          <section id="premise" className="scroll-mt-6">
            <Panel className="border-accent/30 bg-[#1a2f24] space-y-1.5">
              <p className="font-brush font-bold text-accent">이 앱은 기록용이에요</p>
              <p className="text-sm text-muted">
                게임 자체는 실물 화투·카드·칩으로 그대로 쳐요. 앱은 베팅 액수와 승부 결과만 따라
                기록해서, 정산과 랭킹을 자동으로 계산해줘요
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
              딜러(또는 방장)만 할 수 있는 일이에요. 승인 모드가 아니어도 정정·판 무효·바이인 추가는
              딜러 권한이 필요해요
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
