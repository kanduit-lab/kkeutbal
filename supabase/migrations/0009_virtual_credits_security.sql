-- 전역 가상 크레딧 보안·원장 posting 경로.
-- 전제: drizzle/migrations/0012_damp_tiger_shark.sql 적용 뒤 실행한다.
-- 브라우저는 어떤 credit 테이블도 직접 접근하지 않으며, 앱 롤도 posting 함수 외 직접 쓰기는 금지한다.

begin;

alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_entries enable row level security;
alter table public.room_credit_locks enable row level security;

revoke all privileges on public.credit_accounts from public, anon, authenticated, kkeutbal_app;
revoke all privileges on public.credit_transactions from public, anon, authenticated, kkeutbal_app;
revoke all privileges on public.credit_entries from public, anon, authenticated, kkeutbal_app;
revoke all privileges on public.room_credit_locks from public, anon, authenticated, kkeutbal_app;

grant select on public.credit_accounts to kkeutbal_app;
grant select on public.credit_transactions to kkeutbal_app;
grant select on public.credit_entries to kkeutbal_app;
grant select on public.room_credit_locks to kkeutbal_app;

-- 발행 계정은 실제 사용자와 분리된다. 0에서 시작하며 관리자 지급/회수의 반대 엔트리를 받는다.
insert into public.credit_accounts (id, kind, available_balance, locked_balance, version)
values ('00000000-0000-4000-8000-000000000001', 'issuance', 0, 0, 0)
on conflict (id) do nothing;

create or replace function public.credit_ledger_is_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only: create a correcting transaction instead', tg_table_name;
end;
$$;

drop trigger if exists credit_transactions_no_update on public.credit_transactions;
create trigger credit_transactions_no_update
  before update or delete on public.credit_transactions
  for each row execute function public.credit_ledger_is_append_only();

drop trigger if exists credit_entries_no_update on public.credit_entries;
create trigger credit_entries_no_update
  before update or delete on public.credit_entries
  for each row execute function public.credit_ledger_is_append_only();

-- materialized balance는 posting 함수가 트랜잭션 로컬 플래그를 설정했을 때만 변경할 수 있다.
create or replace function public.credit_accounts_write_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.credit_posting', true) is distinct from 'on' then
    raise exception 'credit_accounts can only be updated by post_credit_transaction';
  end if;
  return new;
end;
$$;

drop trigger if exists credit_accounts_update_guard on public.credit_accounts;
create trigger credit_accounts_update_guard
  before update on public.credit_accounts
  for each row execute function public.credit_accounts_write_guard();

