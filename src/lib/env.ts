import { z } from 'zod'

function optionalEnv<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  )
}

const baseServerSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_SESSION_URL: z.string().url(),
  DATABASE_POOLER_URL: optionalEnv(z.string().url()),
  DATABASE_TLS_MODE: z.enum(['disable', 'verify-system', 'verify-ca']),
  DATABASE_CA_CERT_BASE64: optionalEnv(z.string().min(1)),
  AUTH_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  ANTHROPIC_API_KEY: optionalEnv(z.string().min(1)),
  GEMINI_API_KEY: optionalEnv(z.string().min(1)),
})

const realtimeSchema = z.discriminatedUnion('REALTIME_MODE', [
  z.object({ REALTIME_MODE: z.literal('self') }),
  z.object({
    REALTIME_MODE: z.literal('supabase'),
    REALTIME_SUPABASE_URL: z.string().url(),
    REALTIME_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  }),
])

const serverSchema = baseServerSchema.and(realtimeSchema).superRefine((environment, context) => {
  if (environment.DATABASE_TLS_MODE === 'verify-ca' && !environment.DATABASE_CA_CERT_BASE64) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_CA_CERT_BASE64'],
      message: 'DATABASE_CA_CERT_BASE64 is required when DATABASE_TLS_MODE=verify-ca',
    })
  }
})

export type ServerEnv = z.infer<typeof serverSchema>

const BUILD_PHASE = 'phase-production-build'

export class EnvironmentConfigurationError extends Error {
  constructor(scope: 'server' | 'public' | 'runtime', keys: readonly string[]) {
    super(`Invalid ${scope} environment variables: ${keys.join(', ')}`)
    this.name = 'EnvironmentConfigurationError'
  }
}

function invalidKeys(result: z.SafeParseError<unknown>): readonly string[] {
  return result.error.issues.map((issue) => issue.path.join('.'))
}

function skipServerValidation(): boolean {
  if (process.env.SKIP_ENV_VALIDATION !== '1') return false
  if (process.env.NEXT_PHASE !== BUILD_PHASE) {
    throw new Error('SKIP_ENV_VALIDATION is build-only and must not be set at runtime')
  }
  return true
}

export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called on the client')
  }

  if (skipServerValidation()) {
    return process.env as unknown as ServerEnv
  }

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new EnvironmentConfigurationError('server', invalidKeys(parsed))
  }
  return parsed.data
}

export function assertRuntimeEnv(): void {
  if (skipServerValidation()) return

  const server = serverSchema.safeParse(process.env)
  const keys = server.success ? [] : invalidKeys(server)
  if (keys.length > 0) throw new EnvironmentConfigurationError('runtime', [...new Set(keys)])
}
