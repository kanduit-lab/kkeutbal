import { clsx } from 'clsx'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * 페이지 컨테이너. 라우트 파일 30개가 각자 max-width 5종 · 좌우 여백 4종으로
 * <main> 을 손수 그리고 있어서 화면을 옮길 때마다 본문 폭과 여백이 눈에 띄게 흔들렸다.
 * 폭은 여기서만 고른다.
 */
const WIDTH_CLASS = {
  narrow: 'max-w-md',
  content: 'max-w-3xl',
  wide: 'max-w-6xl',
  board: 'max-w-7xl',
} as const

export function PageShell({
  width = 'wide',
  center = false,
  className,
  children,
}: {
  width?: keyof typeof WIDTH_CLASS
  /** 로그인·에러처럼 화면 가운데 한 덩어리만 있는 화면 */
  center?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <main
      id="main"
      className={clsx(
        'mx-auto w-full px-4 pb-16 pt-6 sm:px-6',
        WIDTH_CLASS[width],
        center && 'flex min-h-dvh flex-col justify-center pb-6',
        className,
      )}
    >
      {children}
    </main>
  )
}

/**
 * 뒤로가기 + 제목 + 우측 액션. `←` 글리프만 덜렁 놓고 aria-label 도 없는 헤더가
 * 13개 파일에 흩어져 있었다. 뒤로 갈 곳이 없으면 backHref 를 생략한다.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** typedRoutes 가 켜져 있어 Link 의 href 타입을 그대로 받는다. */
  backHref?: React.ComponentProps<typeof Link>['href']
  backLabel: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={clsx('mb-6 flex items-start gap-3', className)}>
      {backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-xl text-muted transition hover:text-text"
        >
          ←
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="font-brush truncate text-2xl font-black">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
