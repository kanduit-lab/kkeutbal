import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '끗발',
  description: '판돈 없이 즐기는 화투(섯다·고스톱) 실시간 판 기록·베팅·랭킹·족보 트래커',
}

// 판 옆에서 한 손으로 쓰는 앱이다. 확대 축소로 레이아웃이 깨지지 않게 세로 고정 기준으로 잡는다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
