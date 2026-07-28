import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { serverEnv } from '@/lib/env'
import { getOptionalDatabase } from '@/lib/optional-database'
import { PUBLIC_READ_TIMEOUT_MS, withTimeout } from '@/lib/with-timeout'

const SETTINGS_ID = 'default'
const CIPHER_VERSION = 'v1'

export interface SsoSettingsView {
  readonly enabled: boolean
  readonly issuer: string
  readonly clientId: string
  readonly hasClientSecret: boolean
}

export interface ActiveSsoSettings {
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
}

function encryptionKey(): Buffer {
  return createHash('sha256').update(serverEnv().AUTH_SECRET).digest()
}

export function encryptSsoClientSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [
    CIPHER_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptSsoClientSecret(value: string): string {
  const [version, ivRaw, tagRaw, ciphertextRaw, ...rest] = value.split('.')
  if (version !== CIPHER_VERSION || !ivRaw || !tagRaw || !ciphertextRaw || rest.length > 0) {
    throw new Error('Invalid SSO secret ciphertext')
  }
  const iv = Buffer.from(ivRaw, 'base64url')
  const tag = Buffer.from(tagRaw, 'base64url')
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid SSO secret ciphertext')

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

const SSO_DISABLED: SsoSettingsView = Object.freeze({
  enabled: false,
  issuer: '',
  clientId: '',
  hasClientSecret: false,
})

export async function getSsoSettings(): Promise<SsoSettingsView> {
  try {
    const database = await getOptionalDatabase()
    if (!database) return SSO_DISABLED
    const { db, schema } = database
    const [settings] = await withTimeout(
      db
        .select({
          enabled: schema.authSettings.ssoEnabled,
          issuer: schema.authSettings.ssoIssuer,
          clientId: schema.authSettings.ssoClientId,
          clientSecretCiphertext: schema.authSettings.ssoClientSecretCiphertext,
        })
        .from(schema.authSettings)
        .where(eq(schema.authSettings.id, SETTINGS_ID))
        .limit(1),
      PUBLIC_READ_TIMEOUT_MS,
      'getSsoSettings',
    )

    return {
      enabled: settings?.enabled ?? false,
      issuer: settings?.issuer ?? '',
      clientId: settings?.clientId ?? '',
      hasClientSecret: Boolean(settings?.clientSecretCiphertext),
    }
  } catch (error) {
    console.error('getSsoSettings failed:', error)
    return SSO_DISABLED
  }
}

export async function getActiveSsoSettings(): Promise<ActiveSsoSettings | null> {
  const settings = await getSsoSettings()
  if (!settings.enabled || !settings.issuer || !settings.clientId) return null

  try {
    const database = await getOptionalDatabase()
    if (!database) return null
    const { db, schema } = database
    const [row] = await withTimeout(
      db
        .select({ clientSecretCiphertext: schema.authSettings.ssoClientSecretCiphertext })
        .from(schema.authSettings)
        .where(eq(schema.authSettings.id, SETTINGS_ID))
        .limit(1),
      PUBLIC_READ_TIMEOUT_MS,
      'getActiveSsoSettings',
    )
    if (!row?.clientSecretCiphertext) return null

    return {
      issuer: settings.issuer,
      clientId: settings.clientId,
      clientSecret: decryptSsoClientSecret(row.clientSecretCiphertext),
    }
  } catch (error) {
    console.error('getActiveSsoSettings failed:', error)
    return null
  }
}

export { SETTINGS_ID }