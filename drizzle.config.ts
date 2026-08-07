import { defineConfig } from 'drizzle-kit'

/**
 * Supabase pooler는 SSL을 요구한다(`ESSLREQUIRED`). 앱(`src/lib/db.ts`)은
 * `DATABASE_CA_CERT_BASE64`로 CA를 검증하는데 여기에는 그 설정이 없어서
 * `pnpm db:migrate`가 이 DB에 아예 붙지 못했다.
 *
 * `dbCredentials`에 `url`과 `ssl`을 같이 주면 drizzle-kit이 `ssl`을 버린다 — 그래서
 * URL을 분해해 개별 필드로 넘긴다. `db:generate`는 접속하지 않으므로
 * `DATABASE_URL` 없이도 돌아야 한다(아래 빈 자격증명 폴백).
 */
function ssl() {
  const caBase64 = process.env.DATABASE_CA_CERT_BASE64
  if (!caBase64) return 'require' as const

  const ca = Buffer.from(caBase64, 'base64').toString('utf8')
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('DATABASE_CA_CERT_BASE64 must contain a base64-encoded PEM certificate')
  }
  return { ca, rejectUnauthorized: true }
}

function credentials() {
  const raw = process.env.DATABASE_URL
  if (!raw) return { url: '' }

  const url = new URL(raw)
  return {
    host: url.hostname,
    port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1) || 'postgres',
    ssl: ssl(),
  }
}

export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: credentials(),

  verbose: true,

  strict: false,
})
