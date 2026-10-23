import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertRuntimeEnv, EnvironmentConfigurationError, serverEnv } from './env'

describe('serverEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not require the removed keep-alive secret', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
    vi.stubEnv('DATABASE_SESSION_URL', 'postgresql://app:password@example.com:5432/postgres')
    vi.stubEnv('DATABASE_TLS_MODE', 'verify-system')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOLER_URL', '')
    vi.stubEnv('REALTIME_MODE', 'self')
    vi.stubEnv('REALTIME_SUPABASE_URL', '')
    vi.stubEnv('REALTIME_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('KEEP_ALIVE_SECRET', '')

    const env = serverEnv()

    expect(env).not.toHaveProperty('KEEP_ALIVE_SECRET')
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.GEMINI_API_KEY).toBeUndefined()
  })

  it('requires a CA only for verify-ca TLS', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
    vi.stubEnv('DATABASE_SESSION_URL', 'postgresql://app:password@example.com:5432/postgres')
    vi.stubEnv('DATABASE_TLS_MODE', 'verify-ca')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOLER_URL', '')
    vi.stubEnv('REALTIME_MODE', 'self')
    vi.stubEnv('REALTIME_SUPABASE_URL', '')
    vi.stubEnv('REALTIME_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret')

    expect(() => serverEnv()).toThrow('DATABASE_CA_CERT_BASE64')
  })

  it('requires managed realtime credentials only in supabase realtime mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
    vi.stubEnv('DATABASE_SESSION_URL', 'postgresql://app:password@example.com:5432/postgres')
    vi.stubEnv('DATABASE_TLS_MODE', 'disable')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOLER_URL', '')
    vi.stubEnv('REALTIME_MODE', 'supabase')
    vi.stubEnv('REALTIME_SUPABASE_URL', '')
    vi.stubEnv('REALTIME_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret')

    expect(() =>
      serverEnv(),
    ).toThrow('REALTIME_SUPABASE_URL, REALTIME_SUPABASE_PUBLISHABLE_KEY')
  })

  it('never reads supabase keys in self realtime mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
    vi.stubEnv('DATABASE_SESSION_URL', 'postgresql://app:password@example.com:5432/postgres')
    vi.stubEnv('DATABASE_TLS_MODE', 'disable')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOLER_URL', '')
    vi.stubEnv('REALTIME_MODE', 'self')
    vi.stubEnv('REALTIME_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('REALTIME_SUPABASE_PUBLISHABLE_KEY', 'unused-key')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret')

    const env = serverEnv()

    expect(env).not.toHaveProperty('REALTIME_SUPABASE_URL')
    expect(env).not.toHaveProperty('REALTIME_SUPABASE_PUBLISHABLE_KEY')
  })

  it('reports every missing runtime key before a request is served', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DATABASE_SESSION_URL', '')
    vi.stubEnv('DATABASE_TLS_MODE', '')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOLER_URL', '')
    vi.stubEnv('REALTIME_MODE', '')
    vi.stubEnv('REALTIME_SUPABASE_URL', '')
    vi.stubEnv('REALTIME_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('AUTH_SECRET', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')

    expect(() => assertRuntimeEnv()).toThrow(EnvironmentConfigurationError)
    expect(() => assertRuntimeEnv()).toThrow(
      'DATABASE_SESSION_URL, DATABASE_TLS_MODE, AUTH_SECRET, NEXT_PUBLIC_APP_URL, REALTIME_MODE',
    )
  })
})
