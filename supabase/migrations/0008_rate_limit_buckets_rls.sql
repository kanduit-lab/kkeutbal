-- rate_limit_buckets is application-internal security state.
-- This migration is separate from the Drizzle DDL so databases that already applied
-- 0007_database_hardening also receive the table-specific RLS and grants.

begin;

alter table public.rate_limit_buckets enable row level security;
alter table public.round_participants enable row level security;

revoke all privileges on public.rate_limit_buckets from public, anon, authenticated;
revoke all privileges on public.round_participants from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limit_buckets to kkeutbal_app;
grant select, insert, update, delete on public.round_participants to kkeutbal_app;

commit;
