import { expect, test, type Page } from '@playwright/test'
import {
  expectNoDocumentScroll,
  getLifecycleFixture,
  openTwoAccountPages,
  STORAGE_STATE_PATH,
} from './support'
// 문구는 사전에서 읽는다 — 하드코딩하면 문장 손질 한 번에 스펙이 깨진다
// (실제로 '각 계정에서 잠기며' → '각자 계정에서 잠기고'로 바뀌어 이 스펙이 낡아 있었다).
import { ko } from '../src/lib/i18n/dictionaries/ko'

const { username, password, canRun, skipReason } = getLifecycleFixture()
const canRunLifecycle = canRun
const lifecycleSkipReason = skipReason

/** 모바일 퀵바(`DealerQuickBar`)가 직접 노출하는 액션. 나머지는 🛠️ 시트 안에 있다. */
const QUICK_BAR_ACTIONS: readonly string[] = [
  ko.dealer.startRound,
  ko.dealer.endRound,
  ko.dealer.voidRound,
]

/**
 * 딜러 표면이 판을 마친 상태(진행 중인 판 없음)가 되기를 기다린다.
 *
 * `DealerPanel`은 액션 격자를 `mode === 'idle'`일 때만 렌더하고, 그 격자 안에 세션 정산·지난 판
 * 취소가 있다. 승자 선택 모드에서는 그 버튼들이 DOM에 아예 없어서, 기다리지 않고 정산을 누르면
 * "없는 버튼"을 클릭 타임아웃까지 기다린다. 판이 없을 때만 뜨는 판 시작 버튼이 그 신호다.
 */
async function expectDealerIdle(page: Page) {
  await expect(page.getByRole('button', { name: ko.dealer.startRound }).first()).toBeVisible({
    timeout: 20_000,
  })
}

/**
 * 딜러 액션을 누른다. 뷰포트에 따라 같은 액션이 다른 곳에 있다: 데스크톱은 `DealerPanel`이
 * 항상 펼쳐져 있고, 모바일은 퀵바 + 🛠️ 시트로 나뉜다. 라벨 앞에 이모지가 붙는 버튼
 * ("🧾 세션 정산", "🏁 판 종료")이 있어 `exact`는 쓰지 않는다 — exact로 쓰면 데스크톱에서도
 * 못 찾는다.
 */
async function clickDealerAction(page: Page, label: string) {
  const target = page.getByRole('button', { name: label }).first()
  if (QUICK_BAR_ACTIONS.includes(label)) {
    // 로비의 판 시작 버튼, 모바일 퀵바, 데스크톱 패널이 모두 이 라벨을 직접 노출한다.
    await target.click()
    return
  }

  // 시트 전용 액션(세션 정산·지난 판 취소)은 "지금 어느 레이아웃인지"로 분기하면 양쪽에서
  // 반대로 틀린다. 레이아웃은 클라이언트 미디어 쿼리(`useIsDesktop`)가 정하고 마운트 직후 한 번
  // 뒤집힌다. 시트도 스스로 열리고 닫힌다: 판 종료가 `pickWinner` 모드로 바뀌면 자동으로 열리고
  // 승자 확정으로 그 모드를 벗어나면 effect가 자동으로 닫는다
  // (`dealer-quick-bar.tsx`의 `openedForPickWinner`). 그래서 레이아웃도 순간 가시성도 믿지 않고
  // 짧은 타임아웃으로 몇 번 시도한다 — 무엇보다 액션마다 타임아웃을 못 박아서, 실패가 테스트
  // 전체 타임아웃까지 매달리는 대신 그 자리에서 드러나게 한다(그렇게 두 번 죽었다).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await target.isVisible().catch(() => false)) {
      const clicked = await target
        .click({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false)
      if (clicked) return
    }
    const tools = page.getByRole('button', { name: new RegExp(ko.dealer.toolsAria) }).first()
    if (await tools.isVisible().catch(() => false)) {
      await tools.click({ timeout: 5_000 }).catch(() => {})
      const inSheet = page.getByRole('dialog').getByRole('button', { name: label }).first()
      const clicked = await inSheet
        .click({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false)
      if (clicked) return
    }
  }
  // 여기까지 왔으면 진짜로 못 누른 것이다. 마지막 시도의 에러를 그대로 드러낸다.
  await target.click({ timeout: 10_000 })
}

