-- 바이인 수명주기 하드닝 — 재전송 흡수와 취소 보존식.
--
-- (1) 재전송 흡수는 DDL 없이 끝난다. `addBuyIn`이 클라이언트가 만든 요청 id를 `buy_ins.id`로
--     그대로 쓰기 때문이다. `chip_ledger.ref_buy_in_id`, `room_credit_locks.buy_in_id`,
--     그리고 `lock_room_credit_buy_in`의 idempotency key(`room-credit-lock:v1:{buy_in_id}`)가
--     전부 그 id 하나에 매달려 있으므로 `buy_ins_pkey` 충돌 한 번이 세션 원장·지갑 잠금
--     양쪽의 중복을 동시에 막는다. 새 컬럼도 새 테이블도 필요 없다.
--
-- (2) `release_room_credit_buy_in`에 사용자별 정산 가능 조건을 추가한다.
--     지금까지 취소는 "대상의 현재 방 잔액이 취소액 이상인가"만 봤다. 판이 오간 뒤에는
--     그 검사를 통과하면서도 칩만 남고 잠금은 0이 되는 사용자가 생긴다.
--     `settle_room_credits`는 active lock을 기준으로 세션 잔액을 조인하므로 그런 사용자는
--     양쪽에서 통째로 빠지고, 보존식 검사가 'room credit settlement does not conserve
--     locked credits'로 예외를 던진다. 그러면 `closeRoom`도 관리자 강제 정산도 실패해
--     **다른 참가자의 크레딧까지 영구히 잠긴다**. 그래서 그 취소를 취소 시점에 거절한다.
--
-- (3) 이미 그 상태로 굳은 방을 위한 관리자 전용 복구 경로를 추가한다.

begin;

