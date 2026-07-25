import { afterEach, describe, expect, it, vi } from 'vitest'
import { serverEnv } from './env'

describe('serverEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not require the removed keep-alive secret', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgresql://app:password@example.com:5432/postgres')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', 'Y2E=')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('KEEP_ALIVE_SECRET', '')

    const env = serverEnv()

    expect(env).not.toHaveProperty('KEEP_ALIVE_SECRET')
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.GEMINI_API_KEY).toBeUndefined()
  })
})
