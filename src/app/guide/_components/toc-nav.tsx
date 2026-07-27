import { Panel } from '@/components/ui'
import { getDict } from '@/lib/i18n/server'

/**
 * 섹션 앵커 목차. 순수 앵커 링크라 클라이언트 상태가 필요 없다.
 *
 * 모바일에서는 본문 위에 가로 칩 줄로, 데스크톱에서는 우측 sticky 패널로 렌더한다.
 * 예전에는 그리드 마지막 자식이라 1열 레이아웃에서 본문을 다 지나야 목차가 나왔고,
 * 그 상태의 목차는 사실상 쓸 수 없었다.
 */
export async function TocNav({ items }: { items: readonly { href: string; label: string }[] }) {
  const { d } = await getDict()

  return (
    // min-w-0: 그리드/플렉스 자식의 기본 min-width 는 auto 라, 아래 가로 스크롤 칩 줄이
    // 컬럼 자체를 콘텐츠 폭까지 밀어내 페이지 전체에 가로 스크롤이 생긴다.
    <nav aria-label={d.guide.tocTitle} className="min-w-0 lg:sticky lg:top-6">
      <h2 className="sr-only">{d.guide.tocTitle}</h2>

      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <a
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-surface-raised px-3 text-sm font-semibold text-muted transition-colors hover:border-white/25 hover:text-text"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>

      <Panel className="hidden lg:block">
        <p aria-hidden className="mb-2 px-1 text-xs font-bold tracking-wider text-muted">
          {d.guide.tocTitle}
        </p>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-text"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </nav>
  )
}
