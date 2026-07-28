/**
 * 순수 Promise 헬퍼라 'server-only' 를 달지 않는다 — 서버 값에 손대지 않고, 단위 테스트가
 * Next 런타임 없이 직접 부를 수 있어야 한다.
 */

/**
 * 공개 화면이 기다려 줄 수 있는 상한.
 *
 * 로그인·소개·가이드 화면은 DB 없이도 렌더돼야 한다. 이 상한을 넘긴 조회는 실패로 보고
 * 폴백 값으로 떨어뜨린다 — 배너 하나 때문에 페이지 전체가 응답을 못 하면 안 된다.
 */
export const PUBLIC_READ_TIMEOUT_MS = 2_000

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

/**
 * `promise` 가 `ms` 안에 끝나지 않으면 `TimeoutError` 로 거절한다.
 *
 * 원래 작업을 취소하지는 못한다 — postgres-js 에는 쿼리 타임아웃이 없고 커넥션은 서버가
 * 회수한다(supabase/migrations/0017). 여기서 끊는 건 **호출자의 대기**다. 그것만으로도
 * 멈춘 DB 가 페이지 렌더를 잡아먹는 경로는 사라진다.
 *
 * throw 가 아니라 hang 을 막는 장치라는 점이 핵심이다. try/catch 는 hang 을 못 잡는다.
 */
export async function withTimeout<T>(
  // drizzle 쿼리 빌더는 Promise 가 아니라 thenable 이다. 실행은 await 시점에 시작되므로
  // race 에 그대로 넘겨도 된다 — 대신 시그니처를 PromiseLike 로 열어 둔다.
  promise: PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
