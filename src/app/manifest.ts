import type { MetadataRoute } from 'next'

/**
 * PWA 매니페스트. 참가자는 전부 모바일 브라우저로 링크·QR 을 타고 들어오는 제품이라
 * "홈 화면에 추가"가 재방문 최단 경로다. 이 파일이 없으면 standalone 실행이 안 되고
 * 아이콘도 스크린샷 폴백이 된다.
 *
 * 색은 globals.css `@theme` 과 layout.tsx `viewport.themeColor` 에 맞춘다 —
 * background 는 --color-bg, theme 는 본문 그라디언트 상단 값이다.
 * name 은 브랜드라 로케일과 무관하게 원어를 쓴다 (사전의 `common.appName` 과 같은 규칙).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '끗발',
    short_name: '끗발',
    description: '판돈 없이 즐기는 섯다·고스톱·포커 판 기록',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0c2b20',
    theme_color: '#14432f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
