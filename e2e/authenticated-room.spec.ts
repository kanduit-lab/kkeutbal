import { expect, test } from '@playwright/test'
import { expectNoDocumentScroll, getLifecycleFixture, loginWithPassword } from './support'

const { username, password, secondUsername, secondPassword, canRun, skipReason } =
  getLifecycleFixture()
const canRunLifecycle = canRun
const lifecycleSkipReason = skipReason

test.describe('authenticated room funding', () => {
  test.skip(
    !username || !password,
    'Set E2E_TEST_USERNAME and E2E_TEST_PASSWORD for the dedicated E2E account.',
  )

  test('account-credit room selection requires an explicit final confirmation', async ({
    page,
  }) => {
    await loginWithPassword(page, { username: username!, password: password! })
    await expect(page).toHaveURL(/\/rooms\/new$/)
    await expectNoDocumentScroll(page)

    const sessionFunding = page.getByRole('button', { name: '세션 칩', exact: true })
    const accountFunding = page.getByRole('button', { name: '계정 크레딧', exact: true })
    await expect(sessionFunding).toHaveAttribute('aria-pressed', 'true')

    await accountFunding.click()
    await expect(accountFunding).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('시작 칩과 추가 바이인이 각 계정에서 잠기며')).toBeVisible()

    await page.getByRole('button', { name: '방 만들기', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '계정 크레딧 방을 만들까요?' })
    await expect(confirmation).toBeVisible()
    await expect(confirmation.getByRole('button', { name: '계정 크레딧 방 만들기' })).toBeVisible()

    await confirmation.getByRole('button', { name: '취소', exact: true }).click()
    await expect(confirmation).not.toBeVisible()
    await expect(page).toHaveURL(/\/rooms\/new$/)
  })

  test('two dedicated accounts complete a manual session-chip room lifecycle', async ({
    browser,
  }) => {
    test.skip(!canRunLifecycle, lifecycleSkipReason)
    test.setTimeout(90_000)

    const hostContext = await browser.newContext()
    const guestContext = await browser.newContext()
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()

    try {
      await loginWithPassword(host, { username: username!, password: password! })
      await expect(host).toHaveURL(/\/rooms\/new$/)
      await loginWithPassword(guest, { username: secondUsername!, password: secondPassword! })
      await expect(guest).toHaveURL(/\/rooms\/new$/)

      const roomName = `E2E lifecycle ${Date.now().toString(36)}`
      await host.getByRole('textbox', { name: '방 이름' }).fill(roomName)
      await expect(host.getByRole('button', { name: '세션 칩', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )

      await host.getByRole('button', { name: '방 만들기', exact: true }).click()
      await expect(host).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/)
      const roomCode = new URL(host.url()).pathname.split('/').at(-1)
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)
      // 고정 뷰포트 회귀 가드 (docs/12-handoff.md 11번): /rooms/[code]는 문서 스크롤을 만들면 안 된다.
      await expectNoDocumentScroll(host)

      await guest.goto(`/rooms/${roomCode}`)
      await expect(guest.getByText('참가자 2명')).toBeVisible()
      await expectNoDocumentScroll(guest)

      // 모니터 화면도 같은 규약을 따른다 — 별도 방을 만들지 않고 이 방에 얹어서 확인한다.
      await host.goto(`/rooms/${roomCode}/monitor`)
      await expectNoDocumentScroll(host)
      await host.goto(`/rooms/${roomCode}`)

      await host.getByRole('button', { name: /판 시작/ }).click()
      await expect(host.getByText('1판 진행 중')).toBeVisible()

      await host.getByRole('button', { name: /판 종료/ }).click()
      const winnerPicker = host.getByText('1판 승자 선택').locator('..')
      const winnerCandidates = winnerPicker.locator('div.grid').first().getByRole('button')
      await expect(winnerCandidates).toHaveCount(2)
      await winnerCandidates.first().click()
      await host.getByRole('button', { name: '승자 확정', exact: true }).click()
      await expect(host.getByText(/지난 1판:/)).toBeVisible()

      await host.getByRole('button', { name: '세션 정산', exact: true }).click()
      const settleDialog = host.getByRole('dialog', { name: '세션을 정산할까요?' })
      await expect(settleDialog).toBeVisible()
      await settleDialog.getByRole('button', { name: '정산', exact: true }).click()
      await expect(host).toHaveURL(new RegExp(`/rooms/${roomCode}/result$`))
      await expectNoDocumentScroll(host)

      await guest.goto(`/rooms/${roomCode}`)
      await expect(guest).toHaveURL(new RegExp(`/rooms/${roomCode}/result$`))
      await expectNoDocumentScroll(guest)
    } finally {
      await Promise.all([hostContext.close(), guestContext.close()])
    }
  })

  test('two dedicated accounts complete a verified Seotda deal and recompute its audit', async ({
    browser,
  }) => {
    test.skip(!canRunLifecycle, lifecycleSkipReason)
    test.setTimeout(120_000)

    const hostContext = await browser.newContext()
    const guestContext = await browser.newContext()
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()

    try {
      await loginWithPassword(host, { username: username!, password: password! })
      await expect(host).toHaveURL(/\/rooms\/new$/)
      await loginWithPassword(guest, { username: secondUsername!, password: secondPassword! })
      await expect(guest).toHaveURL(/\/rooms\/new$/)

      await host
        .getByRole('textbox', { name: '방 이름' })
        .fill(`E2E verified ${Date.now().toString(36)}`)
      await host.getByRole('button', { name: '방 만들기', exact: true }).click()
      await expect(host).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/)
      const roomCode = new URL(host.url()).pathname.split('/').at(-1)
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)

      await host.goto(`/rooms/${roomCode}/settings`)
      await host.getByRole('button', { name: '수동 딜', exact: true }).click()
      await expect(
        host.getByRole('button', { name: '검증 가능한 섯다 딜 사용', exact: true }),
      ).toBeVisible()
      await host.getByRole('button', { name: '저장', exact: true }).click()
      await expect(host).toHaveURL(new RegExp(`/rooms/${roomCode}$`))

      await guest.goto(`/rooms/${roomCode}`)
      await expect(guest.getByText('참가자 2명')).toBeVisible()

      await host.getByRole('button', { name: /판 시작/ }).click()
      await expect(host.getByRole('heading', { name: /검증 가능한 섯다 딜/ })).toBeVisible()
      await expect(guest.getByRole('heading', { name: /검증 가능한 섯다 딜/ })).toBeVisible()

      await host.getByRole('button', { name: '내 시드 제출', exact: true }).click()
      await guest.getByRole('button', { name: '내 시드 제출', exact: true }).click()
      await host.getByRole('button', { name: '검증 딜 봉인', exact: true }).click()
      await expect(host.getByText('딜 봉인 완료')).toBeVisible()

      await host.getByRole('button', { name: '내 검증 패 보기', exact: true }).click()
      await guest.reload()
      await guest.getByRole('button', { name: '내 검증 패 보기', exact: true }).click()
      await expect(host.getByText('내 검증 패')).toBeVisible()
      await expect(guest.getByText('내 검증 패')).toBeVisible()

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await host.getByRole('button', { name: /판 종료/ }).click()
        const auditAppeared = await host
          .getByRole('link', { name: '공정성 감사', exact: true })
          .isVisible({ timeout: 3_000 })
          .catch(() => false)
        if (auditAppeared) {
          break
        }
        await host.getByRole('button', { name: '판 무효', exact: true }).click()
        await host.getByRole('dialog').getByRole('button', { name: '무효화', exact: true }).click()
        await host.getByRole('button', { name: /판 시작/ }).click()
        await host.getByRole('button', { name: '내 시드 제출', exact: true }).click()
        await guest.reload()
        await guest.getByRole('button', { name: '내 시드 제출', exact: true }).click()
        await host.getByRole('button', { name: '검증 딜 봉인', exact: true }).click()
      }

      const auditLink = host.getByRole('link', { name: '공정성 감사', exact: true })
      await expect(auditLink).toBeVisible()
      await auditLink.click()
      await expect(host).toHaveURL(new RegExp(`/rooms/${roomCode}/fairness/\\d+$`))
      await expect(host.getByText('덱 재계산 검증 통과')).toBeVisible()

      await host.goto(`/rooms/${roomCode}`)
      await host.getByRole('button', { name: '세션 정산', exact: true }).click()
      await host
        .getByRole('dialog', { name: '세션을 정산할까요?' })
        .getByRole('button', { name: '정산', exact: true })
        .click()
      await expect(host).toHaveURL(new RegExp(`/rooms/${roomCode}/result$`))
    } finally {
      await Promise.all([hostContext.close(), guestContext.close()])
    }
  })
})
