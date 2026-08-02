import { expect, test } from './fixtures'
import { getLifecycleFixture, openTwoAccountPages, expectNoDocumentScroll } from './support'
import { ko } from '../src/lib/i18n/dictionaries/ko'

const { canRun, skipReason } = getLifecycleFixture()

/**
 * 세션 결과 화면(`/rooms/[code]/result`)의 레이아웃 회귀 가드.
 *
 * ## 무엇이 깨졌었나
 * 순위·정산·판 기록 세 패널이 전부 `flex-1`이라 **줄 수와 무관하게** 남은 높이를 정확히
 * 3등분했다. 그래서 "주고받을 게 없어요" 한 줄짜리 빈 정산 패널이 4명짜리 순위표와 똑같은
 * 높이를 가져가고, 순위표 몫은 한 줄(48px)조차 못 담는 53px까지 눌렸다. 그 안의 표는 81px라
 * `overflow-hidden`에 **글자 중간이 가로로 잘린 줄**이 그대로 보였고, 4명 중 1명만 나오는
 * 표가 4페이지짜리 페이저를 달고 있었다.
 *
 * `useFitCount`가 `min: 1`이라 "한 줄도 안 들어가는 높이"에서도 1을 돌려주는 것이 잘림의
 * 직접 원인이고, 높이를 내용과 무관하게 3등분한 것이 그 높이를 만든 원인이다. 지금은
 * `PaneGroup`(데스크톱 3열 / 모바일 탭)이 목록 하나에 남은 높이를 통째로 주고,
 * `listPanelMinHeight`가 어떤 배치에서도 한 줄 몫은 남게 바닥을 잡는다.
 *
 * ## 여기서 보는 불변식
 * 1. 표의 어떤 줄도 자기 영역(`overflow-hidden`) 밖으로 삐져나오지 않는다 — 잘린 줄이 없다.
 * 2. 페이저가 "1–N · 총 N"이다 — 화면에 자리가 남는데 페이지를 나누지 않는다.
 * 3. 문서 스크롤이 생기지 않는다(고정 뷰포트 규약).
 *
 * `playwright.config.ts`의 두 프로젝트(mobile-chromium / desktop-chromium) 모두에서 돈다.
 */

/** 표의 각 줄이 스크롤 컨테이너 안에 온전히 들어가는지 — 잘린 줄을 잡는다. */
async function expectNoClippedRows(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const areas = [...document.querySelectorAll<HTMLElement>('main div.overflow-hidden')]
    return areas
      .filter((area) => area.querySelector('tbody tr, ul li'))
      .map((area) => {
        const box = area.getBoundingClientRect()
        const rows = [...area.querySelectorAll<HTMLElement>('tbody tr, ul > li')]
        const worst = rows.reduce((max, row) => {
          const rect = row.getBoundingClientRect()
          // 줄의 아래쪽이 영역 아래쪽을 넘으면 그만큼 잘려 보인다.
          return Math.max(max, rect.bottom - box.bottom)
        }, 0)
        return { label: area.textContent?.slice(0, 20) ?? '', overflowPx: Math.round(worst) }
      })
      .filter((entry) => entry.overflowPx > 1)
  })

  expect(overflow, `영역 밖으로 삐져나온(=잘린) 줄이 있다: ${JSON.stringify(overflow)}`).toEqual([])
}

test.describe('세션 결과 — 목록이 잘리지 않는다', () => {
  test('참가자 전원이 잘리지 않은 채 한 화면에 들어간다', async ({ browser }) => {
    test.skip(!canRun, skipReason)
    test.setTimeout(90_000)

    const { host, guest, close } = await openTwoAccountPages(browser)

    try {
      const roomName = `E2E layout ${Date.now().toString(36)}`
      await host.getByRole('textbox', { name: '방 이름' }).fill(roomName)
      await host.getByRole('button', { name: ko.newRoom.create, exact: true }).click()
      await expect(host).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/)
      const roomCode = new URL(host.url()).pathname.split('/').at(-1)!

      // 두 번째 계정을 참가시켜 순위표에 줄이 둘 이상 생기게 한다 — 한 줄짜리 표는
      // 3등분 버그가 있어도 우연히 통과할 수 있다.
      await guest.goto(`/rooms/${roomCode}`)
      await expect(guest).toHaveURL(new RegExp(`/rooms/${roomCode}$`))

      await host.goto(`/rooms/${roomCode}/result`)
      await expect(host.getByRole('heading', { name: ko.result.title })).toBeVisible()

      await expectNoClippedRows(host)
      await expectNoDocumentScroll(host)

      // 순위 목록이 실제로 그려졌고, 참가자 수만큼 한 페이지에 다 들어갔는지 본다.
      const pagerRange = host.getByText(/1[–-]\d+ · 총 \d+/).first()
      await expect(pagerRange).toBeVisible()
      const range = (await pagerRange.textContent()) ?? ''
      const [, shown, total] = range.match(/1[–-](\d+) · 총 (\d+)/) ?? []
      expect(
        Number(shown),
        `자리가 남는데 ${total}명 중 ${shown}명만 보여준다 (${range})`,
      ).toBe(Number(total))
    } finally {
      await close()
    }
  })
})
