begin;

alter table public.room_connections enable row level security;

revoke all privileges on public.room_connections from public, anon, authenticated, kkeutbal_app;
grant select, insert, update, delete on public.room_connections to kkeutbal_app;

commit;
