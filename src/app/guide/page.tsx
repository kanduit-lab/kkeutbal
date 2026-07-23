import Link from 'next/link'
import type { Route } from 'next'
import { Panel } from '@/components/ui'
import { GAME_LABELS } from '@/features/game/components/shared'

interface GuideEntry {
  readonly href: Route
  readonly emoji: string
  readonly title: string
  readonly description: string
}

const ENTRIES: readonly GuideEntry[] = [
  {
    href: '/guide/seotda',
    emoji: GAME_LABELS.seotda.emoji,
    title: GAME_LABELS.seotda.name,
    description: '두 장으로 족보를 겨루는 게임. 족보 서열과 광땡·특수패 정리',
  },
  {
    href: '/guide/gostop',
    emoji: GAME_LABELS.gostop.emoji,
    title: GAME_LABELS.gostop.name,
    description: '광·열끗·띠·피 모아 점수 내기. 고/스톱과 배수 규칙 정리',
  },
  {
    href: '/guide/poker',
    emoji: GAME_LABELS.poker.emoji,
    title: GAME_LABELS.poker.name,
    description: '텍사스 홀덤 족보 10가지 서열표와 예시 카드',
  },
  {
    href: '/guide/usage',
    emoji: '📱',
    title: '앱 사용법',
    description: '방 만들기부터 베팅, 정산, 랭킹까지 — 딜러 전용 기능 포함',
  },
]

export default function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 lg:px-8 lg:pt-12">
      <header className="rise-in mb-8 flex items-start gap-3 lg:mb-12">
        <Link
          href="/"
          aria-label="홈으로"
          className="mt-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xl text-muted transition-colors hover:text-text"
        >
          ←
        </Link>
        <div>
          <h1 className="font-brush text-4xl font-black tracking-tight lg:text-5xl">
            가이드<span className="text-accent">.</span>
          </h1>
          <p className="mt-2 text-muted">
            족보 서열표와 앱 사용법
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ENTRIES.map((entry, index) => (
          <Link
            key={entry.href}
            href={entry.href}
            className={`rise-in rise-in-${Math.min(index + 1, 4)} block`}
          >
            <Panel className="flex h-full flex-col items-center gap-2 py-8 text-center transition-transform hover:-translate-y-0.5">
              <p className="text-3xl">{entry.emoji}</p>
              <p className="font-brush text-xl font-bold">{entry.title}</p>
              <p className="text-sm text-muted">{entry.description}</p>
            </Panel>
          </Link>
        ))}
      </div>
    </main>
  )
}
