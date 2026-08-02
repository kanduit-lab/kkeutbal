import { expect, test } from './fixtures'

test('로그인 화면이 모바일에서 핵심 인증 경로를 제공한다', async ({ page }) => {
  await page.goto('/login')

  await expect(page).toHaveTitle(/끗발/)
  await expect(page.getByRole('heading', { name: '끗발' })).toBeVisible()
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  await expect(page.getByText('게스트 토큰으로 입장')).toBeVisible()
})

test('로그인 전환과 안전한 리다이렉트 경로를 제공한다', async ({ page }) => {
  await page.goto('/login?next=https%3A%2F%2Fevil.example%2Fsteal')

  await expect(page.locator('input[name="next"]')).toHaveValue('/')
  await page.getByRole('button', { name: '게스트 토큰으로 입장' }).click()
  await expect(page.getByRole('heading', { name: '게스트 입장' })).toBeVisible()

  // 이름 목록 불러오기 버튼은 없앴다 — 토큰만 있으면 남의 이름을 골라 그 계정이 될 수 있는
  // 경로였다. 지금 게스트 폼은 토큰·이름 입력과 기기 결속 안내만 보여준다.
  await expect(page.getByPlaceholder('토큰 8자리')).toBeVisible()
  await expect(page.getByText('이 기기에서 쓰던 이름')).toBeVisible()
})

test('알 수 없는 로그인 오류는 안전한 공통 문구로만 표시한다', async ({ page }) => {
  await page.goto('/login?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E')

  await expect(page.getByText('로그인에 실패했습니다')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('<script>alert(1)</script>')
})

test('소개 화면으로 이동할 수 있다', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: '이 앱 소개' }).click()

  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { name: /끗발/ })).toBeVisible()
})

test('소개에서 게임 가이드와 각 게임 규칙으로 이동할 수 있다', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('link', { name: '게임 가이드' }).click()

  await expect(page).toHaveURL(/\/guide$/)
  await expect(page.getByRole('heading', { name: '가이드' })).toBeVisible()

  const guides = [
    ['섯다', /\/guide\/seotda$/],
    ['고스톱', /\/guide\/gostop$/],
    ['포커', /\/guide\/poker$/],
    ['앱 사용법', /\/guide\/usage$/],
  ] as const

  for (const [name, expectedUrl] of guides) {
    await page.goto('/guide')
    await page.getByRole('link', { name }).click()
    await expect(page).toHaveURL(expectedUrl)
  }
})

test('언어 변경과 404 복구 동선을 제공한다', async ({ page }) => {
  await page.goto('/login')
  // exact: true — Next.js Dev Tools 오버레이의 "Open Next.js Dev Tools" 버튼도
  // 대소문자 무시 부분 일치로 "EN"이 걸린다(Op[en]). 개발 서버 실행 시에만 나타나
  // --dry-run으로는 안 잡히고 실제 실행에서만 strict mode violation으로 드러난다.
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kkeutbal' })).toBeVisible()

  await page.goto('/rooms-not-found')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
})

test('실제 인증 경로는 로그인으로 유도한다', async ({ page }) => {
  await page.goto('/rooms/new')

  await expect(page).toHaveURL(/\/login\?next=%2Frooms%2Fnew$/)
})

test('가상 크레딧 지갑도 로그인 뒤에만 접근할 수 있다', async ({ page }) => {
  await page.goto('/wallet')

  await expect(page).toHaveURL(/\/login\?next=%2Fwallet$/)
})
