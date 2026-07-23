/**
 * 사전 템플릿 치환 — '{seq}판 시작' 같은 문자열의 {자리표시자}를 값으로 바꾼다.
 * React·next 의존이 없어 서버·클라이언트 어디서나 import 할 수 있다.
 * 매칭되지 않는 자리표시자는 원문 그대로 남긴다 — 누락 파라미터를 조용히 숨기지 않는다.
 *
 * 예: format(d.room.toastRoundStarted, { seq: 3 }) → '3판 시작'
 */
export function format(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  )
}
