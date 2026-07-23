import 'server-only'

import { createHmac, randomBytes } from 'node:crypto'
import { z } from 'zod'

const REGISTRATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const registrationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{10}$/)

/** 사람이 읽고 입력하기 쉬운 10자리 가입코드. 혼동 문자(0/O, 1/I)는 제외한다. */
export function generateRegistrationCode(): string {
  const bytes = randomBytes(10)
  return Array.from(
    bytes,
    (byte) => REGISTRATION_CODE_ALPHABET[byte % REGISTRATION_CODE_ALPHABET.length],
  ).join('')
}

/** 원문을 저장하지 않도록 AUTH_SECRET 기반 HMAC만 DB에 기록한다. */
export function registrationCodeHash(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('base64url')
}
