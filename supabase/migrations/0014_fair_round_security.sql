-- 공정 딜 상태는 브라우저·PostgREST에 절대 노출하지 않는다. Auth.js 세션을 Supabase JWT로
-- 브리지하지 않는 현재 구조에서는 kkeutbal_app 서버 롤만 이 세 테이블을 읽고 전이한다.

begin;

alter table public.round_fairness enable row level security;
alter table public.round_fairness_participants enable row level security;
alter table public.round_fairness_reveals enable row level security;

revoke all privileges on public.round_fairness from public, anon, authenticated;
revoke all privileges on public.round_fairness_participants from public, anon, authenticated;
revoke all privileges on public.round_fairness_reveals from public, anon, authenticated;

grant select, insert, update, delete on public.round_fairness to kkeutbal_app;
grant select, insert, update, delete on public.round_fairness_participants to kkeutbal_app;
grant select, insert, update, delete on public.round_fairness_reveals to kkeutbal_app;

commit;
