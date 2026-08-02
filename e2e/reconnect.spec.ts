import { expect, test } from './fixtures'
import {
  expectNoDocumentScroll,
  getLifecycleFixture,
  gotoRoom,
  openTwoAccountPages,
} from './support'
// 문구는 사전에서 읽는다 — authenticated-room.spec.ts와 같은 이유다. {n} 치환이 들어간
// 템플릿(참가자 수)은 `format`으로 직접 값을 채워 비교한다.
import { ko } from '../src/lib/i18n/dictionaries/ko'
import { format } from '../src/lib/i18n/format'

const { canRun, skipReason } = getLifecycleFixture()

/**
 * realtime-js가 여는 소켓 경로. 호스트(`NEXT_PUBLIC_SUPABASE_URL`)는 환경마다 다르지만
 * `/realtime/v1/websocket` 경로는 라이브러리가 고정으로 쓰므로, 그 부분만 매칭해 실제 프로젝트
 * URL에 의존하지 않는다. 모든 소켓을 잡는 패턴은 쓰지 않는다 — Next dev의 HMR 소켓까지 끊긴다.
 */
const REALTIME_SOCKET_PATTERN = /\/realtime\/v1\/websocket/

/**
 * 실시간 재연결·복구 경로 검증.
 *
 * 이 앱의 핵심 불변식(`docs/03-realtime-protocol.md`)은 "진실은 Broadcast가 아니라 스냅샷
 * refetch(`refreshRoom`)에서 온다"는 것이다. Broadcast는 힌트일 뿐이라 배달이 아예 안 돼도 화면은
 * 결국 맞아야 한다. 호스트의 realtime 소켓만 끊어 두 가지를 함께 증명한다:
 *   1) 소켓이 죽은 동안 호스트는 게스트 입장을 Broadcast로 받지 못해 낡은 상태 그대로다
 *   2) `online` 이벤트가 뜨면 `use-room-sync.ts`의 `onOnline`이 연결 상태와 무관하게 `refetch()`를
 *      불러 스냅샷 재조회로 따라잡는다
 *
 * 소켓을 끊는 방법: `routeWebSocket`은 **호출 이후에 새로 생기는** 연결만 가로챈다. 이미 붙어
 * 있는 소켓을 나중에 빼앗을 수는 없다. Supabase 클라이언트는 모듈 싱글턴이라 `/rooms/new`에서
 * 붙은 소켓이 클라이언트 사이드 내비게이션으로 방에 들어가도 그대로 재사용된다 — 그래서 라우트만
 * 걸고 넘어가면 **실제로는 아무것도 끊기지 않는다**(이 스펙이 처음 그렇게 조용히 통과했다).
 * 리로드로 새 연결을 만들어 라우트를 태운다.
 */
test.describe('realtime reconnect and recovery', () => {
  test('host converges via snapshot refetch, not broadcast, after its realtime socket is cut', async ({
    browser,
  }) => {
    test.skip(!canRun, skipReason)
    test.setTimeout(90_000)

    const { host, guest, close } = await openTwoAccountPages(browser)
    // 라우트가 실제로 발동했다는 증거. realtime-js가 여러 번 재시도할 수 있어 개수는 보지 않는다.
    const cutSocketUrls: string[] = []

    try {
      await host.context().routeWebSocket(REALTIME_SOCKET_PATTERN, async (ws) => {
        cutSocketUrls.push(ws.url())
        // code를 주지 않는다 — 증명하려는 건 "연결이 열리지 않는다"이고 특정 종료 코드가 아니다.
        await ws.close({ reason: 'e2e-cut-host-socket' })
      })
      // 위 주석 참고: 이 리로드가 있어야 새 소켓이 라우트를 탄다.
      await host.reload()
      await expect(host).toHaveURL(/\/rooms\/new$/)

      const roomName = `E2E reconnect ${Date.now().toString(36)}`
      await host.getByRole('textbox', { name: ko.roomForm.nameLabel }).fill(roomName)
      await host.getByRole('button', { name: ko.newRoom.create, exact: true }).click()
      await expect(host).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/)
      const roomCode = new URL(host.url()).pathname.split('/').at(-1)
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)
      // 소켓이 죽어도 화면 자체는 규약을 지켜야 한다.
      await expectNoDocumentScroll(host)

      const oneMember = format(ko.lobby.membersCount, { n: 1 })
      const twoMembers = format(ko.lobby.membersCount, { n: 2 })
      await expect(host.getByText(oneMember)).toBeVisible()
      // 방 채널 연결 시도가 우리 라우트를 거쳐 끊겼다는 확인. 여기서 먼저 확인해 두면 뒤의
      // 부재 증명이 "정말 소켓이 없는 상태"였음을 보장한다.
      expect(cutSocketUrls.length, 'realtime 소켓이 라우트를 거쳐 끊겨야 한다').toBeGreaterThan(0)

      await gotoRoom(guest, roomCode)
      await expect(guest.getByText(twoMembers)).toBeVisible()

      // 부재 증명: 호스트는 이 변화를 Broadcast로 받을 길이 없다. bare `not.toBeVisible()`은 대상이
      // 아직 안 그려졌을 뿐이어도 즉시 통과해 아무것도 증명하지 못하므로, "1명"이 여전히 보인다는
      // 양성 단정을 쓴다. 창은 `use-room-sync.ts`의 20초 폴링보다 한참 짧게 잡아 폴링이 끼어들어
      // 이 증명을 무의미하게 만들 여지를 없앤다.
      await expect(host.getByText(oneMember)).toBeVisible({ timeout: 4_000 })

      // 복구 트리거: `onOnline`은 연결 상태와 무관하게 `refetch()`를 부른다. `refreshRoom`은
      // Server Action(HTTP) 왕복이라 소켓이 죽어 있어도 영향받지 않는다.
      await host.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(host.getByText(twoMembers)).toBeVisible({ timeout: 15_000 })

      // 스냅샷으로 따라잡았더라도 **소켓은 여전히 죽어 있다.** 그러면 앱은 그 사실을 사용자에게
      // 알려야 한다 — 조용히 맞는 화면을 보여주면 다음 변화를 놓치는 걸 아무도 모른다.
      // 배너 조건인 연결 타임아웃(`CONNECT_TIMEOUT_MS`, 10초)은 방에 들어온 시점 기준으로 한 번만
      // 돌기 때문에 시점이 예측 가능하다. 재구독 시도마다 초기화되던 때는 20~40초로 밀렸고, 그게
      // 이 단정을 처음에 못 넣은 이유였다.
      await expect(host.getByText(ko.room.disconnectedTitle)).toBeVisible({ timeout: 20_000 })
      await expect(host.getByRole('button', { name: ko.room.reconnect })).toBeVisible()
    } finally {
      await close()
    }
  })
})
