import { expect, test } from '@playwright/test'

test('로그인 화면이 모바일에서 핵심 인증 경로를 제공한다', async ({ page }) => {
  await page.goto('/login')

  await expect(page).toHaveTitle(/끗발/)
  await expect(page.getByRole('heading', { name: '끗발' })).toBeVisible()
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  await expect(page.getByText('게스트 토큰으로 입장')).toBeVisible()
})

test('소개 화면으로 이동할 수 있다', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: '이 앱 소개' }).click()

  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { name: /끗발/ })).toBeVisible()
})
