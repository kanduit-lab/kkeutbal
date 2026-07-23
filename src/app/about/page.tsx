import Link from 'next/link'
import { findCard } from '@/features/hwatu/cards'
import { HwatuCardView } from '@/components/hwatu-card'
import { ButtonLink, Panel } from '@/components/ui'

const SHOWCASE_CARD_IDS = ['01-gwang', '03-gwang', '08-gwang', '11-gwang', '12-gwang'] as const

const FEATURES = [
  {
    emoji: '🪑',
    title: '실시간 테이블',
    body: '방에 모인 사람들이 각자 폰으로 베팅을 입력하면 전원 화면이 즉시 동기화됩니다. 테이블 위 칩과 팟이 그대로 보입니다.',
  },
  {
    emoji: '🧾',
    title: '자동 정산',
    body: '판마다 승패와 칩 이동이 원장으로 기록되고, 세션이 끝나면 손익이 자동으로 집계됩니다. 공용 칩만 쓰던 판의 "누가 얼마 땄더라"가 사라집니다.',
  },
  {
    emoji: '🏆',
    title: '누적 랭킹',
    body: '방이 끝나도 전적은 계정에 쌓입니다. 다음 모임에서 지난 전적을 이어서 겨룹니다.',
  },
  {
    emoji: '🔮',
    title: '족보 판독',
    body: '들고 있는 패를 고르거나 사진을 찍으면 족보와 서열을 알려줍니다. 처음 치는 사람도 표를 외울 필요가 없습니다.',
  },
] as const

/** 앱 소개 — 로그인 없이 볼 수 있는 정적 페이지. */
export default function AboutPage() {
  const showcase = SHOWCASE_CARD_IDS.map((id) => findCard(id)).filter(
    (card): card is NonNullable<typeof card> => card !== undefined,
  )

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10">
      <header className="rise-in text-center">
        <div className="mb-6 flex justify-center gap-2">
          {showcase.map((card, index) => (
            <div
              key={card.id}
              className="w-16 sm:w-20"
              style={{ transform: `rotate(${(index - 2) * 6}deg)` }}
            >
              <HwatuCardView card={card} size="sm" />
            </div>
          ))}
        </div>
        <h1 className="font-brush text-6xl font-black tracking-tight">
          끗발<span className="text-accent">.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          판돈 없이 즐기는 섯다·고스톱·포커 실시간 판 기록. 방 코드 하나로 모이고, 각자
          폰으로 베팅하고, 끝나면 손익과 랭킹이 자동으로 남습니다.
        </p>
      </header>

      <section className="rise-in rise-in-1 mt-10 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <Panel key={feature.title} className="space-y-2">
            <p className="text-3xl">{feature.emoji}</p>
            <h2 className="font-bold">{feature.title}</h2>
            <p className="text-sm text-muted">{feature.body}</p>
          </Panel>
        ))}
      </section>

      <section className="rise-in rise-in-2 mt-8 space-y-3">
        <h2 className="text-xl font-bold">이렇게 씁니다</h2>
        <Panel>
          <ol className="list-inside list-decimal space-y-2 text-sm">
            <li>한 명이 방을 만들고 게임(섯다·고스톱·포커)과 시작 칩을 정합니다</li>
            <li>나머지는 6자리 코드나 링크로 입장합니다 — 자리는 자동으로 생깁니다</li>
            <li>실물 카드로 치면서 베팅만 각자 폰으로 입력합니다</li>
            <li>판이 끝나면 딜러가 승자를 확정하고, 칩이 자동으로 이동합니다</li>
            <li>세션 정산을 누르면 전체 손익과 랭킹이 나옵니다</li>
          </ol>
        </Panel>
        <p className="text-xs text-muted">
          실제 돈이나 유가물이 오가지 않는 기록 도구입니다. 화투 도안은 CC BY-SA 4.0
          라이선스를 따릅니다.
        </p>
      </section>

      <div className="rise-in rise-in-3 mt-10 grid gap-3 sm:grid-cols-2">
        <ButtonLink href="/login" variant="primary" size="lg">
          시작하기
        </ButtonLink>
        <ButtonLink href="/guide" variant="surface" size="lg" className="border border-white/10">
          게임 가이드
        </ButtonLink>
      </div>

      <footer className="mt-10 text-center text-xs text-muted">
        <Link href="/" className="underline underline-offset-4 hover:text-text">
          홈으로
        </Link>
      </footer>
    </main>
  )
}
