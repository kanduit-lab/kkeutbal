import { z } from 'zod'

/**
 * 환경변수 단일 검증 지점.
 *
 * 서버 전용 값과 클라이언트 노출 값을 스키마로 분리한다.
 * `NEXT_PUBLIC_` 접두사가 없는 값은 클라이언트 번들에 들어가면 안 된다.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** 전용 앱 롤(bypassrls) 접속 문자열. 모든 DB 접근은 서버에서 drizzle 로만 한다. */
  DATABASE_URL: z.string().url(),

  AUTH_SECRET: z.string().min(1),
  /**
   * 개발용 게스트 로그인(이름만 입력). Authentik 미등록 환경 전용.
   * 프로덕션에서 켜면 인증이 무력화되므로 절대 true 로 배포하지 않는다.
   */
  AUTH_DEV_LOGIN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  AUTH_AUTHENTIK_ID: z.string().min(1).optional(),
  AUTH_AUTHENTIK_SECRET: z.string().min(1).optional(),
  AUTH_AUTHENTIK_ISSUER: z.string().url().optional(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  JOKBO_VISION_MODEL: z.string().default('claude-sonnet-5'),
  JOKBO_VISION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

export type ServerEnv = z.infer<typeof serverSchema>
export type ClientEnv = z.infer<typeof clientSchema>

/**
 * 서버 환경변수. 서버 컨텍스트에서만 호출한다.
 * 클라이언트 컴포넌트에서 import 하면 빌드 시점에 드러나도록 명시적으로 던진다.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called on the client')
  }

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid server environment variables: ${missing}`)
  }
  return parsed.data
}

/** 클라이언트 노출 환경변수. Next.js 인라인 치환을 위해 키를 리터럴로 적는다. */
export function clientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid public environment variables: ${missing}`)
  }
  return parsed.data
}
