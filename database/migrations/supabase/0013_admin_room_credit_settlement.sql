-- 호스트를 잃은 방은 관리자 강제 정산으로 닫힌다. account_credit lock도 같은 경로에서
-- 풀 수 있어야 하므로 settle RPC가 DB에서 users.is_admin을 재검증해 제한적으로 허용한다.

begin;

create or replace function public.settle_room_credits(
  p_room_id uuid,
  p_initiated_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_initiator_role public.member_role;
  v_is_admin boolean;
  v_transaction_id uuid;
  v_existing_transaction_id uuid;
  v_entries jsonb;
  v_locked_total bigint;
  v_balance_total bigint;
  v_lock_count integer;
  v_key text;
begin
  if p_room_id is null or p_initiated_by is null then
    raise exception 'room and initiator are required';
  end if;

  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room not found';
  end if;
  select role into v_initiator_role
  from public.room_members
  where room_id = p_room_id and user_id = p_initiated_by and left_at is null;
  select coalesce(is_admin, false) into v_is_admin
  from public.users
  where id = p_initiated_by;
  if v_initiator_role is distinct from 'host' and coalesce(v_is_admin, false) is not true then
    raise exception 'only the room host or an administrator may settle account credits';
  end if;

  v_key := 'room-credit-settlement:v1:' || p_room_id::text;
  select id into v_existing_transaction_id
  from public.credit_transactions
  where idempotency_key = v_key;
  if v_existing_transaction_id is not null then
    return v_existing_transaction_id;
  end if;

  perform id
  from public.room_credit_locks
  where room_id = p_room_id and released_transaction_id is null
  for update;

  select count(*)::integer into v_lock_count
  from public.room_credit_locks
  where room_id = p_room_id and released_transaction_id is null;
  if v_lock_count = 0 then
    if exists (
      select 1
      from public.chip_ledger
      where room_id = p_room_id
      group by room_id
      having coalesce(sum(delta), 0) <> 0
    ) then
      raise exception 'room has session chips but no active account credit locks';
    end if;
    return null;
  end if;

  with active_locks as (
    select user_id, sum(amount)::bigint as locked_amount
    from public.room_credit_locks
    where room_id = p_room_id and released_transaction_id is null
    group by user_id
  ), session_balances as (
    select user_id, coalesce(sum(delta), 0)::bigint as session_balance
    from public.chip_ledger
    where room_id = p_room_id
    group by user_id
  ), account_rows as (
    select locks.user_id, locks.locked_amount, coalesce(balances.session_balance, 0)::bigint as session_balance,
           accounts.id as account_id
    from active_locks locks
    left join session_balances balances on balances.user_id = locks.user_id
    join public.credit_accounts accounts on accounts.user_id = locks.user_id and accounts.kind = 'user'
  )
  select
    jsonb_agg(jsonb_build_object(
      'account_id', account_id,
      'delta_available', session_balance,
      'delta_locked', -locked_amount
    ) order by account_id),
    coalesce(sum(locked_amount), 0)::bigint,
    coalesce(sum(session_balance), 0)::bigint
  into v_entries, v_locked_total, v_balance_total
  from account_rows;

  if v_entries is null or v_locked_total <> v_balance_total then
    raise exception 'room credit settlement does not conserve locked credits';
  end if;

  v_transaction_id := public.post_credit_transaction(
    'room_settlement',
    v_key,
    p_initiated_by,
    p_room_id,
    null,
    '방 종료 크레딧 정산',
    jsonb_build_object(
      'protocol', 'room-credit-settlement/v1',
      'lockedTotal', v_locked_total,
      'lockCount', v_lock_count
    ),
    v_entries,
    null
  );

  update public.room_credit_locks
  set released_transaction_id = v_transaction_id
  where room_id = p_room_id and released_transaction_id is null;

  return v_transaction_id;
end;
$$;

revoke all privileges on function public.settle_room_credits(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.settle_room_credits(uuid, uuid)
  to kkeutbal_app;

commit;