-- 사용자 지갑은 lazy creation 한다. 0 크레딧만 생성하며 발행은 admin_grant 거래만 할 수 있다.
create or replace function public.ensure_credit_account(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  insert into public.credit_accounts (user_id, kind)
  values (p_user_id, 'user')
  on conflict do nothing;

  select id into v_account_id
  from public.credit_accounts
  where user_id = p_user_id and kind = 'user';

  if v_account_id is null then
    raise exception 'failed to ensure credit account';
  end if;
  return v_account_id;
end;
$$;

-- 모든 전역 크레딧 변경의 유일한 write path.
-- p_entries 형식: [{accountId: uuid, deltaAvailable: bigint, deltaLocked: bigint}, ...]
create or replace function public.post_credit_transaction(
  p_kind public.credit_transaction_kind,
  p_idempotency_key text,
  p_initiated_by uuid,
  p_room_id uuid,
  p_round_id uuid,
  p_reason text,
  p_snapshot jsonb,
  p_entries jsonb,
  p_reverses_transaction_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_entry record;
  v_entry_count integer;
  v_distinct_account_count integer;
  v_total_delta bigint;
  v_locked_account_count integer;
  v_requested_account_count integer;
  v_available_after bigint;
  v_locked_after bigint;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason is required';
  end if;
  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'entries must be a JSON array';
  end if;

  select id into v_transaction_id
  from public.credit_transactions
  where idempotency_key = p_idempotency_key;
  if v_transaction_id is not null then
    return v_transaction_id;
  end if;

  select
    count(*)::integer,
    count(distinct item.account_id)::integer,
    coalesce(sum(item.delta_available + item.delta_locked), 0)
  into v_entry_count, v_distinct_account_count, v_total_delta
  from jsonb_to_recordset(p_entries) as item(
    account_id uuid,
    delta_available bigint,
    delta_locked bigint
  );

  if v_entry_count < 1
     or v_entry_count <> v_distinct_account_count
     or v_total_delta <> 0 then
    raise exception 'credit transaction entries must be nonempty, one per account, and sum to zero';
  end if;

  select count(*)::integer into v_requested_account_count
  from jsonb_to_recordset(p_entries) as item(
    account_id uuid,
    delta_available bigint,
    delta_locked bigint
  );

  select count(*)::integer into v_locked_account_count
  from public.credit_accounts account
  join jsonb_to_recordset(p_entries) as item(
    account_id uuid,
    delta_available bigint,
    delta_locked bigint
  ) on item.account_id = account.id;

  if v_locked_account_count <> v_requested_account_count then
    raise exception 'credit transaction references an unknown account';
  end if;

  begin
    insert into public.credit_transactions (
      kind,
      idempotency_key,
      room_id,
      round_id,
      initiated_by,
      reverses_transaction_id,
      reason,
      snapshot
    ) values (
      p_kind,
      p_idempotency_key,
      p_room_id,
      p_round_id,
      p_initiated_by,
      p_reverses_transaction_id,
      trim(p_reason),
      coalesce(p_snapshot, '{}'::jsonb)
    ) returning id into v_transaction_id;
  exception when unique_violation then
    select id into v_transaction_id
    from public.credit_transactions
    where idempotency_key = p_idempotency_key;
    if v_transaction_id is not null then
      return v_transaction_id;
    end if;
    raise;
  end;

  perform set_config('app.credit_posting', 'on', true);

  for v_entry in
    select
      account.id as account_id,
      account.kind,
      account.available_balance,
      account.locked_balance,
      item.delta_available,
      item.delta_locked
    from public.credit_accounts account
    join jsonb_to_recordset(p_entries) as item(
      account_id uuid,
      delta_available bigint,
      delta_locked bigint
    ) on item.account_id = account.id
    order by account.id
    for update of account
  loop
    if v_entry.delta_available = 0 and v_entry.delta_locked = 0 then
      raise exception 'credit transaction entry must change a balance';
    end if;

    v_available_after := v_entry.available_balance + v_entry.delta_available;
    v_locked_after := v_entry.locked_balance + v_entry.delta_locked;
    if v_entry.kind = 'user' and (v_available_after < 0 or v_locked_after < 0) then
      raise exception 'insufficient virtual credit';
    end if;

    update public.credit_accounts
    set available_balance = v_available_after,
        locked_balance = v_locked_after,
        version = version + 1,
        updated_at = now()
    where id = v_entry.account_id;

    insert into public.credit_entries (
      transaction_id,
      account_id,
      delta_available,
      delta_locked,
      available_after,
      locked_after
    ) values (
      v_transaction_id,
      v_entry.account_id,
      v_entry.delta_available,
      v_entry.delta_locked,
      v_available_after,
      v_locked_after
    );
  end loop;

  return v_transaction_id;
end;
$$;

revoke all privileges on function public.ensure_credit_account(uuid) from public, anon, authenticated;
revoke all privileges on function public.post_credit_transaction(
  public.credit_transaction_kind,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  uuid
) from public, anon, authenticated;
grant execute on function public.ensure_credit_account(uuid) to kkeutbal_app;
grant execute on function public.post_credit_transaction(
  public.credit_transaction_kind,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  uuid
) to kkeutbal_app;

commit;
