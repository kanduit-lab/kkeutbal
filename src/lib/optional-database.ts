import 'server-only'

type DatabaseModule = Awaited<typeof import('./db')>

let databaseModule: Promise<DatabaseModule> | undefined
let reportedUnavailable = false

/**
 * 공개 화면의 선택 기능용 DB 모듈.
 *
 * 공지·SSO 노출 여부·첫 계정 안내는 DB 장애가 로그인 화면 자체를 막으면 안 된다. 실패한
 * 동적 import를 프로세스 동안 재사용해 요청마다 TLS/환경 오류를 반복 기록하지 않는다.
 * 쓰기·권한 검사 경로는 이 함수를 쓰지 않고 일반 DB import 실패를 그대로 실패로 다룬다.
 */
export async function getOptionalDatabase(): Promise<DatabaseModule | null> {
  try {
    return await (databaseModule ??= import('./db'))
  } catch (error) {
    if (!reportedUnavailable) {
      reportedUnavailable = true
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Optional database unavailable; public fallback is active: ${message}`)
    }
    return null
  }
}
