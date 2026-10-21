import { z } from 'zod'

function optionalEnv<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  )
}

type RealtimeEnv = {
  REALTIME_MODE: 'self' | 'supabase'
  SUPABASE_URL?: string
  SUPABASE_PUBLISHABLE_KEY?: string
}

function validateSupabaseConfiguration(environment: RealtimeEnv, context: z.RefinementCtx): void {
  if (environment.REALTIME_MODE !== 'supabase') return

  if (!environment.SUPABASE_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SUPABASE_URL'],
      message: 'SUPABASE_URL is required when REALTIME_MODE=supabase',
    })
  }

  if (!environment.SUPABASE_PUBLISHABLE_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SUPABASE_PUBLISHABLE_KEY'],
      message: 'SUPABASE_PUBLISHABLE_KEY is required when REALTIME_MODE=supabase',
    })
  }
}

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  DATABASE_TLS_MODE: z.enum(['disable', 'verify-system', 'verify-ca']),
  DATABASE_CA_CERT_BASE64: optionalEnv(z.string().min(1)),
  DATABASE_POOL_MODE: z.enum(['session', 'transaction']),
  DATABASE_LISTENER_URL: optionalEnv(z.string().url()),
  REALTIME_MODE: z.enum(['self', 'supabase']),
  SUPABASE_URL: optionalEnv(z.string().url()),
  SUPABASE_PUBLISHABLE_KEY: optionalEnv(z.string().min(1)),
  AUTH_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  ANTHROPIC_API_KEY: optionalEnv(z.string().min(1)),
  GEMINI_API_KEY: optionalEnv(z.string().min(1)),
}).superRefine((environment, context) => {
  if (environment.DATABASE_TLS_MODE === 'verify-ca' && !environment.DATABASE_CA_CERT_BASE64) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_CA_CERT_BASE64'],
      message: 'DATABASE_CA_CERT_BASE64 is required when DATABASE_TLS_MODE=verify-ca',
    })
  }

  if (
    environment.REALTIME_MODE === 'self' &&
    environment.DATABASE_POOL_MODE === 'transaction' &&
    !environment.DATABASE_LISTENER_URL
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_LISTENER_URL'],
      message: 'DATABASE_LISTENER_URL is required when REALTIME_MODE=self and DATABASE_POOL_MODE=transaction',
    })
  }

  validateSupabaseConfiguration(environment, context)
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
