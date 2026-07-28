export type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data }
}

export function fail<T = never>(error: string): ActionResult<T> {
  return { success: false, error }
}