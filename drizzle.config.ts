import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // RLS 정책·realtime 설정은 supabase/migrations/*.sql 이 소유한다.
  // drizzle 은 테이블/인덱스/제약만 관리.
  verbose: true,
  strict: true,
})
