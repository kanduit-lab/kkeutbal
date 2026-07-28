import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../drizzle/schema'
import { serverEnv } from './env'

/**
 * 서버 전용 drizzle 클라이언트.
 *
 * 전용 앱 롤(kkeutbal_app, bypassrls)로 Supabase pooler 에 붙는다.
 * RLS 는 anon/authenticated 방어층으로 남고, 권한 검사는 Server Action 이 담당한다.
 *
 * dev HMR 마다 커넥션이 새로 생기지 않도록 globalThis 에 캐시한다.
 */

const globalForDb = globalThis as unknown as {
  kkeutbalSql?: ReturnType<typeof postgres>
}

/** Supabase pooler transaction mode 포트. session mode 는 5432. */
const TRANSACTION_MODE_PORT = '6543'

/**
 * pooler 모드에 맞는 커넥션 옵션.
 *
 * 모드는 DATABASE_URL 의 포트로 갈린다 — 둘은 요구사항이 정반대라 코드가 알아서 맞춰야 한다.
 * 포트만 바꾸고 이 설정을 안 바꾸면 런타임에서만 깨지기 때문에 env 하나로 결정되게 묶어 둔다.
 *
 * - 5432 session mode: 커넥션을 세션 내내 붙들 수 있다. 컨테이너 배포(전용 서버)용.
 *   prepared statement 를 그대로 쓸 수 있다.
 * - 6543 transaction mode: 문장/트랜잭션 단위로 커넥션을 빌려준다.
 *   **prepared statement 를 쓸 수 없다** — postgres-js 의 prepare 를 꺼야 한다.
 *
 * 두 모드 모두 풀은 여러 개다. transaction mode 를 1로 좁혔던 적이 있는데, 그러면 커넥션
 * 하나가 막히는 순간 앱의 모든 DB 작업이 그 뒤에 큐잉된다 — postgres-js 에는 쿼리 타임아웃이
 * 없어서 큐가 영영 안 풀린다. 2026-07-27 에 이 경로로 전 페이지가 죽었다. 풀을 넓혀도
 * 근본 회수는 supabase/migrations/0017 의 롤 타임아웃이 하고, 여기서는 단일 실패점만 없앤다.
 *
 * 방 단위 직렬화에 쓰는 `pg_advisory_xact_lock` 은 트랜잭션 스코프라 두 모드 모두에서 동작한다
 * (세션 스코프 락이었다면 transaction mode 에서 조용히 깨졌을 것이다).
 */
function poolerOptions(databaseUrl: string): { max: number; prepare?: boolean } {
  let port = ''
  try {
    port = new URL(databaseUrl).port
  } catch {
    // 파싱 실패는 session mode 기본값으로 둔다 — 접속 자체는 postgres-js 가 다시 검증한다.
  }
  return port === TRANSACTION_MODE_PORT ? { max: 5, prepare: false } : { max: 5 }
}

/**
 * `ssl: 'require'`는 postgres-js에서 인증서 검증을 끈다. Supabase가 제공하는 프로젝트 CA로
 * 체인을 검증하고, tls.connect 기본 동작으로 pooler 호스트명까지 검증한다.
 */
function verifiedTls(caBase64: string): { ca: string; rejectUnauthorized: true } {
  const ca = Buffer.from(caBase64, 'base64').toString('utf8')
  if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
    throw new Error('DATABASE_CA_CERT_BASE64 must contain a base64-encoded PEM certificate')
  }
  return { ca, rejectUnauthorized: true }
}

function createSql() {
  const env = serverEnv()
  const url = env.DATABASE_URL
  return postgres(url, {
    ...poolerOptions(url),
    idle_timeout: 30,
    connect_timeout: 10,
    // 유휴가 아니라 수명으로도 커넥션을 재활용한다. pooler·NAT 가 조용히 끊어 반쪽만 열린
    // 소켓이 남으면 idle_timeout 은 그 커넥션을 유휴로 보지 않아 영영 안 닫는다.
    max_lifetime: 30 * 60,
    ssl: verifiedTls(env.DATABASE_CA_CERT_BASE64),
  })
}

type Db = ReturnType<typeof drizzle<typeof schema>>

let cachedDb: Db | undefined

function getDb(): Db {
  if (!cachedDb) {
    const sql = globalForDb.kkeutbalSql ?? createSql()
    if (process.env.NODE_ENV !== 'production') globalForDb.kkeutbalSql = sql
    cachedDb = drizzle(sql, { schema })
  }
  return cachedDb
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const instance = getDb()
    const value = Reflect.get(instance, prop)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

export { schema }
