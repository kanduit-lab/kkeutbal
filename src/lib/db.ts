import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../database/schema'
import { serverEnv } from './env'

const globalForDb = globalThis as unknown as {
  kkeutbalSql?: ReturnType<typeof postgres>
}

function verifiedTls(caBase64: string): { ca: string; rejectUnauthorized: true } {
  const ca = Buffer.from(caBase64, 'base64').toString('utf8')
  if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
    throw new Error('DATABASE_CA_CERT_BASE64 must contain a base64-encoded PEM certificate')
  }
  return { ca, rejectUnauthorized: true }
}

function databaseTlsOptions(env: ReturnType<typeof serverEnv>) {
  if (env.DATABASE_TLS_MODE === 'disable') return false
  if (env.DATABASE_TLS_MODE === 'verify-system') return { rejectUnauthorized: true }
  return verifiedTls(env.DATABASE_CA_CERT_BASE64!)
}

function databaseConnectionOptions(
  env: ReturnType<typeof serverEnv>,
  options: { max: number; prepare: boolean },
) {
  return {
    ...options,
    idle_timeout: 30,
    connect_timeout: 10,
    max_lifetime: 30 * 60,
    ssl: databaseTlsOptions(env),
  }
}

function createSql() {
  const env = serverEnv()
  return postgres(
    env.DATABASE_URL,
    databaseConnectionOptions(env, {
      max: 5,
      prepare: env.DATABASE_POOL_MODE !== 'transaction',
    }),
  )
}

export function createListenerSql() {
  const env = serverEnv()
  return postgres(
    (env.REALTIME_MODE === 'self' ? env.DATABASE_LISTENER_URL : undefined) ?? env.DATABASE_URL,
    databaseConnectionOptions(env, { max: 1, prepare: false }),
  )
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
