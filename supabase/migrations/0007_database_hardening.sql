-- 현재 Drizzle 스키마를 대상으로 한 DB 보안 baseline.
-- 적용 전제: `pnpm db:push`가 현 테이블을 만든 뒤 이 파일을 실행한다.

begin;

-- 브라우저는 PostgREST로 앱 데이터를 읽거나 쓰지 않는다. 모든 앱 데이터는 Server Action의
-- kkeutbal_app 연결만 사용하므로, anon/authenticated의 테이블 권한과 RLS 정책을 닫는다.
alter table public.users enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.rounds enable row level security;
alter table public.bet_actions enable row level security;
alter table public.chip_ledger enable row level security;
alter table public.buy_ins enable row level security;
alter table public.guest_tokens enable row level security;
alter table public.registration_codes enable row level security;
alter table public.auth_settings enable row level security;
alter table public.promotions enable row level security;

drop policy if exists users_select on public.users;
drop policy if exists users_update_self on public.users;
drop policy if exists rooms_select on public.rooms;
drop policy if exists rooms_insert on public.rooms;
drop policy if exists rooms_update_host on public.rooms;
drop policy if exists room_members_select on public.room_members;
drop policy if exists room_members_insert on public.room_members;
drop policy if exists room_members_update on public.room_members;
drop policy if exists rounds_select on public.rounds;
drop policy if exists rounds_insert on public.rounds;
drop policy if exists rounds_update on public.rounds;
drop policy if exists bet_actions_select on public.bet_actions;
drop policy if exists bet_actions_insert on public.bet_actions;
drop policy if exists bet_actions_update on public.bet_actions;
drop policy if exists buy_ins_select on public.buy_ins;
drop policy if exists buy_ins_insert on public.buy_ins;
drop policy if exists chip_ledger_select on public.chip_ledger;
drop policy if exists realtime_room_read on realtime.messages;
drop policy if exists realtime_room_write on realtime.messages;

drop function if exists public.is_room_member(uuid);
drop function if exists public.has_room_role(uuid, text[]);
drop function if exists public.is_round_ended(uuid);

-- 0001_init_rls.sql에만 있던 원장 불변성도 현 baseline에 포함한다.
create or replace function public.chip_ledger_is_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'chip_ledger is append-only: use a correction row with reverted_of instead';
end;
$$;

drop trigger if exists chip_ledger_no_update on public.chip_ledger;
create trigger chip_ledger_no_update
  before update or delete on public.chip_ledger
  for each row execute function public.chip_ledger_is_append_only();

revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke all privileges on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- 앱 롤에는 실행에 필요한 DML만 준다. TRUNCATE·TRIGGER·REFERENCES 권한은 주지 않는다.
revoke all privileges on all tables in schema public from kkeutbal_app;
revoke all privileges on all sequences in schema public from kkeutbal_app;
revoke all privileges on all functions in schema public from kkeutbal_app;
grant select, insert, update, delete on all tables in schema public to kkeutbal_app;
grant usage, select on all sequences in schema public to kkeutbal_app;
grant execute on all functions in schema public to kkeutbal_app;
alter default privileges for role postgres in schema public revoke all on tables from kkeutbal_app;
alter default privileges for role postgres in schema public revoke all on sequences from kkeutbal_app;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to kkeutbal_app;
alter default privileges for role postgres in schema public grant usage, select on sequences to kkeutbal_app;
alter default privileges for role postgres in schema public grant execute on functions to kkeutbal_app;

-- 기존 GitHub Actions 전용 공개 REST 쓰기 테이블. 인증된 앱 엔드포인트로 대체한다.
drop table if exists public.keep_alive;

commit;
