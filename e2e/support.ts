import { expect, type Browser, type Page } from '@playwright/test'

/** `auth.setup.ts`가 만든 세션을 인증 스펙들이 재사용하는 경로. gitignore 대상. */
export const STORAGE_STATE_PATH = 'playwright/.auth/user.json'

/**
 * 두 번째 참가자 세션. 방을 만드는 계정과 참가하는 계정이 달라야 "참가자 2명"·대리 액션·정산
 * 분배가 진짜로 검증된다.
 *
 * 세션을 파일로 남기는 이유는 첫 번째 계정과 같다 — 로그인은 `auth.password.account_address`
 * 한도(15분당 10회)를 쓰는 동작이고, 두 계정 × 두 프로젝트 × 여러 스펙이 각자 로그인하면 한 번
 * 실행에 계정당 로그인이 5~8회씩 나와 개발 중 두 번만 돌려도 `too_many_attempts`가 난다.
 * 그래서 실제 로그인은 `auth.setup.ts`에서 계정당 한 번만 하고, 나머지는 이 상태를 재사용한다.
 */
export const SECOND_STORAGE_STATE_PATH = 'playwright/.auth/second.json'

/**
 * 저장된 두 계정 세션으로 브라우저 컨텍스트 두 개를 연다. 방 생성·참가·정산처럼 서로 다른
 * 계정이 동시에 필요한 스펙이 공유한다.
 *
 * `/rooms/new` 도착 여부가 저장된 세션이 실제로 인증되는지에 대한 단정을 겸한다 — 세션이
 * 죽었으면 로그인 화면으로 밀려나므로 여기서 바로 실패한다.
 */
export async function openTwoAccountPages(browser: Browser) {
  const hostContext = await browser.newContext({ storageState: STORAGE_STATE_PATH })
  const guestContext = await browser.newContext({ storageState: SECOND_STORAGE_STATE_PATH })
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  await host.goto('/rooms/new')
  await expect(host).toHaveURL(/\/rooms\/new$/)
  return {
    host,
    guest,
    // 정리 실패는 삼킨다. 테스트가 타임아웃으로 죽으면 컨텍스트도 이미 정리돼서 close가
    // "Test ended"로 던지는데, 그 에러가 finally에서 원래 실패를 덮어써 어느 단계에서 멈췄는지
    // 보이지 않는다.
    close: async () => {
      await Promise.all([hostContext.close().catch(() => {}), guestContext.close().catch(() => {})])
    },
  }
}

/**
 * 고정 뷰포트 레이아웃 규약(`docs/12-handoff.md` 11번)의 핵심 불변식.
 * 목록·조회 화면은 문서 스크롤을 만들지 않는다 — 넘치는 내용은 페이지네이션(`Pager`)이나
 * 명시적인 내부 스크롤 영역(`ScrollPane`)이 흡수한다. 서브픽셀 반올림 오차를 고려해 1px
 * 여유를 둔다. 가로 스크롤도 같은 이유로 함께 본다(좁은 화면에서 표가 넘치는 회귀를 잡는다).
 */
export async function expectNoDocumentScroll(page: Page) {
  // 측정 중에 네비게이션이 끼면 evaluate가 터진다: 문서가 아직 없으면
  // "Cannot read properties of null", 측정 도중에 이동하면 "Execution context was destroyed".
  // 리다이렉트가 걸린 화면(/register → /login?error=…, 정산 직후 /result 자동 이동)에서 실제로
  // 둘 다 나왔다. 문서가 준비되길 기다리고, 그래도 끼면 다시 잰다 — 불변식 자체는 그대로다.
  let metrics: {
    scrollHeight: number
    scrollWidth: number
    innerHeight: number
    innerWidth: number
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.waitForLoadState('domcontentloaded')
      metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
      }))
      break
    } catch (error) {
      if (attempt >= 2) throw error
    }
  }
  const { scrollHeight, scrollWidth, innerHeight, innerWidth } = metrics

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
