import { defineConfig, devices } from '@playwright/test'

// Playwright는 `.env.local`을 스스로 읽지 않는다 — Next.js가 앱 프로세스에서 읽는 것이고
// 테스트 프로세스는 셸 환경변수만 본다. 그래서 `E2E_TEST_USERNAME` 같은 값을 파일에 넣어도
// 스펙에서는 undefined였고 인증 스펙이 조용히 전부 skip됐다. CI처럼 파일이 없는 환경도 있으니
// 실패는 무시하고, 이미 셸에 있는 값은 덮어쓰지 않는다(`loadEnvFile`의 기본 동작).
try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local이 없으면 셸 환경변수만 쓴다
}

const externalBaseUrl = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // 이 앱의 단정은 대부분 Server Action 왕복 + Broadcast → 스냅샷 refetch를 기다린다. 기본 5초는
  // 워커 여러 개가 개발 서버를 함께 두드릴 때 모자라 실제로 스펙이 흔들렸다. 진짜로 느린 흐름
  // (검증 딜 봉인, 정산)은 각 단정에서 더 길게 따로 잡는다.
  expect: { timeout: 10_000 },
  projects: [
    {
      // 세션을 한 번 만들어 파일로 남긴다. 인증 스펙들이 그걸 재사용해서 로그인 횟수를
      // 한 자리로 줄인다 — 화면마다 로그인하면 auth.password rate limit에 실제로 걸린다.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'mobile-chromium',
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'] },
    },
    {
      // 1280x720 — Tailwind `lg`(min-width: 1024px, `useIsDesktop`의 DESKTOP_QUERY) 위라
      // PaneGroup 나란히 배치·DataTable 등 데스크톱 전용 분기가 실제로 걸린다.
      name: 'desktop-chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000/login',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
