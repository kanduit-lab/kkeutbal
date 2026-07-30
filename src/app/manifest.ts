import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '끗발',
    short_name: '끗발',
    description: '판돈 없이 즐기는 섯다·고스톱·포커 판 기록',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // 세로가 정본이다 — 가로 전용 배치는 만들지 않는다. 이 필드는 "홈 화면에 추가"로 설치된
    // PWA(standalone display)에서만 OS가 실제로 회전을 잠근다 — 일반 브라우저 탭으로 열면
    // (설치 전, 또는 데스크톱 브라우저) 이 선언은 아무 효과가 없고 기기를 돌리면 그대로
    // 가로가 된다. 그래서 GameTable(src/features/game/components/game-table.tsx)과
    // globals.css에 가로에서도 깨지지 않는 CSS 대응을 별도로 넣었다 — 이 값만으로는
    // 가로 대응이 끝나지 않는다.
    orientation: 'portrait',
    background_color: '#0c2b20',
    theme_color: '#14432f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}