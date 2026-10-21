import { z } from 'zod'

function optionalEnv<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  )
}

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  DATABASE_CA_CERT_BASE64: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  ANTHROPIC_API_KEY: optionalEnv(z.string().min(1)),
  GEMINI_API_KEY: optionalEnv(z.string().min(1)),
})

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

export type ServerEnv = z.infer<typeof serverSchema>
export type ClientEnv = z.infer<typeof clientSchema>

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

export function clientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
  if (!parsed.success) {
    throw new EnvironmentConfigurationError('public', invalidKeys(parsed))
  }
  return parsed.data
}

export function assertRuntimeEnv(): void {
  if (skipServerValidation()) return

  const server = serverSchema.safeParse(process.env)
  const client = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
  const keys = [
    ...(server.success ? [] : invalidKeys(server)),
    ...(client.success ? [] : invalidKeys(client)),
  ]
  if (keys.length > 0) throw new EnvironmentConfigurationError('runtime', [...new Set(keys)])
}
