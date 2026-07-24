-- account_credit 방의 세션 칩은 전역 지갑 lock 없이는 생기지 않는다.
-- 앱 롤은 generic posting과 room_credit_locks 직접 DML을 할 수 없고 이 전용 RPC만 호출한다.

begin;

create or replace function public.lock_room_credit_buy_in(
  p_room_id uuid,
  p_user_id uuid,
  p_buy_in_id uuid,
  p_amount bigint,
  p_initiated_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_role public.member_role;
  v_initiator_role public.member_role;
  v_room_status public.room_status;
  v_buy_in_amount integer;
  v_account_id uuid;
  v_transaction_id uuid;
  v_existing_transaction_id uuid;
  v_key text;
begin
  if p_room_id is null or p_user_id is null or p_buy_in_id is null or p_initiated_by is null then
    raise exception 'room, user, buy-in, and initiator are required';
  end if;
  if p_amount is null or p_amount not between 1 and 9007199254740991 then
    raise exception 'buy-in amount must be a positive safe integer';
  end if;

  select status into v_room_status
  from public.rooms
  where id = p_room_id
  for update;
  if v_room_status is null then
    raise exception 'room not found';
  end if;
  if v_room_status in ('settled', 'closed') then
    raise exception 'room is not accepting credits';
  end if;

  select role into v_target_role
  from public.room_members
  where room_id = p_room_id and user_id = p_user_id and left_at is null;
  if v_target_role is null or v_target_role = 'observer' then
    raise exception 'target must be an active player';
  end if;

  select role into v_initiator_role
  from public.room_members
  where room_id = p_room_id and user_id = p_initiated_by and left_at is null;
  if v_initiator_role is null then
    raise exception 'initiator is not an active room member';
  end if;
  if p_initiated_by <> p_user_id and v_initiator_role not in ('host', 'dealer') then
    raise exception 'only host or dealer may add a buy-in for another player';
  end if;

  select amount into v_buy_in_amount
  from public.buy_ins
  where id = p_buy_in_id and room_id = p_room_id and user_id = p_user_id;
  if v_buy_in_amount is null or v_buy_in_amount <> p_amount then
    raise exception 'buy-in does not match room credit lock';
  end if;

  select lock_transaction_id into v_existing_transaction_id
  from public.room_credit_locks
  where buy_in_id = p_buy_in_id;
  if v_existing_transaction_id is not null then
    return v_existing_transaction_id;
  end if;

  v_key := 'room-credit-lock:v1:' || p_buy_in_id::text;
  v_account_id := public.ensure_credit_account(p_user_id);
  v_transaction_id := public.post_credit_transaction(
    'room_lock',
    v_key,
    p_initiated_by,
    p_room_id,
    null,
    '방 참가 크레딧 잠금',
    jsonb_build_object(
      'protocol', 'room-credit-lock/v1',
      'buyInId', p_buy_in_id,
      'userId', p_user_id,
      'amount', p_amount
    ),
    jsonb_build_array(
      jsonb_build_object(
        'account_id', v_account_id,
        'delta_available', -p_amount,
        'delta_locked', p_amount
      )
    ),
    null
  );

  insert into public.room_credit_locks (
    room_id,
    user_id,
    buy_in_id,
    lock_transaction_id,
    amount
  ) values (
    p_room_id,
    p_user_id,
    p_buy_in_id,
    v_transaction_id,
    p_amount
  ) on conflict (buy_in_id) do nothing;

  select lock_transaction_id into v_existing_transaction_id
  from public.room_credit_locks
  where buy_in_id = p_buy_in_id;
  if v_existing_transaction_id is distinct from v_transaction_id then
    raise exception 'room credit lock is inconsistent with its buy-in';
  end if;
  return v_transaction_id;
end;
$$;

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
  if v_initiator_role is distinct from 'host' then
    raise exception 'only the room host may settle account credits';
  end if;

  v_key := 'room-credit-settlement:v1:' || p_room_id::text;
  select id into v_existing_transaction_id
  from public.credit_transactions
  where idempotency_key = v_key;
  if v_existing_transaction_id is not null then
    return v_existing_transaction_id;
  end if;

  -- release 대상 lock을 먼저 잠가 두면 close/retry 경로가 한 번만 정산된다.
  perform id
  from public.room_credit_locks
  where room_id = p_room_id and released_transaction_id is null
  for update;

  select count(*)::integer into v_lock_count
  from public.room_credit_locks
  where room_id = p_room_id and released_transaction_id is null;
  if v_lock_count < 1 then
    raise exception 'room has no active account credit locks';
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

revoke all privileges on function public.lock_room_credit_buy_in(uuid, uuid, uuid, bigint, uuid)
  from public, anon, authenticated;
revoke all privileges on function public.settle_room_credits(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lock_room_credit_buy_in(uuid, uuid, uuid, bigint, uuid)
  to kkeutbal_app;
grant execute on function public.settle_room_credits(uuid, uuid)
  to kkeutbal_app;

commit;
