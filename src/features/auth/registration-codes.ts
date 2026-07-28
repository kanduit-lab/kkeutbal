import 'server-only'

import { createHmac, randomBytes } from 'node:crypto'
import { z } from 'zod'

const REGISTRATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const registrationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{10}$/)

export function generateRegistrationCode(): string {
  const bytes = randomBytes(10)
  return Array.from(
    bytes,
    (byte) => REGISTRATION_CODE_ALPHABET[byte % REGISTRATION_CODE_ALPHABET.length],
  ).join('')
}

export function registrationCodeHash(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code).digest('base64url')
}