/**
 * 전화번호 표시·입력 포맷터 — 저장은 숫자만(01012345678), 화면은 하이픈(010-1234-5678).
 * 타이핑 중에도 자연스럽게 끊기도록 자릿수에 따라 점진적으로 하이픈을 넣는다.
 *
 * 규칙(국내 휴대폰 기준):
 * - 11자리: 010-1234-5678 (3-4-4)
 * - 10자리: 011-123-4567 (3-3-4)
 * - 그보다 짧으면 입력 중으로 보고 앞부분만 끊는다
 *
 * 숫자가 아닌 문자는 버리고 11자리까지만 반영한다 — 서버는 제출 시 다시 숫자만 남긴다.
 */
export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}
