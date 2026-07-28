import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../drizzle/schema'
import { serverEnv } from './env'

const globalForDb = globalThis as unknown as {
  kkeutbalSql?: ReturnType<typeof postgres>
}

const TRANSACTION_MODE_PORT = '6543'

function poolerOptions(databaseUrl: string): { max: number; prepare?: boolean } {
  let port = ''
  try {
    port = new URL(databaseUrl).port
  } catch {}
  return port === TRANSACTION_MODE_PORT ? { max: 5, prepare: false } : { max: 5 }
}

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