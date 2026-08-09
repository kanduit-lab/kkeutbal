import { expect, test } from './fixtures'
import { ko } from '../src/lib/i18n/dictionaries/ko'
import { format } from '../src/lib/i18n/format'
import { STORAGE_STATE_PATH, expectNoDocumentScroll } from './support'

/**
 * 족보 판독기(`/advisor`)의 화면 규약.
 *
 * 방을 만들지 않으므로 lifecycle 게이트가 필요 없다 — 저장된 세션만 있으면 된다.
 * 문구를 직접 적지 않고 사전(`ko`)에서 읽는다: 예전에 문구 한 줄 바꿨다가 스펙이 조용히
 * 썩은 적이 있다.
 */
test.describe('족보 판독기', () => {
  const username = process.env.E2E_TEST_USERNAME
  const password = process.env.E2E_TEST_PASSWORD

  test.skip(
    !username || !password,
    'Set E2E_TEST_USERNAME and E2E_TEST_PASSWORD for the dedicated E2E account.',
  )
  test.use({ storageState: STORAGE_STATE_PATH })

  test('섯다 카드를 두 장 고르면 결과 패널로 저절로 넘어간다', async ({ page }, testInfo) => {
    await page.goto('/advisor?game=seotda')

    const pickerTab = page.getByRole('radio', { name: ko.advisor.pickerTab })
    const resultTab = page.getByRole('radio', { name: ko.advisor.resultTab })
    const isPortrait = testInfo.project.name === 'mobile-chromium'

    if (isPortrait) {
      // 세로 화면은 픽커/결과가 탭으로 갈린다. 처음에는 픽커가 선택돼 있어야 한다.
      await expect(pickerTab).toHaveAttribute('aria-checked', 'true')
    }

    const cards = page.getByRole('button', { name: /선택$/ })
    await expect(cards.first()).toBeVisible()

    // 첫 장만 고른 상태에서는 아직 판정할 수 없으므로 픽커에 머물러야 한다.
    await cards.nth(0).click()
    await expect(
      page.getByRole('heading', { name: format(ko.advisor.cardSelectionCount, { n: 1, max: 2 }) }),
    ).toBeVisible()
    if (isPortrait) {
      await expect(pickerTab).toHaveAttribute('aria-checked', 'true')
    }

    // 두 장째를 고르는 순간 손으로 탭을 누르지 않아도 판정이 보여야 한다.
    await cards.nth(1).click()
    if (isPortrait) {
      await expect(resultTab).toHaveAttribute('aria-checked', 'true')
    }
    await expect(page.getByText(ko.advisor.ranking.title)).toBeVisible()
    await expectNoDocumentScroll(page)
  })

  test('족보 순위표가 순위 번호와 조합 수를 함께 보여준다', async ({ page }) => {
    await page.goto('/advisor?game=seotda')

    const cards = page.getByRole('button', { name: /선택$/ })
    await expect(cards.first()).toBeVisible()
    await cards.nth(0).click()
    await cards.nth(1).click()

    const ranking = page.getByText(ko.advisor.ranking.title)
    await expect(ranking).toBeVisible()

    // 줄마다 "N위"가 붙어 있어야 목록을 스크롤하는 동안에도 지금 몇 위를 보는지 알 수 있다.
    await expect(page.getByText(/^\d+위$/).first()).toBeVisible()
    // 같은 서열이 몇 가지 조합으로 나오는지가 각 줄에 있다.
    await expect(page.getByText(/^\d+가지$/).first()).toBeVisible()

    // 표는 언제나 29단계 전부 그려지고, 결과 컬럼 하나가 그걸 스크롤한다. 예전에는 내 패
    // 둘레만 잘라 그리고 "N단계 더 있어요"만 적어 두었는데, 그 영역이 스크롤되지 않아
    // 나머지 단계로 갈 방법이 없었다.
    await expect(page.getByRole('group', { name: ko.advisor.ranking.fullListAria })).toBeVisible()
    await expect(
      page.getByText(format(ko.advisor.ranking.positionBadge, { position: 1 }), { exact: true }),
    ).toHaveCount(1)

    const column = page.getByRole('region', { name: ko.advisor.resultScrollLabel })
    const scrolled = await column.evaluate((node) => {
      const before = node.scrollTop
      node.scrollTop = node.scrollHeight
      return node.scrollTop > before
    })
    expect(scrolled).toBe(true)
  })

  test('유의사항을 펼치면 암행어사·땡잡이 규칙이 나온다', async ({ page }) => {
    await page.goto('/advisor?game=seotda')

    const cards = page.getByRole('button', { name: /선택$/ })
    await expect(cards.first()).toBeVisible()
    await cards.nth(0).click()
    await cards.nth(1).click()

    const toggle = page.getByRole('button', { name: ko.advisor.ranking.caveatsToggleShow })
    await expect(toggle).toBeVisible()
    await expect(page.getByText(ko.advisor.ranking.caveats.amhaengeosa.title)).toHaveCount(0)

    await toggle.click()
    await expect(page.getByText(ko.advisor.ranking.caveats.amhaengeosa.title)).toBeVisible()
    await expect(page.getByText(ko.advisor.ranking.caveats.ttaengjabi.title)).toBeVisible()
    await expect(page.getByText(ko.advisor.ranking.caveats.gusa.title)).toBeVisible()

    // 접기 버튼으로 다시 닫힌다 — hover 로만 열리는 표면을 만들지 않는다.
    await page.getByRole('button', { name: ko.advisor.ranking.caveatsToggleHide }).click()
    await expect(page.getByText(ko.advisor.ranking.caveats.amhaengeosa.title)).toHaveCount(0)
    await expectNoDocumentScroll(page)
  })

  test('사진으로 확인 버튼은 카드 고르는 화면 안에 있다', async ({ page }, testInfo) => {
    await page.goto('/advisor?game=seotda')

    // 결과 패널이 아니라 픽커 아래에 있어야 한다 — 손으로 고르기 시작한 사람이
    // 대안을 바로 볼 수 있는 자리다. 카드 목록과 같은 화면에 함께 떠 있으면 된다.
    const capture = page.getByRole('button', { name: ko.advisor.vision.captureButton })
    const cards = page.getByRole('button', { name: /선택$/ })
    await expect(capture).toBeVisible()
    await expect(cards.first()).toBeVisible()

    if (testInfo.project.name === 'mobile-chromium') {
      // 결과 탭으로 넘어가면 픽커와 함께 사라진다 — 판정 화면에는 없다.
      await page.getByRole('radio', { name: ko.advisor.resultTab }).click()
      await expect(capture).toHaveCount(0)
    }
  })

  test('포커 탭은 다섯 장을 채우면 결과로 넘어간다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', '탭 전환은 세로 화면에만 있다')

    await page.goto('/advisor?game=poker')

    const resultTab = page.getByRole('radio', { name: ko.advisor.resultTab })
    const cards = page.getByRole('button', { name: /선택$/ })
    await expect(cards.first()).toBeVisible()

    for (let index = 0; index < 4; index += 1) {
      await cards.nth(index).click()
    }
    await expect(resultTab).toHaveAttribute('aria-checked', 'false')

    await cards.nth(4).click()
    await expect(resultTab).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText(ko.advisor.pokerRanking.title)).toBeVisible()
  })
})
