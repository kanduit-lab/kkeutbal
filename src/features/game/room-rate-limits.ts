import { consumeRateLimits, type RateLimitResult } from '@/lib/rate-limit'

/**
 * `createRoom`/`joinRoom` 전용 rate limit 배선. scope 이름·limit·windowMs는 원래 actions.ts에
 * 있던 값 그대로다 — 바꾸면 서버에 이미 쌓인 `rate_limit_buckets` 버킷과 스코프가 어긋난다.
 */

export async function checkCreateRoomRateLimit(userId: string): Promise<RateLimitResult> {
  // 정상 사용 최악 케이스: 방 설정을 잘못 골라 지우고 다시 만드는 실험적 재생성이
  // 분당 몇 번, 모임 한 번(MT 저녁 내내 게임 종류를 몇 차례 바꿔가며 방을 새로 파는 것)에
  // 시간당 20개 안팎이다. 둘 다 그보다 넉넉하게 잡는다.
  return consumeRateLimits([
    {
      scope: 'game.create_room.user.minute',
      identifier: userId,
      limit: 5,
      windowMs: 60 * 1000,
    },
    {
      scope: 'game.create_room.user.hour',
      identifier: userId,
      limit: 20,
      windowMs: 60 * 60 * 1000,
    },
  ])
}

export async function checkJoinRoomRateLimit(userId: string): Promise<RateLimitResult> {
  // 정상 사용 최악 케이스: 코드를 여러 번 오타내거나(분당 재시도) 저녁 내내 여러 방을
  // 옮겨 다니는 것(시간당). 둘 다 그보다 넉넉하게 잡는다. 이미 참가 중인 방 재입장은
  // 새 행을 만들지 않아 남용 비용이 낮지만, 무의미한 코드 대입 시도 자체를 조인다.
  return consumeRateLimits([
    {
      scope: 'game.join_room.user.minute',
      identifier: userId,
      limit: 10,
      windowMs: 60 * 1000,
    },
    {
      scope: 'game.join_room.user.hour',
      identifier: userId,
      limit: 60,
      windowMs: 60 * 60 * 1000,
    },
  ])
}