test.describe('authenticated room funding', () => {
  // 저장된 세션을 쓴다. 이 스펙이 검증하는 것은 칩 재원 선택의 확인 절차이고 로그인 흐름이
  // 아니다 — 여기서 매번 로그인하면 프로젝트 수만큼 로그인 한도를 쓴다. 실제 로그인은
  // `auth.setup.ts`가 계정당 한 번만 한다.
  test.use({ storageState: STORAGE_STATE_PATH })
  test.skip(
    !username || !password,
    'Set E2E_TEST_USERNAME and E2E_TEST_PASSWORD for the dedicated E2E account.',
  )

  test('account-credit room selection requires an explicit final confirmation', async ({
    page,
  }) => {
    await page.goto('/rooms/new')
    await expect(page).toHaveURL(/\/rooms\/new$/)
    await expectNoDocumentScroll(page)

    const sessionFunding = page.getByRole('button', {
      name: ko.roomForm.sessionFunding,
      exact: true,
    })
    const accountFunding = page.getByRole('button', {
      name: ko.roomForm.accountCreditFunding,
      exact: true,
    })
    await expect(sessionFunding).toHaveAttribute('aria-pressed', 'true')

    await accountFunding.click()
    await expect(accountFunding).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(ko.roomForm.accountCreditFundingHint)).toBeVisible()

    await page.getByRole('button', { name: ko.newRoom.create, exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '계정 크레딧 방을 만들까요?' })
    await expect(confirmation).toBeVisible()
    await expect(
      confirmation.getByRole('button', { name: ko.roomForm.accountCreditConfirmLabel }),
    ).toBeVisible()

    await confirmation.getByRole('button', { name: ko.common.cancel, exact: true }).click()
    await expect(confirmation).not.toBeVisible()
    await expect(page).toHaveURL(/\/rooms\/new$/)
  })

  test('two dedicated accounts complete a manual session-chip room lifecycle', async ({
    browser,
  }) => {
    test.skip(!canRunLifecycle, lifecycleSkipReason)
    test.setTimeout(90_000)

    const { host, guest, close } = await openTwoAccountPages(browser)

    try {
      const roomName = `E2E lifecycle ${Date.now().toString(36)}`
      await host.getByRole('textbox', { name: '방 이름' }).fill(roomName)
      await expect(
        host.getByRole('button', { name: ko.roomForm.sessionFunding, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')

      await host.getByRole('button', { name: ko.newRoom.create, exact: true }).click()
      await expect(host).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/)
      const roomCode = new URL(host.url()).pathname.split('/').at(-1)
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)
      // 고정 뷰포트 회귀 가드 (docs/12-handoff.md 11번): /rooms/[code]는 문서 스크롤을 만들면 안 된다.
      await expectNoDocumentScroll(host)

      await guest.goto(`/rooms/${roomCode}`)
      await expect(guest.getByText('참가자 2명')).toBeVisible()
      await expectNoDocumentScroll(guest)
      // 호스트 화면도 두 명으로 갱신되어야 판이 두 명 기준으로 시작된다(Broadcast → refetch).
      await expect(host.getByText('참가자 2명')).toBeVisible({ timeout: 15_000 })

      // 모니터 화면도 같은 규약을 따른다 — 별도 방을 만들지 않고 이 방에 얹어서 확인한다.
      await host.goto(`/rooms/${roomCode}/monitor`)
      await expectNoDocumentScroll(host)
      await host.goto(`/rooms/${roomCode}`)

      await clickDealerAction(host, ko.dealer.startRound)
      await expect(host.getByText('1판 진행 중')).toBeVisible()

      await clickDealerAction(host, ko.dealer.endRound)
      const winnerPicker = host.getByText('1판 승자 선택').locator('..')
      const winnerCandidates = winnerPicker.locator('div.grid').first().getByRole('button')
      await expect(winnerCandidates).toHaveCount(2)
      await winnerCandidates.first().click()
      await host.getByRole('button', { name: ko.dealer.confirmWinner, exact: true }).click()
      // 승자 확정은 서버 왕복 + Broadcast → refetch를 거쳐야 요약 줄로 나타난다. 기본 5초는
      // 워커 8개가 개발 서버를 함께 두드릴 때 모자라서 실제로 흔들렸다.
      await expect(host.getByText(/지난 1판:/)).toBeVisible({ timeout: 20_000 })

      await expectDealerIdle(host)
      await clickDealerAction(host, ko.dealer.settleSession)
      const settleDialog = host.getByRole('dialog', { name: ko.dealer.settleConfirmTitle })
      await expect(settleDialog).toBeVisible()
      await settleDialog
        .getByRole('button', { name: ko.dealer.settleConfirmLabel, exact: true })
        .click()
      await expect(host).toHaveURL(new RegExp(`/rooms/${roomCode}/result$`))
      await expectNoDocumentScroll(host)

      await guest.goto(`/rooms/${roomCode}`)
      await expect(guest).toHaveURL(new RegExp(`/rooms/${roomCode}/result$`))
      await expectNoDocumentScroll(guest)
    } finally {
      await close()
    }
  })

  test('two dedicated accounts complete a verified Seotda deal and recompute its audit', async ({
    browser,
  }) => {
    test.skip(!canRunLifecycle, lifecycleSkipReason)
    test.setTimeout(120_000)

    const { host, guest, close } = await openTwoAccountPages(browser)

    try {
      await host
        .getByRole('textbox', { name: '방 이름' })
        .fill(`E2E verified ${Date.now().toString(36)}`)
      await host.getByRole('button', { name: ko.newRoom.create, exact: true }).click()
      await expect(host).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/)
      const roomCode = new URL(host.url()).pathname.split('/').at(-1)
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)

      await host.goto(`/rooms/${roomCode}/settings`)
      // 토글 하나가 두 상태의 라벨을 번갈아 쓴다: OFF일 때 '수동 딜', ON일 때 '검증 가능한 섯다
      // 딜 사용'. 그래서 아래 클릭은 "수동 딜을 고르는" 것이 아니라 검증 딜을 **켜는** 동작이고,
      // 이어지는 단정이 실제로 켜졌는지 확인한다.
      await host.getByRole('button', { name: ko.fairness.verifiedDisabled, exact: true }).click()
      await expect(
        host.getByRole('button', { name: ko.fairness.verifiedEnabled, exact: true }),
      ).toBeVisible()
      await host.getByRole('button', { name: '저장', exact: true }).click()
      await expect(host).toHaveURL(new RegExp(`/rooms/${roomCode}$`))

      await guest.goto(`/rooms/${roomCode}`)
      await expect(guest.getByText('참가자 2명')).toBeVisible()
      // 호스트 쪽도 두 명으로 갱신될 때까지 기다린다. 이건 Broadcast → refetch 왕복에 대한
      // 단정을 겸한다. 기다리지 않고 판을 시작하면 검증 딜이 참가자 한 명 기준으로 도는지를
      // 헷갈리게 되고, 실제로 여기서 스펙이 흔들렸다.
      await expect(host.getByText('참가자 2명')).toBeVisible({ timeout: 15_000 })

      await clickDealerAction(host, ko.dealer.startRound)
      // 검증 딜 시작은 시드 commitment 생성까지 포함하므로 기본 5초보다 여유를 준다.
      await expect(host.getByRole('heading', { name: ko.fairness.title })).toBeVisible({
        timeout: 20_000,
      })
      await expect(guest.getByRole('heading', { name: ko.fairness.title })).toBeVisible({
        timeout: 20_000,
      })

      await host.getByRole('button', { name: ko.fairness.submitSeed, exact: true }).click()
      await guest.getByRole('button', { name: ko.fairness.submitSeed, exact: true }).click()
      // 봉인의 실제 전제조건은 "호스트 화면이 전원 제출을 확인했다"다. 이걸 기다리지 않으면
      // 호스트의 낡은 스냅샷 상태에서 봉인을 눌러 결과 문구가 늦게 뜨고 스펙이 흔들린다.
      const allSeedsIn = ko.fairness.submitted.replace('{submitted}', '2').replace('{total}', '2')
      await expect(host.getByText(allSeedsIn)).toBeVisible({ timeout: 20_000 })
      await host.getByRole('button', { name: ko.fairness.sealDeal, exact: true }).click()
      await expect(host.getByText(ko.fairness.sealed)).toBeVisible({ timeout: 20_000 })

      await host.getByRole('button', { name: ko.fairness.showMyHand, exact: true }).click()
      await guest.reload()
      await guest.getByRole('button', { name: ko.fairness.showMyHand, exact: true }).click()
      // exact가 없으면 '내 검증 패 숨기기' 버튼까지 걸려 strict mode 위반이 난다.
      await expect(host.getByText(ko.fairness.handTitle, { exact: true })).toBeVisible()
      await expect(guest.getByText(ko.fairness.handTitle, { exact: true })).toBeVisible()

      // 무승부·구사는 판 무효 뒤 재경기라 감사 자료가 안 남는다(ko.fairness.replayHint).
      // 감사 링크가 뜰 때까지 최대 5판을 돌린다.
      const auditLink = host.getByRole('link', { name: ko.fairness.auditLink, exact: true })
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await clickDealerAction(host, ko.dealer.endRound)
        // `isVisible()`은 폴링하지 않는다 — timeout 옵션을 줘도 즉시 답을 돌려준다. 원래 스펙은
        // 판 종료가 아직 "처리 중…"인 사이에 곧바로 "감사 없음"으로 단정하고 판 무효를 눌렀고,
        // 판이 끝난 뒤에는 판 무효가 영구히 비활성이라 30초 타임아웃으로 죽었다. 실제로 기다린다.
        const auditAppeared = await auditLink
          .waitFor({ state: 'visible', timeout: 15_000 })
          .then(() => true)
          .catch(() => false)
        if (auditAppeared) {
          break
        }
        await clickDealerAction(host, ko.dealer.voidRound)
        await host
          .getByRole('dialog')
          .getByRole('button', { name: ko.dealer.voidConfirm, exact: true })
          .click()
        await clickDealerAction(host, ko.dealer.startRound)
        await host.getByRole('button', { name: ko.fairness.submitSeed, exact: true }).click()
        await guest.reload()
        await guest.getByRole('button', { name: ko.fairness.submitSeed, exact: true }).click()
        await host.getByRole('button', { name: ko.fairness.sealDeal, exact: true }).click()
      }

      await expect(auditLink).toBeVisible()
      await auditLink.click()
      await expect(host).toHaveURL(new RegExp(`/rooms/${roomCode}/fairness/\\d+$`))
      await expect(host.getByText(ko.fairness.auditVerified)).toBeVisible()

      await host.goto(`/rooms/${roomCode}`)
      await expectDealerIdle(host)
      await clickDealerAction(host, ko.dealer.settleSession)
      await host
        .getByRole('dialog', { name: ko.dealer.settleConfirmTitle })
        .getByRole('button', { name: ko.dealer.settleConfirmLabel, exact: true })
        .click()
      await expect(host).toHaveURL(new RegExp(`/rooms/${roomCode}/result$`))
    } finally {
      await close()
    }
  })
})
