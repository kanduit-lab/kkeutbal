/**
 * Server Action 공통 반환 형태.
 * throw 는 프레임워크 경계에서 삼켜지므로, 예상 가능한 실패는 값으로 돌려준다.
 */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data }
}

export function fail<T = never>(error: string): ActionResult<T> {
  return { success: false, error }
}
