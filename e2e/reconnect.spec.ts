import { expect, test } from '@playwright/test'
import { expectNoDocumentScroll, getLifecycleFixture, openTwoAccountPages } from './support'
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

      await guest.goto(`/rooms/${roomCode}`)
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

      // 끊김 배너(`RoomConnectionBar`)는 여기서 단정하지 않는다. 이 시나리오는 "한 번도 붙은 적
      // 없는" 경우라 배너 조건이 `connectTimedOut` 하나뿐인데, 그 10초 타이머는 재구독 시도마다
      // effect가 다시 걸리면서 초기화된다. 백오프 초반 간격이 1·2·5초라 타이머가 만료되기 전에
      // 계속 리셋되고, 배너는 간격이 10초를 넘는 4~5번째 시도쯤에야 뜬다. 시간에 의존하는 단정을
      // 넣으면 흔들리는 스펙이 되므로 뺐다 — 대신 그 지연 자체를 사용자에게 보고했다.
    } finally {
      await close()
    }
  })
})
