import { getDict } from '@/lib/i18n/server'

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