/**
 * 6자 방 입장 코드. 혼동 문자(0/O, 1/I/L)를 뺀 대문자·숫자만 쓴다.
 * 유일성은 rooms.code UNIQUE 가 보장하고, 충돌 시 호출부가 재시도한다.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateRoomCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase()
}
