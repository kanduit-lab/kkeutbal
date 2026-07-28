import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/lib/i18n/client'
import { PromotionHost } from '@/features/promotions/components/promotion-host'
import { listActivePromotions } from '@/features/promotions/queries'
import { getDict } from '@/lib/i18n/server'
import { bodyFont, displayFont } from './fonts'
import './globals.css'

const FALLBACK_METADATA = {
  title: '끗발',
  description: '섯다·고스톱·포커 판돈 기록장. 누가 얼마 땄는지 끝까지 남는다.',
} as const

function siteUrl(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL
  if (!raw) return undefined
  try {
    return new URL(raw)
  } catch {
    return undefined
  }
}

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

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { d } = await getDict()
    return siteMetadata(d.meta.title, d.meta.description)
  } catch (error) {
    console.error('generateMetadata failed:', error)
    return siteMetadata(FALLBACK_METADATA.title, FALLBACK_METADATA.description)
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14432f',
  viewportFit: 'cover',
}

async function PromotionSlot() {
  const promotions = await listActivePromotions()
  return <PromotionHost promotions={promotions} />
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, d } = await getDict()
  return (
    <html lang={locale} className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <I18nProvider locale={locale} dict={d}>
          <ToastProvider closeLabel={d.common.close}>
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