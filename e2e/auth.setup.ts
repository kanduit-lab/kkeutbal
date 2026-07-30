import { test as setup } from '@playwright/test'
import { loginWithPassword, STORAGE_STATE_PATH } from './support'

const username = process.env.E2E_TEST_USERNAME
const password = process.env.E2E_TEST_PASSWORD

/**
 * 세션을 한 번만 만들어 파일로 저장하고, 인증이 필요한 스펙들이 그걸 재사용한다.
 *
 * 왜 필요한가: 화면마다 로그인하면 한 번 돌 때 로그인이 십여 번 발생하고,
 * `auth.password.account_address`(15분당 10회) 한도를 실제로 넘겨서 스펙이
 * `too_many_attempts`로 죽는다. 그 한도는 비밀번호 무제한 시도를 막는 장치라 낮출 게 아니라,
 * 테스트가 로그인을 반복하지 않게 만드는 것이 맞다.
 *
 * 로그인 흐름 자체를 검증하는 스펙(`public-surfaces`, `authenticated-room`)은 이 상태를
 * 쓰지 않고 실제로 로그인한다 — 그게 그 스펙의 대상이기 때문이다.
 */
setup('세션을 한 번 만들어 저장한다', async ({ page }) => {
  setup.skip(
    !username || !password,
    'Set E2E_TEST_USERNAME and E2E_TEST_PASSWORD for the dedicated E2E account.',
  )
  await loginWithPassword(page, { username: username!, password: password! })
  await page.context().storageState({ path: STORAGE_STATE_PATH })
})
