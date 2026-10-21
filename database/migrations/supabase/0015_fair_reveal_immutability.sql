-- 종료 뒤 공개한 full reveal은 새 감사 기록으로만 보정한다. 평문 server seed를 다시 써서
-- 과거 셔플을 바꾸는 경로를 DB 트리거 수준에서 차단한다.

begin;

create or replace function public.fairness_reveal_is_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'round_fairness_reveals is append-only';
end;
$$;

drop trigger if exists round_fairness_reveals_no_update on public.round_fairness_reveals;
create trigger round_fairness_reveals_no_update
  before update or delete on public.round_fairness_reveals
  for each row execute function public.fairness_reveal_is_append_only();

commit;
