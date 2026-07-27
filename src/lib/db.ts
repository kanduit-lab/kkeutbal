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
 *   prepared statement 를 그대로 쓸 수 있어 풀을 넉넉히 잡는다.
 * - 6543 transaction mode: 문장/트랜잭션 단위로 커넥션을 빌려준다. 서버리스(람다)용.
 *   **prepared statement 를 쓸 수 없다** — postgres-js 의 prepare 를 꺼야 한다.
 *   인스턴스가 수평으로 늘어나므로 인스턴스당 풀은 1로 좁힌다.
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
  return port === TRANSACTION_MODE_PORT ? { max: 1, prepare: false } : { max: 5 }
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

/**
 * 커넥션은 **첫 사용 시점에** 만든다.
 *
 * 최상위에서 `createSql()` 을 부르면 이 모듈을 import 하는 것만으로 커넥션이 생긴다.
 * `next build` 의 page data 수집은 라우트 모듈을 평가하므로, 그 방식이면 빌드가
 * `DATABASE_URL`·`DATABASE_CA_CERT_BASE64` 를 요구하게 되고 시크릿을 빌드 인자로
 * 넘길 수밖에 없다 — 그 값은 이미지 레이어에 남는다. 지연 생성이면 빌드는 모듈
 * 평가만 하고 지나가고, 실제 커넥션은 런타임 첫 쿼리에서 만들어진다.
 *
 * 호출부는 그대로 `db.select()` 처럼 쓴다. 메서드는 실제 인스턴스에 바인딩해서
 * 넘기므로 drizzle 내부의 `this` 참조가 깨지지 않는다.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    // receiver 를 넘기지 않는다 — 넘기면 접근자 프로퍼티의 `this` 가 이 Proxy 가 되어
    // 트랩을 다시 타고, 그 안에서 또 프로퍼티를 읽으면 재귀한다.
    const instance = getDb()
    const value = Reflect.get(instance, prop)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

export { schema }
