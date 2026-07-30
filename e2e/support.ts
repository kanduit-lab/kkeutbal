/** `auth.setup.ts`가 만든 세션을 인증 스펙들이 재사용하는 경로. gitignore 대상. */
export const STORAGE_STATE_PATH = 'playwright/.auth/user.json'

import { expect, type Page } from '@playwright/test'

/**
 * 고정 뷰포트 레이아웃 규약(`docs/12-handoff.md` 11번)의 핵심 불변식.
 * 목록·조회 화면은 문서 스크롤을 만들지 않는다 — 넘치는 내용은 페이지네이션(`Pager`)이나
 * 명시적인 내부 스크롤 영역(`ScrollPane`)이 흡수한다. 서브픽셀 반올림 오차를 고려해 1px
 * 여유를 둔다. 가로 스크롤도 같은 이유로 함께 본다(좁은 화면에서 표가 넘치는 회귀를 잡는다).
 */
export async function expectNoDocumentScroll(page: Page) {
  const { scrollHeight, scrollWidth, innerHeight, innerWidth } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }))

  expect(
    scrollHeight,
    '문서 세로 스크롤이 생기면 안 된다 (FixedPage 고정 뷰포트 규약 위반, docs/12-handoff.md 11번)',
  ).toBeLessThanOrEqual(innerHeight + 1)
  expect(scrollWidth, '문서 가로 스크롤이 생기면 안 된다').toBeLessThanOrEqual(innerWidth + 1)
}

/**
 * 계정 비밀번호 로그인 흐름. `next`를 지정하면 로그인 성공 뒤 그 경로로 리다이렉트된다.
 * 로그인 뒤 URL 검증은 호출자가 한다 — 리다이렉트 목적지가 테스트마다 다르기 때문이다.
 */
export async function loginWithPassword(
  page: Page,
  credentials: { username: string; password: string },
  next = '/rooms/new',
) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.locator('input[name="username"]').fill(credentials.username)
  await page.locator('input[name="password"]').fill(credentials.password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
}

export interface LifecycleFixture {
  readonly username?: string
  readonly password?: string
  readonly secondUsername?: string
  readonly secondPassword?: string
  /** 두 계정으로 방을 만들고 실제 판을 진행해도 되는지 — mutating 흐름 실행 여부 */
  readonly canRun: boolean
  readonly skipReason: string
}

/**
 * 실제 방을 만들고 판을 진행하는 mutating 테스트(방 생성·베팅·정산)가 공유하는 게이트.
 * 기본은 꺼짐 — 전용 계정 두 개와 명시적 옵트인 없이는 DB에 쓰지 않는다.
 */
export function getLifecycleFixture(): LifecycleFixture {
  const username = process.env.E2E_TEST_USERNAME
  const password = process.env.E2E_TEST_PASSWORD
  const secondUsername = process.env.E2E_SECOND_TEST_USERNAME
  const secondPassword = process.env.E2E_SECOND_TEST_PASSWORD

  const enabled = process.env.E2E_ENABLE_ROOM_LIFECYCLE === 'true'
  const hasCredentials = Boolean(username && password && secondUsername && secondPassword)
  const hasDistinctAccounts = username !== secondUsername
  const canRun = enabled && hasCredentials && hasDistinctAccounts

  const skipReason = !enabled
    ? 'Set E2E_ENABLE_ROOM_LIFECYCLE=true to allow the mutating room lifecycle test.'
    : !hasCredentials
      ? 'Set E2E_TEST_USERNAME/PASSWORD and E2E_SECOND_TEST_USERNAME/PASSWORD for two dedicated E2E accounts.'
      : 'E2E lifecycle test requires two distinct account usernames.'

  return { username, password, secondUsername, secondPassword, canRun, skipReason }
}
