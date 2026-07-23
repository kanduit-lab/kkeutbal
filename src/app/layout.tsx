import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/lib/i18n/client'
import { getDict } from '@/lib/i18n/server'
import './globals.css'

const FALLBACK_METADATA = {
  title: '끗발',
  description: '섯다·고스톱·포커 판돈 기록장. 누가 얼마 땄는지 끝까지 남는다.',
} as const

/** 로케일 사전에서 제목·설명을 뽑는다. 읽기에 실패해도 절대 던지지 않는다. */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { d } = await getDict()
    return {
      title: d.meta.title,
      description: d.meta.description,
    }
  } catch (error) {
    // metadata 생성 실패가 페이지 렌더를 죽이면 안 된다 — 정적 폴백으로 대체.
    console.error('generateMetadata failed:', error)
    return { ...FALLBACK_METADATA }
  }
}

// 판 옆에서 한 손으로 쓰는 앱이다. 확대 축소로 레이아웃이 깨지지 않게 세로 고정 기준으로 잡는다.
// viewportFit cover — 토스트 등이 env(safe-area-inset-*) 를 쓰려면 필수.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0f',
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, d } = await getDict()
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} dict={d}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
