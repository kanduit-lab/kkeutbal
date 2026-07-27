import { z } from 'zod'

/**
 * 환경변수 단일 검증 지점.
 *
 * 서버 전용 값과 클라이언트 노출 값을 스키마로 분리한다.
 * `NEXT_PUBLIC_` 접두사가 없는 값은 클라이언트 번들에 들어가면 안 된다.
 */

/** `.env`의 빈 선택값은 미설정으로 취급한다. */
function optionalEnv<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  )
}

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** 전용 앱 롤(bypassrls) 접속 문자열. 모든 DB 접근은 서버에서 drizzle 로만 한다. */
  DATABASE_URL: z.string().url(),
  /** Supabase 대시보드에서 받은 CA 인증서의 base64 인코딩. */
  DATABASE_CA_CERT_BASE64: z.string().min(1),

  AUTH_SECRET: z.string().min(1),
  /** Vision 공급자 API 키. 실제 선택·활성화는 관리자 콘솔에서 관리한다. */
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

/**
 * 서버 환경변수. 서버 컨텍스트에서만 호출한다.
 * 클라이언트 컴포넌트에서 import 하면 빌드 시점에 드러나도록 명시적으로 던진다.
 *
 * `SKIP_ENV_VALIDATION` 은 **빌드 전용** 탈출구다. `next build` 의 page data 수집이
 * 모듈 평가를 유발해 이 함수를 빌드 시점에 실행시키는데, 그때까지 검증을 강제하면
 * `DATABASE_URL`·`AUTH_SECRET` 같은 런타임 전용 시크릿을 빌드 인자로 넘겨야 하고
 * 그 값은 이미지 레이어에 남는다. 빌드는 스키마를 통과할 필요가 없으므로 건너뛴다.
 *
 * 런타임에는 절대 켜지 말 것 — 값이 비어 있어도 조용히 통과한다.
 * `dockerfiles/Dockerfile.nextjs` 는 builder 스테이지에서만 이 값을 세우고,
 * runner 스테이지는 새 이미지라 이어받지 않는다.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called on the client')
  }

  if (process.env.SKIP_ENV_VALIDATION) {
    return process.env as unknown as ServerEnv
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
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid public environment variables: ${missing}`)
  }
  return parsed.data
}
