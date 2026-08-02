import { test as base } from '@playwright/test'
import { dismissPromotionPopup } from './support'

/**
 * 스펙이 쓰는 `test`. `@playwright/test`의 것을 그대로 쓰지 않는 이유는 하나다 —
 * 공지 팝업.
 *
 * `PromotionHost`는 루트 레이아웃에 있어서 관리자가 팝업 하나를 살려두면 **모든 화면**에
 * `role="dialog" aria-modal`인 `fixed inset-0` 오버레이가 깔린다. 그러면 그 화면의 클릭이
 * 전부 오버레이에 가로막혀, 앱에는 아무 문제가 없는데도 스펙 12개가 한꺼번에 타임아웃으로
 * 죽는다(실제로 그렇게 죽어 있었다). 콘텐츠 하나가 테스트 전체를 무너뜨리지 않도록
 * 이동 직후에 한 번 치운다.
 *
 * 스펙마다 `dismissPromotionPopup`을 부르게 하지 않는 이유: 빠뜨린 곳은 조용히 통과하다가
 * 팝업이 살아 있는 날에만 깨진다. 이동 지점 한 곳에 묶어 두면 빠뜨릴 자리가 없다.
 *
 * `browser.newContext()`로 페이지를 직접 만드는 경로(`openTwoAccountPages`)는 이 fixture 를
 * 거치지 않으므로 거기서는 `gotoRoom`이 같은 일을 한다.
 */
export const test = base.extend({
  // 두 번째 인자 이름이 `use`면 eslint 의 react-hooks 규칙이 React 훅 호출로 오해한다
  // (`use`는 React 19의 실제 훅 이름이다). Playwright 는 위치 인자라 이름은 자유롭다.
  page: async ({ page }, runTest) => {
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      await dismissPromotionPopup(page)
      return response
    }
    await runTest(page)
  },
})

export { expect } from '@playwright/test'
