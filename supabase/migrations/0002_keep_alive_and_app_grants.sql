-- 적용됨 (supabase MCP, 2026-07-22, migration name: keep_alive_and_app_grants)
-- 앞선 적용분: init_schema(drizzle/migrations/0000_perpetual_karma.sql), init_rls(0001_init_rls.sql)
--
-- 전제: 앱 전용 롤. 비밀번호는 배포 환경에서 치환한다.
--   create role kkeutbal_app login password '<비밀번호>' bypassrls;

-- supabase-inactive-fix keep-alive 테이블. GitHub Actions cron 이 anon key 로 insert/delete.
create table public.keep_alive (
  id bigint generated always as identity primary key,
  note text,
  created_at timestamptz not null default now()
);

alter table public.keep_alive enable row level security;

-- anon 은 이 테이블에서만 쓰기 가능
create policy keep_alive_anon_select on public.keep_alive for select to anon using (true);
create policy keep_alive_anon_insert on public.keep_alive for insert to anon with check (true);
create policy keep_alive_anon_delete on public.keep_alive for delete to anon using (true);

-- 앱 롤 권한 (마이그레이션 실행 롤과 무관하게 보장)
grant usage on schema public to kkeutbal_app;
grant all privileges on all tables in schema public to kkeutbal_app;
grant all privileges on all sequences in schema public to kkeutbal_app;
grant execute on all functions in schema public to kkeutbal_app;

-- 이후 postgres 가 만드는 객체에도 자동 부여
alter default privileges for role postgres in schema public grant all on tables to kkeutbal_app;
alter default privileges for role postgres in schema public grant all on sequences to kkeutbal_app;

-- 적용됨 (supabase MCP, migration name: security_advisor_fixes)
alter function public.chip_ledger_is_append_only() set search_path = public;
revoke execute on function public.is_room_member(uuid) from anon;
revoke execute on function public.has_room_role(uuid, text[]) from anon;
revoke execute on function public.is_round_ended(uuid) from anon;
