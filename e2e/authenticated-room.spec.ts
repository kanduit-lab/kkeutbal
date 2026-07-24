import { expect, test } from '@playwright/test'

/**
 * This spec deliberately never confirms room creation: it validates the
 * account-credit selection and its explicit confirmation boundary without
 * leaving test rooms or credit locks in the configured database.
 *
 * Supply a non-admin, dedicated account only in the test runner environment.
 * Credentials are intentionally not read from application env files.
 */
const username = process.env.E2E_TEST_USERNAME
const password = process.env.E2E_TEST_PASSWORD

test.describe('authenticated room funding', () => {
  test.skip(
    !username || !password,
    'Set E2E_TEST_USERNAME and E2E_TEST_PASSWORD for the dedicated E2E account.',
  )

  test('account-credit room selection requires an explicit final confirmation', async ({ page }) => {
    await page.goto('/login?next=%2Frooms%2Fnew')
    await page.locator('input[name="username"]').fill(username!)
    await page.locator('input[name="password"]').fill(password!)
    await page.getByRole('button', { name: '로그인', exact: true }).click()

    await expect(page).toHaveURL(/\/rooms\/new$/)

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
})
