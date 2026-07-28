import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/lib/i18n/client'
import { PromotionHost } from '@/features/promotions/components/promotion-host'
import { listActivePromotions } from '@/features/promotions/queries'
import { getDict } from '@/lib/i18n/server'
import './globals.css'

const FALLBACK_METADATA = {
  title: '끗발',
  description: '섯다·고스톱·포커 판돈 기록장. 누가 얼마 땄는지 끝까지 남는다.',
} as const

/**
 * 링크 미리보기 기준 절대 URL. 카카오톡·슬랙 같은 크롤러는 상대 경로를 읽지 못해서
 * metadataBase 가 없으면 og 태그가 통째로 무시된다. 값이 없거나 형식이 틀리면 생략한다.
 */
function siteUrl(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL
  if (!raw) return undefined
  try {
    return new URL(raw)
  } catch {
    return undefined
  }
}

/**
 * 제목·설명을 og/twitter 까지 함께 채운다.
 * og:description 이 없으면 크롤러가 자체 기본 문구("여기를 눌러 링크를 확인하세요")로 대체한다.
 */
function siteMetadata(title: string, description: string): Metadata {
  const url = siteUrl()
  return {
    title,
    description,
    ...(url ? { metadataBase: url } : {}),
    openGraph: {
      type: 'website',
      siteName: title,
      title,
      description,
      ...(url ? { url: url.toString() } : {}),
    },
    twitter: { card: 'summary', title, description },
  }
}

/** 로케일 사전에서 제목·설명을 뽑는다. 읽기에 실패해도 절대 던지지 않는다. */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { d } = await getDict()
    return siteMetadata(d.meta.title, d.meta.description)
  } catch (error) {
    // metadata 생성 실패가 페이지 렌더를 죽이면 안 된다 — 정적 폴백으로 대체.
    console.error('generateMetadata failed:', error)
    return siteMetadata(FALLBACK_METADATA.title, FALLBACK_METADATA.description)
  }
}

// 판 옆에서 한 손으로 쓰는 앱이다. 확대 축소로 레이아웃이 깨지지 않게 세로 고정 기준으로 잡는다.
// viewportFit cover — 토스트 등이 env(safe-area-inset-*) 를 쓰려면 필수.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 본문 그라디언트 상단(#14432f)과 맞춘다 — 브라우저 크롬이 닿는 영역이 여기다.
  themeColor: '#14432f',
  viewportFit: 'cover',
}

/**
 * 공지 슬롯. 레이아웃 본체가 아니라 Suspense 경계 안에서만 DB 를 기다린다.
 *
 * 레이아웃이 직접 await 하면 조회가 끝날 때까지 셸이 한 바이트도 안 나간다 — 배너 하나 때문에
 * 로그인·소개·가이드까지 전부 멈춘다. 2026-07-27 에 실제로 그렇게 모든 페이지가 죽었다.
 * 조회 자체의 상한은 listActivePromotions 가 따로 건다.
 */
async function PromotionSlot() {
  const promotions = await listActivePromotions()
  return <PromotionHost promotions={promotions} />
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, d } = await getDict()
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} dict={d}>
          <ToastProvider closeLabel={d.common.close}>
            {/* 페이지마다 반복되는 헤더를 건너뛴다. PageShell 이 <main id="main"> 을 렌더한다. */}
            <a href="#main" className="skip-link">
              {d.common.skipToContent}
            </a>
            <Suspense fallback={null}>
              <PromotionSlot />
            </Suspense>
            {children}
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
