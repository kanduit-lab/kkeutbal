import { getDict } from '@/lib/i18n/server'

/**
 * 긴 가이드 문서 끝에서 다시 목차·제목으로 돌아가는 링크.
 * PageShell 이 렌더하는 `<main id="main">` 을 앵커로 쓴다.
 */
export async function BackToTop() {
  const { d } = await getDict()

  return (
    <p className="text-center">
      <a
        href="#main"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted underline underline-offset-4 transition-colors hover:text-text"
      >
        <span aria-hidden>↑</span>
        {d.guide.backToTop}
      </a>
    </p>
  )
}
