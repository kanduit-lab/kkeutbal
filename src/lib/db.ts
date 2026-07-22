import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../drizzle/schema'
import { serverEnv } from './env'

/**
 * 서버 전용 drizzle 클라이언트.
 *
 * 전용 앱 롤(kkeutbal_app, bypassrls)로 Supabase pooler(session mode)에 붙는다.
 * RLS 는 anon/authenticated 방어층으로 남고, 권한 검사는 Server Action 이 담당한다.
 *
 * dev HMR 마다 커넥션이 새로 생기지 않도록 globalThis 에 캐시한다.
 */

const globalForDb = globalThis as unknown as {
  kkeutbalSql?: ReturnType<typeof postgres>
}

function createSql() {
  return postgres(serverEnv().DATABASE_URL, {
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    ssl: 'require',
  })
}

const sql = globalForDb.kkeutbalSql ?? createSql()
if (process.env.NODE_ENV !== 'production') globalForDb.kkeutbalSql = sql

export const db = drizzle(sql, { schema })
export { schema }
