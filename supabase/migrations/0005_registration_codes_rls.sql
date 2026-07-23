-- 적용됨 (supabase MCP, 2026-07-23, migration name: registration_codes)
-- registration_codes: 내부 계정 가입코드 (drizzle 0004_light_the_fallen 과 같은 DDL).
--
-- 이 DB 는 drizzle-kit migrate 를 쓴 적이 없다(`drizzle.__drizzle_migrations` 부재) —
-- 스키마는 db:push 또는 여기 SQL 로 반영해 왔다. 이 파일은 적용 사실의 저장소 측 기록이다.
--
-- 가입코드 해시는 계정 생성 자격이므로 anon/authenticated 에게 어떤 정책도 열지 않는다.
-- 읽기·쓰기는 전용 롤 kkeutbal_app(bypassrls) 을 통한 Server Action 만 한다.

create table public.registration_codes (
  id uuid primary key default gen_random_uuid() not null,
  code_hash text not null,
  label text not null,
  created_by uuid not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint registration_codes_code_hash_unique unique (code_hash)
);

alter table public.registration_codes
  add constraint registration_codes_created_by_users_id_fk
  foreign key (created_by) references public.users(id);

create index registration_codes_expires_at_idx
  on public.registration_codes using btree (expires_at);

-- 정책 없음 = anon/authenticated 전면 차단이 의도된 상태다.
alter table public.registration_codes enable row level security;

grant all privileges on public.registration_codes to kkeutbal_app;
