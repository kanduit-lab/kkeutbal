import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertRuntimeEnv, EnvironmentConfigurationError, serverEnv } from './env'

describe('serverEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not require the removed keep-alive secret', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
    vi.stubEnv('DATABASE_URL', 'postgresql://app:password@example.com:5432/postgres')
    vi.stubEnv('DATABASE_TLS_MODE', 'verify-system')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOL_MODE', 'session')
    vi.stubEnv('DATABASE_LISTENER_URL', '')
    vi.stubEnv('REALTIME_MODE', 'self')
    vi.stubEnv('REALTIME_PROVIDER_URL', '')
    vi.stubEnv('REALTIME_PROVIDER_PUBLISHABLE_KEY', '')
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
    vi.stubEnv('DATABASE_URL', 'postgresql://app:password@example.com:5432/postgres')
    vi.stubEnv('DATABASE_TLS_MODE', 'verify-ca')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOL_MODE', 'session')
    vi.stubEnv('DATABASE_LISTENER_URL', '')
    vi.stubEnv('REALTIME_MODE', 'self')
    vi.stubEnv('REALTIME_PROVIDER_URL', '')
    vi.stubEnv('REALTIME_PROVIDER_PUBLISHABLE_KEY', '')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret')

    expect(() => serverEnv()).toThrow('DATABASE_CA_CERT_BASE64')
  })

  it('requires a listener URL for self-hosted realtime on a transaction pool', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
    vi.stubEnv('DATABASE_URL', 'postgresql://app:password@example.com:6543/postgres')
    vi.stubEnv('DATABASE_TLS_MODE', 'disable')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOL_MODE', 'transaction')
    vi.stubEnv('DATABASE_LISTENER_URL', '')
    vi.stubEnv('REALTIME_MODE', 'self')
    vi.stubEnv('REALTIME_PROVIDER_URL', '')
    vi.stubEnv('REALTIME_PROVIDER_PUBLISHABLE_KEY', '')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret')

    expect(() => serverEnv()).toThrow('DATABASE_LISTENER_URL')
  })

  it('requires managed realtime credentials only in supabase realtime mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com')
    vi.stubEnv('DATABASE_URL', 'postgresql://app:password@example.com:5432/postgres')
    vi.stubEnv('DATABASE_TLS_MODE', 'disable')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOL_MODE', 'session')
    vi.stubEnv('DATABASE_LISTENER_URL', '')
    vi.stubEnv('REALTIME_MODE', 'supabase')
    vi.stubEnv('REALTIME_PROVIDER_URL', '')
    vi.stubEnv('REALTIME_PROVIDER_PUBLISHABLE_KEY', '')
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret')

    expect(() =>
      serverEnv(),
    ).toThrow('REALTIME_PROVIDER_URL, REALTIME_PROVIDER_PUBLISHABLE_KEY')
  })

  it('reports every missing runtime key before a request is served', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('DATABASE_TLS_MODE', '')
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '')
    vi.stubEnv('DATABASE_POOL_MODE', '')
    vi.stubEnv('DATABASE_LISTENER_URL', '')
    vi.stubEnv('REALTIME_MODE', '')
    vi.stubEnv('REALTIME_PROVIDER_URL', '')
    vi.stubEnv('REALTIME_PROVIDER_PUBLISHABLE_KEY', '')
    vi.stubEnv('AUTH_SECRET', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')

    expect(() => assertRuntimeEnv()).toThrow(EnvironmentConfigurationError)
    expect(() => assertRuntimeEnv()).toThrow(
      'DATABASE_URL, DATABASE_TLS_MODE, DATABASE_POOL_MODE, REALTIME_MODE, AUTH_SECRET, NEXT_PUBLIC_APP_URL',
    )
  })
})
