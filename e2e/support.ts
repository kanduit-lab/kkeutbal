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
  // 공지 팝업은 루트 레이아웃에 있어 어느 화면에서든 뜬다. 저장된 세션으로 바로 들어오는
  // 이 경로는 로그인 폼을 거치지 않으므로 여기서 따로 치워야 한다 — 안 치우면 "방 만들기"
  // 클릭이 오버레이에 막혀 방을 만드는 스펙이 전부 타임아웃으로 죽는다.
  // guest 쪽은 아직 about:blank 이므로 각자 이동한 뒤 `gotoRoom`이 치운다.
  await dismissPromotionPopup(host)
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
  await dismissPromotionPopup(page)
  await page.locator('input[name="username"]').fill(credentials.username)
  await page.locator('input[name="password"]').fill(credentials.password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
}

/**
 * 공지 팝업(`PromotionHost`)을 닫는다.
 *
 * 팝업은 `role="dialog" aria-modal` 오버레이라 `fixed inset-0`으로 화면 전체를 덮는다.
 * 관리자가 살아 있는 팝업을 하나 등록해 두면 로그인 버튼 클릭이 그 오버레이에 가로막혀
 * `auth.setup.ts`가 통째로 실패하고, 그러면 `storageState`가 안 만들어져서 인증이 필요한
 * 스펙이 전부 ENOENT로 죽는다. 실제로 그렇게 죽었다 — 콘텐츠 하나로 테스트 전체가
 * 무너지지 않게 로그인 경로에서 먼저 치운다.
 *
 * 팝업이 없는 게 정상이므로 없으면 조용히 지나간다.
 */
export async function dismissPromotionPopup(page: Page) {
  // "N시간 동안 보지 않기"를 누른다. "닫기"는 컴포넌트 상태만 바꿔서 새로고침이나 다음
  // 이동에 팝업이 그대로 다시 뜬다 — 소켓을 끊고 reload 하는 스펙이 정확히 그걸로 깨졌다.
  // 이 버튼은 localStorage 에 숨김 기록을 남기므로 같은 컨텍스트에서 다시 안 뜬다.
  const popup = page.getByRole('dialog')
  const dismiss = popup.getByRole('button', { name: /동안 보지 않기$/ })
  // 팝업은 hydration 뒤 localStorage 의 숨김 기록을 읽고 나서야 그려진다. 이동 직후
  // 한 번만 보면 아직 없어서 그냥 지나가고, 그 다음 클릭이 뒤늦게 뜬 오버레이에 막힌다.
  // 잠깐 기다렸다가 없으면 없는 대로 넘어간다.
  try {
    await dismiss.first().waitFor({ state: 'visible', timeout: 3_000 })
  } catch {
    return
  }
  await dismiss.first().click()
  await dismiss.first().waitFor({ state: 'hidden' })
}

/**
 * 방으로 이동하고 공지 팝업을 치운다 — 팝업이 떠 있으면 방 안 버튼이 전부 안 눌린다.
 *
 * `roomCode`가 undefined 로 오면 `/rooms/undefined`로 가서 엉뚱한 화면을 검사하게 되므로
 * 여기서 바로 실패시킨다. 호출부가 URL에서 코드를 뽑아 쓰기 때문에 실제로 생길 수 있다.
 */
export async function gotoRoom(page: Page, roomCode: string | undefined) {
  expect(roomCode, '방 코드를 URL에서 뽑지 못했다').toBeTruthy()
  await page.goto(`/rooms/${roomCode}`)
  await dismissPromotionPopup(page)
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
