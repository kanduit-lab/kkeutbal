import { test } from '@playwright/test'
import { STORAGE_STATE_PATH, expectNoDocumentScroll } from './support'

/**
 * 고정 뷰포트 레이아웃 회귀 가드 (docs/12-handoff.md 11번).
 *
 * 2026-07-30부터 목록·조회 화면은 문서 스크롤을 만들지 않는다는 규약이 생겼다. 여기서는
 * 그 불변식(`expectNoDocumentScroll`, `./support.ts`)을 실제 화면에 걸어 자동으로 지킨다.
 * `playwright.config.ts`의 `projects`가 mobile-chromium과 desktop-chromium 둘 다 정의하므로
 * 이 스펙은 두 뷰포트 모두에서 돈다.
 *
 * 제외(의도): `/guide/*`, `/about` — 읽는 문서라서 문서 스크롤이 맞는 동작이다
 * (docs/12-handoff.md 11번 "미적용" 절). `/rooms/[code]/settings`,
 * `/rooms/[code]/fairness/[seq]`도 같은 절에서 "한 패널 화면은 flex-1 중앙 정렬로 충분"이라고
 * 밝힌 예외라 여기서 강제하지 않는다.
 */

const PUBLIC_ROUTES = [
  ['/login', '로그인 기본 화면'],
  ['/login?mode=guest', '게스트 입장 폼'],
  ['/login?error=invalid_credentials', '로그인 오류 배너'],
  ['/login?next=%2Frooms%2FAB12CD', '방 코드 안내 배너 (roomCode 파싱 분기)'],
  // 가입 코드가 없는 기본 환경에서는 /login?error=... 로 리다이렉트된다.
  // 코드가 있는 환경에서는 가입 폼이 그대로 뜬다 — 둘 다 문서 스크롤이 없어야 한다.
  ['/register', '가입 화면 또는 접근 코드 필요 리다이렉트'],
  ['/rooms-not-found', '404 (ko 로케일 기본값)'],
  // 아래 넷은 미인증 상태에서 /login[?next=...]으로 리다이렉트된다. 리다이렉트 목적지 자체가
  // 문서 스크롤을 만들지 않는지, 그리고 인증 경로가 여전히 로그인으로 막혀 있는지를 함께 본다.
  ['/', '홈 — 미인증 시 로그인 리다이렉트'],
  ['/rooms/new', '방 만들기 — 미인증 시 로그인 리다이렉트'],
  ['/wallet', '지갑 — 미인증 시 로그인 리다이렉트'],
  ['/ranking', '랭킹 — 미인증 시 로그인 리다이렉트'],
  ['/admin', '관리자 — 미인증 시 로그인 리다이렉트'],
  ['/advisor', '족보 어드바이저 — 미인증 시 로그인 리다이렉트'],
] as const

test.describe('공개 화면 — 문서 스크롤 회귀 가드', () => {
  for (const [path, label] of PUBLIC_ROUTES) {
    test(`${path} (${label})은 문서 스크롤을 만들지 않는다`, async ({ page }) => {
      await page.goto(path)
      await expectNoDocumentScroll(page)
    })
  }
})

const username = process.env.E2E_TEST_USERNAME
const password = process.env.E2E_TEST_PASSWORD

test.describe('인증 화면 — 문서 스크롤 회귀 가드', () => {
  // auth.setup.ts가 만든 세션을 재사용한다 — 화면마다 로그인하면 로그인 rate limit에 걸린다.
  test.use({ storageState: STORAGE_STATE_PATH })
  test.skip(
    !username || !password,
    'Set E2E_TEST_USERNAME and E2E_TEST_PASSWORD for the dedicated E2E account.',
  )

  // docs/12-handoff.md 11번 "적용" 목록 중 방을 새로 만들지 않고도 닿을 수 있는 화면들.
  // /admin은 테스트 계정이 관리자든 아니든(권한 거부 패널도 PageShell 단일 패널이라) 규약을
  // 그대로 만족해야 한다 — 그래서 별도의 관리자 fixture가 없어도 검증할 수 있다.
  const AUTHENTICATED_ROUTES = ['/', '/admin', '/wallet', '/ranking', '/advisor'] as const

  for (const path of AUTHENTICATED_ROUTES) {
    test(`로그인 후 ${path}은 문서 스크롤을 만들지 않는다`, async ({ page }) => {
      await page.goto(path)
      await expectNoDocumentScroll(page)
    })
  }
})

test('방 화면(/rooms/[code], /monitor, /result)의 문서 스크롤 확인은 별도 lifecycle 테스트가 담당', async () => {
  // 이 화면들은 실제로 만들어진 방이 있어야 검증할 수 있다. 방 생성은 DB에 쓰는 mutating
  // 동작이라 여기서 새로 만들지 않는다 — 이미 방을 만드는
  // e2e/authenticated-room.spec.ts의 "two dedicated accounts complete a manual
  // session-chip room lifecycle" 테스트(E2E_ENABLE_ROOM_LIFECYCLE=true + 전용 계정 2개
  // 필요)에 expectNoDocumentScroll 호출을 얹어서 확인한다. 조용히 빼는 대신 스킵 사유를
  // 여기 남긴다.
  test.skip(
    true,
    'covered by authenticated-room.spec.ts lifecycle test (E2E_ENABLE_ROOM_LIFECYCLE=true)',
  )
})