create or replace function public.release_room_credit_buy_in(
  p_room_id uuid,
  p_user_id uuid,
  p_buy_in_id uuid,
  p_reversal_buy_in_id uuid,
  p_amount bigint,
  p_initiated_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_initiator_role public.member_role;
  v_room_status public.room_status;
  v_lock_transaction_id uuid;
  v_released_transaction_id uuid;
  v_account_id uuid;
  v_transaction_id uuid;
  v_stranded_count integer;
  v_key text;
begin
  if p_room_id is null or p_user_id is null or p_buy_in_id is null
     or p_reversal_buy_in_id is null or p_initiated_by is null then
    raise exception 'room, user, buy-in, reversal, and initiator are required';
  end if;
  if p_amount is null or p_amount not between 1 and 9007199254740991 then
    raise exception 'buy-in amount must be a positive safe integer';
  end if;

  select status into v_room_status
  from public.rooms
  where id = p_room_id
  for update;
  if v_room_status is null or v_room_status in ('settled', 'closed') then
    raise exception 'room is not accepting credit reversals';
  end if;

  select role into v_initiator_role
  from public.room_members
  where room_id = p_room_id and user_id = p_initiated_by and left_at is null;
  if v_initiator_role is distinct from 'host' and v_initiator_role is distinct from 'dealer' then
    raise exception 'only host or dealer may reverse an account-credit buy-in';
  end if;

  select lock_transaction_id, released_transaction_id
  into v_lock_transaction_id, v_released_transaction_id
  from public.room_credit_locks
  where room_id = p_room_id
    and user_id = p_user_id
    and buy_in_id = p_buy_in_id
    and amount = p_amount
  for update;
  if v_lock_transaction_id is null then
    raise exception 'active room credit lock was not found for buy-in';
  end if;
  if v_released_transaction_id is not null then
    return v_released_transaction_id;
  end if;

  perform 1
  from public.buy_ins original
  join public.buy_ins reversal on reversal.id = p_reversal_buy_in_id
  where original.id = p_buy_in_id
    and original.room_id = p_room_id
    and original.user_id = p_user_id
    and original.amount = p_amount
    and reversal.room_id = p_room_id
    and reversal.user_id = p_user_id
    and reversal.amount = -p_amount
    and reversal.reverted_of = original.id;
  if not found then
    raise exception 'reversal buy-in does not match its account-credit lock';
  end if;

  select id into v_account_id
  from public.credit_accounts
  where user_id = p_user_id and kind = 'user';
  if v_account_id is null then
    raise exception 'credit account was not found';
  end if;

  v_key := 'room-credit-release:v1:' || p_reversal_buy_in_id::text;
  v_transaction_id := public.post_credit_transaction(
    'correction',
    v_key,
    p_initiated_by,
    p_room_id,
    null,
    '방 참가 크레딧 잠금 취소',
    jsonb_build_object(
      'protocol', 'room-credit-release/v1',
      'buyInId', p_buy_in_id,
      'reversalBuyInId', p_reversal_buy_in_id,
      'userId', p_user_id,
      'amount', p_amount
    ),
    jsonb_build_array(
      jsonb_build_object(
        'account_id', v_account_id,
        'delta_available', p_amount,
        'delta_locked', -p_amount
      )
    ),
    v_lock_transaction_id
  );

  update public.room_credit_locks
  set released_transaction_id = v_transaction_id
  where buy_in_id = p_buy_in_id and released_transaction_id is null;

  -- 정산 가능 조건: 이 방에서 **세션 칩이 남았는데 활성 lock이 하나도 없는 사용자**가
  -- 있으면 안 된다. 호출자가 상쇄 `chip_ledger` 행을 먼저 넣고 이 함수를 부르므로 위의
  -- release 반영까지 끝난 지금 상태가 곧 취소 직후 상태다. 여기서 걸리면 예외로 트랜잭션
  -- 전체(세션 원장 상쇄 행 포함)를 되돌린다.
  --
  -- 주의: 사용자별 `칩 == 잠금액`을 요구하지는 않는다. 판이 오가면 그 둘은 정상적으로
  -- 어긋나고(이긴 쪽은 칩 > 잠금), `settle_room_credits`는 lock 보유자 전체 합계만 맞으면
  -- 된다. 깨지는 경우는 오직 "lock을 전부 잃은 사람에게 칩이 남는" 경우다.
  select count(*)::integer
  into v_stranded_count
  from (
    select user_id, coalesce(sum(delta), 0)::bigint as session_balance
    from public.chip_ledger
    where room_id = p_room_id
    group by user_id
  ) balances
  where balances.session_balance <> 0
    and not exists (
      select 1
      from public.room_credit_locks locks
      where locks.room_id = p_room_id
        and locks.user_id = balances.user_id
        and locks.released_transaction_id is null
    );
  if v_stranded_count > 0 then
    raise exception 'reversing this buy-in would strand session chips without locked credits';
  end if;

  return v_transaction_id;
end;
$$;

-- 이미 위 상태로 굳어 정산이 막힌 방의 관리자 전용 복구 경로.
--
-- 정상 `settle_room_credits`는 active lock을 기준으로 세션 잔액을 LEFT JOIN하므로, lock을
-- 잃은 칩 보유자를 정산에서 제외한다. 그 제외가 곧 보존식 위반이라 방이 닫히지 않는다.
-- 이 함수는 lock 보유자와 칩 보유자의 **합집합**으로 정산해 실제 크레딧을 옳게 옮긴다:
-- lock을 잃은 사람은 남은 칩만큼 available을 돌려받고, 그 몫은 아직 잠겨 있는 사람의
-- locked에서 나온다. 합계가 맞지 않으면(진짜 크레딧 유실/생성) 그대로 거절한다.
--
-- 정상 경로와 같은 idempotency key를 쓰므로 한 방은 어느 경로로든 한 번만 정산된다.
-- 복구 뒤 `closeRoom`/관리자 강제 정산이 `settle_room_credits`를 부르면 기존 거래를 찾아
-- 그대로 반환하고 방이 닫힌다. 방 상태(`rooms.status`)는 여기서 바꾸지 않는다.
create or replace function public.admin_repair_room_credit_settlement(
  p_room_id uuid,
  p_initiated_by uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_admin boolean;
  v_transaction_id uuid;
  v_existing_transaction_id uuid;
  v_entries jsonb;
  v_stranded jsonb;
  v_locked_total bigint;
  v_balance_total bigint;
  v_stranded_count integer;
  v_missing_account_count integer;
  v_key text;
begin
  if p_room_id is null or p_initiated_by is null then
    raise exception 'room and initiator are required';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason is required';
  end if;

  select coalesce(is_admin, false) into v_is_admin
  from public.users
  where id = p_initiated_by;
  if coalesce(v_is_admin, false) is not true then
    raise exception 'administrator privileges are required';
  end if;

  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room not found';
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
  ), merged as (
    select
      coalesce(locks.user_id, balances.user_id) as user_id,
      coalesce(locks.locked_amount, 0)::bigint as locked_amount,
      coalesce(balances.session_balance, 0)::bigint as session_balance
    from active_locks locks
    full outer join session_balances balances on balances.user_id = locks.user_id
  ), account_rows as (
    select merged.user_id, merged.locked_amount, merged.session_balance, accounts.id as account_id
    from merged
    left join public.credit_accounts accounts
      on accounts.user_id = merged.user_id and accounts.kind = 'user'
    where merged.locked_amount <> 0 or merged.session_balance <> 0
  )
  select
    jsonb_agg(jsonb_build_object(
      'account_id', account_id,
      'delta_available', session_balance,
      'delta_locked', -locked_amount
    ) order by account_id),
    coalesce(sum(locked_amount), 0)::bigint,
    coalesce(sum(session_balance), 0)::bigint,
    (count(*) filter (where locked_amount = 0))::integer,
    (count(*) filter (where account_id is null))::integer,
    jsonb_agg(jsonb_build_object('userId', user_id, 'sessionBalance', session_balance) order by user_id)
      filter (where locked_amount = 0)
  into
    v_entries,
    v_locked_total,
    v_balance_total,
    v_stranded_count,
    v_missing_account_count,
    v_stranded
  from account_rows;

  if coalesce(v_missing_account_count, 0) > 0 then
    raise exception 'room credit repair found a participant without a credit account';
  end if;
  if coalesce(v_stranded_count, 0) = 0 then
    raise exception 'room has no stranded session chips: close it through the normal settlement path';
  end if;
  if v_entries is null or v_locked_total <> v_balance_total then
    raise exception 'room credit repair does not conserve locked credits';
  end if;

  v_transaction_id := public.post_credit_transaction(
    'room_settlement',
    v_key,
    p_initiated_by,
    p_room_id,
    null,
    trim(p_reason),
    jsonb_build_object(
      'protocol', 'room-credit-settlement-repair/v1',
      'lockedTotal', v_locked_total,
      'strandedCount', v_stranded_count,
      'stranded', coalesce(v_stranded, '[]'::jsonb)
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

revoke all privileges on function public.release_room_credit_buy_in(uuid, uuid, uuid, uuid, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.release_room_credit_buy_in(uuid, uuid, uuid, uuid, bigint, uuid)
  to kkeutbal_app;

revoke all privileges on function public.admin_repair_room_credit_settlement(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_repair_room_credit_settlement(uuid, uuid, text)
  to kkeutbal_app;

commit;
