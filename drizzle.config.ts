import { defineConfig } from 'drizzle-kit'

type DatabaseTlsMode = 'disable' | 'verify-system' | 'verify-ca'

function databaseTlsMode(): DatabaseTlsMode {
  const mode = process.env.DATABASE_TLS_MODE
  if (mode === 'disable' || mode === 'verify-system' || mode === 'verify-ca') return mode
  throw new Error('DATABASE_TLS_MODE must be disable, verify-system, or verify-ca')
}

function ssl(mode: DatabaseTlsMode) {
  if (mode === 'disable') return false
  if (mode === 'verify-system') return { rejectUnauthorized: true }

  const caBase64 = process.env.DATABASE_CA_CERT_BASE64
  if (!caBase64) {
    throw new Error('DATABASE_CA_CERT_BASE64 is required when DATABASE_TLS_MODE=verify-ca')
  }

  const ca = Buffer.from(caBase64, 'base64').toString('utf8')
  if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
    throw new Error('DATABASE_CA_CERT_BASE64 must contain a base64-encoded PEM certificate')
  }
  return { ca, rejectUnauthorized: true }
}

function credentials() {
  const raw = process.env.DATABASE_SESSION_URL
  if (!raw) return { url: '' }

  const url = new URL(raw)
  return {
    host: url.hostname,
    port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1) || 'postgres',
    ssl: ssl(databaseTlsMode()),
  }
}

export default defineConfig({
  schema: './database/schema.ts',
  out: './database/migrations/drizzle',
  dialect: 'postgresql',
  dbCredentials: credentials(),

  verbose: true,

  strict: false,
})
