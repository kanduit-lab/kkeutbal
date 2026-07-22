import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui'
import { I18nProvider } from '@/lib/i18n/client'
import { getDict } from '@/lib/i18n/server'
import './globals.css'

export const metadata: Metadata = {
  title: '끗발',
  description: '섯다·고스톱·포커 판돈 기록장. 누가 얼마 땄는지 끝까지 남는다.',
}

// 판 옆에서 한 손으로 쓰는 앱이다. 확대 축소로 레이아웃이 깨지지 않게 세로 고정 기준으로 잡는다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0f',
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
