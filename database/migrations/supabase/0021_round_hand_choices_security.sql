begin;

alter table public.round_hand_choices enable row level security;

revoke all privileges on public.round_hand_choices from public, anon, authenticated;
grant select, insert, update, delete on public.round_hand_choices to kkeutbal_app;

commit;
