import { test, type Page, type TestInfo } from '@playwright/test'
import { getLifecycleFixture, loginWithPassword } from './support'

/**
 * 스크린샷 수집 전용 스펙. 흐름이 끊기는지, 요소가 비는지는 다른 스펙이 단정(assert)하고,
 * 여기서는 "카드 배치가 이상하다"처럼 사람이 눈으로 봐야만 판단할 수 있는 디자인 이슈를 위해
 * 주요 화면의 전체 페이지 스크린샷만 남긴다. 시각 회귀 비교(`toHaveScreenshot`) 기준선은 만들지
 * 않는다 — 지금 UI가 계속 바뀌는 중이라 기준선이 커밋 몇 개 만에 썩는다.
 *
 * 저장 위치·파일명 규칙: Playwright가 테스트별로 관리하는
 * `test-results/<스펙 slug>-<테스트 제목 slug>-<프로젝트 이름>/<name>.png`
 * (`testInfo.outputPath()`가 만드는 경로 — `.gitignore`의 `/test-results`에 이미 포함되어
 * 커밋되지 않는다). project가 mobile-chromium/desktop-chromium 둘로 나뉘므로 같은 화면도
 * 두 폴더에 따로 떨어진다 — 파일명 자체에 뷰포트를 넣을 필요는 없다.
 */

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true })
}

test.describe('스크린샷 수집 — 공개 화면', () => {
  test('로그인', async ({ page }, testInfo) => {
    await page.goto('/login')
    await capture(page, testInfo, 'login')
  })

  test('가입 또는 접근 코드 안내', async ({ page }, testInfo) => {
    await page.goto('/register')
    await capture(page, testInfo, 'register')
  })

  test('소개', async ({ page }, testInfo) => {
    await page.goto('/about')
    await capture(page, testInfo, 'about')
  })

  const GUIDES = ['guide', 'guide/seotda', 'guide/gostop', 'guide/poker', 'guide/usage'] as const
  for (const path of GUIDES) {
    test(`가이드 — ${path}`, async ({ page }, testInfo) => {
      await page.goto(`/${path}`)
      await capture(page, testInfo, path.replace(/\//g, '-'))
    })
  }

  test('404', async ({ page }, testInfo) => {
    await page.goto('/rooms-not-found')
    await capture(page, testInfo, 'not-found')
  })
})

const username = process.env.E2E_TEST_USERNAME
const password = process.env.E2E_TEST_PASSWORD

test.describe('스크린샷 수집 — 로그인 후 화면', () => {
  test.skip(
    !username || !password,
    'Set E2E_TEST_USERNAME and E2E_TEST_PASSWORD for the dedicated E2E account.',
  )

  const AUTHENTICATED = [
    ['/', 'home'],
    ['/admin', 'admin'],
    ['/wallet', 'wallet'],
    ['/ranking', 'ranking'],
    ['/advisor', 'advisor'],
  ] as const

  for (const [path, name] of AUTHENTICATED) {
    test(`로그인 후 — ${path}`, async ({ page }, testInfo) => {
      await loginWithPassword(page, { username: username!, password: password! }, path)
      await capture(page, testInfo, name)
    })
  }
})

test.describe('스크린샷 수집 — 방 화면', () => {
  const fixture = getLifecycleFixture()
  test.skip(!fixture.canRun, fixture.skipReason)

  test('대기 중인 방 — 호스트·게스트·모니터', async ({ browser }, testInfo) => {
    test.setTimeout(60_000)
    const hostContext = await browser.newContext()
    const guestContext = await browser.newContext()
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()

    try {
      await loginWithPassword(host, { username: fixture.username!, password: fixture.password! })
      await loginWithPassword(guest, {
        username: fixture.secondUsername!,
        password: fixture.secondPassword!,
      })

      await host
        .getByRole('textbox', { name: '방 이름' })
        .fill(`E2E screenshot ${Date.now().toString(36)}`)
      await host.getByRole('button', { name: '방 만들기', exact: true }).click()
      await host.waitForURL(/\/rooms\/[A-Z0-9]{6}$/)
      const roomCode = new URL(host.url()).pathname.split('/').at(-1)

      await capture(host, testInfo, 'room-host-waiting')

      await guest.goto(`/rooms/${roomCode}`)
      await capture(guest, testInfo, 'room-guest-waiting')

      await host.goto(`/rooms/${roomCode}/monitor`)
      await capture(host, testInfo, 'room-monitor')
    } finally {
      await Promise.all([hostContext.close(), guestContext.close()])
    }
  })
})
