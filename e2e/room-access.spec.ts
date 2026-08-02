import { expect, test } from './fixtures'
import { getLifecycleFixture, gotoRoom, openTwoAccountPages } from './support'
// 문구는 사전에서 읽는다 — 하드코딩하면 문장 손질 한 번에 스펙이 낡는다.
import { ko } from '../src/lib/i18n/dictionaries/ko'

const { canRun, skipReason } = getLifecycleFixture()

/**
 * 방 코드만 아는 사람이 방의 돈을 읽을 수 있는지 본다.
 *
 * `/monitor`(전광판)와 `/result`(세션 결과)는 참가자 전원의 잔액·바이인·정산 이체표를 그리는데,
 * 한동안 로그인만 확인하고 참가 여부는 보지 않았다. 방 코드는 31글자 6자리(약 29.7비트)이고 두
 * 경로에는 rate limit이 없어서, 코드를 훑어 남의 방을 읽는 비용이 사실상 네트워크 속도뿐이었다.
 *
 * 여기서 두 번째 계정이 `/rooms/[code]`를 **거치지 않는** 것이 이 스펙의 핵심이다 — 그 경로는
 * 들어가는 순간 참가자로 만들어 버리므로, 한 번이라도 들르면 이 검사는 아무것도 증명하지 못한다.
 */
test.describe('room access', () => {
  test('a non-member is refused the scoreboard and the result of a room they only know the code of', async ({
    browser,
  }) => {
    test.skip(!canRun, skipReason)
    test.setTimeout(90_000)

    const { host, guest, close } = await openTwoAccountPages(browser)

    try {
      const roomName = `E2E access ${Date.now().toString(36)}`
      await host.getByRole('textbox', { name: '방 이름' }).fill(roomName)
      await host.getByRole('button', { name: ko.newRoom.create, exact: true }).click()
      await expect(host).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/)
      const roomCode = new URL(host.url()).pathname.split('/').at(-1)
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)

      const denied = guest.getByRole('heading', { name: ko.errors.notMember })

      await guest.goto(`/rooms/${roomCode}/monitor`)
      await expect(denied).toBeVisible()
      // 전광판은 잔액을 그리는 화면이라 방 이름조차 나오면 안 된다.
      await expect(guest.getByRole('heading', { name: roomName })).toHaveCount(0)
      // 거부 표면은 막다른 길이 아니라 정식 경로(방으로 들어가 참가자가 되기)를 가리킨다.
      await expect(guest.getByRole('link', { name: ko.monitor.backToRoom })).toBeVisible()

      await guest.goto(`/rooms/${roomCode}/result`)
      await expect(denied).toBeVisible()
      await expect(guest.getByRole('heading', { name: ko.result.title })).toHaveCount(0)
      await expect(guest.getByRole('link', { name: ko.common.home })).toBeVisible()

      // 참가자가 되면 같은 두 화면이 열린다 — 막은 대상은 "코드만 아는 사람"이지 참가자가 아니다.
      await gotoRoom(guest, roomCode)
      await expect(guest.getByText('참가자 2명')).toBeVisible()

      await guest.goto(`/rooms/${roomCode}/monitor`)
      await expect(guest.getByRole('heading', { name: roomName })).toBeVisible()
      await expect(denied).toHaveCount(0)

      await guest.goto(`/rooms/${roomCode}/result`)
      await expect(guest.getByRole('heading', { name: ko.result.title })).toBeVisible()
      await expect(denied).toHaveCount(0)
    } finally {
      await close()
    }
  })
})
