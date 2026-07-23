-- 적용됨 (supabase MCP, 2026-07-24, migration name: auth_settings)
-- auth_settings: 인스턴스 단위 인증 설정 (관리자 화면에서 저장하는 SSO 설정).
-- drizzle schema.ts `authSettings` / drizzle/migrations/0005_nasty_kat_farrell.sql 과 같은 DDL.
--
-- 이 DB 는 drizzle-kit migrate 를 쓴 적이 없다(`drizzle.__drizzle_migrations` 부재) —
-- 스키마는 db:push 또는 여기 SQL 로 반영해 왔다. 그래서 테이블 생성까지 이 파일이 갖는다.
--
-- sso_client_secret_ciphertext 는 AUTH_SECRET 파생 키로 AES-GCM 암호화한 값이다.
-- 평문 비밀값이 아니지만 여전히 자격 증명이므로 anon/authenticated 에게 정책을 열지 않는다.

create table public.auth_settings (
  id text primary key default 'default' not null,
  sso_enabled boolean not null default false,
  sso_issuer text,
  sso_client_id text,
  sso_client_secret_ciphertext text,
  updated_at timestamptz not null default now()
);

-- 정책 없음 = anon/authenticated 전면 차단이 의도된 상태다.
alter table public.auth_settings enable row level security;

grant all privileges on public.auth_settings to kkeutbal_app;
