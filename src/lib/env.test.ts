import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertRuntimeEnv, EnvironmentConfigurationError, serverEnv } from './env'

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

  it('reports every missing runtime key before a request is served', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('AUTH_SECRET', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')

    expect(() => assertRuntimeEnv()).toThrow(EnvironmentConfigurationError)
    expect(() => assertRuntimeEnv()).toThrow(
      'DATABASE_URL, DATABASE_CA_CERT_BASE64, AUTH_SECRET, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    )
  })
})
