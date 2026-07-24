-- 가상 크레딧 write 경로를 용도별 RPC로 좁힌다.
-- `post_credit_transaction`은 내부 primitive이고, 앱 역할은 관리자 조정 RPC만 호출한다.

begin;

-- SECURITY DEFINER 함수가 호출 시점의 search_path를 상속하지 않게 더 좁힌다.
alter function public.ensure_credit_account(uuid)
  set search_path = pg_catalog, public;
alter function public.post_credit_transaction(
  public.credit_transaction_kind,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  uuid
) set search_path = pg_catalog, public;

create or replace function public.admin_adjust_credit(
  p_target_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key text,
  p_initiated_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_account_id uuid;
  v_existing_transaction_id uuid;
  v_existing_delta bigint;
  v_existing_reason text;
  v_existing_initiator uuid;
  v_existing_kind public.credit_transaction_kind;
  v_existing_entry_count integer;
  v_is_admin boolean;
  v_kind public.credit_transaction_kind;
  v_issuance_delta bigint;
begin
  if p_target_user_id is null or p_initiated_by is null then
    raise exception 'target user and initiator are required';
  end if;
  if p_amount is null or p_amount = 0 or p_amount not between -1000000 and 1000000 then
    raise exception 'credit adjustment must be a nonzero amount up to 1000000';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'reason is required';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;

  -- 동일 키의 동시 요청도 첫 요청이 원장을 완성한 뒤 의미 비교를 하게 한다.
  perform pg_advisory_xact_lock(hashtextextended('admin-adjust-credit:' || p_idempotency_key, 0));

  select is_admin into v_is_admin
  from public.users
  where id = p_initiated_by;
  if coalesce(v_is_admin, false) is not true then
    raise exception 'administrator privileges are required';
  end if;

  v_target_account_id := public.ensure_credit_account(p_target_user_id);
  v_kind := case when p_amount > 0 then 'admin_grant' else 'admin_revoke' end;

  -- 같은 키의 재시도는 반드시 같은 의미의 요청이어야 한다.
  select
    credit_tx.id,
    credit_tx.kind,
    credit_tx.reason,
    credit_tx.initiated_by,
    entry.delta_available,
    (
      select count(*)::integer
      from public.credit_entries all_entries
      where all_entries.transaction_id = credit_tx.id
    )
  into
    v_existing_transaction_id,
    v_existing_kind,
    v_existing_reason,
    v_existing_initiator,
    v_existing_delta,
    v_existing_entry_count
  from public.credit_transactions credit_tx
  join public.credit_entries entry
    on entry.transaction_id = credit_tx.id
   and entry.account_id = v_target_account_id
  where credit_tx.idempotency_key = p_idempotency_key
  limit 1;

  if v_existing_transaction_id is not null then
    if v_existing_kind = v_kind
       and v_existing_reason = trim(p_reason)
       and v_existing_initiator = p_initiated_by
       and v_existing_delta = p_amount
       and v_existing_entry_count = 2 then
      return v_existing_transaction_id;
    end if;
    raise exception 'idempotency key was already used by a different credit adjustment';
  end if;

  v_issuance_delta := -p_amount;
  return public.post_credit_transaction(
    v_kind,
    p_idempotency_key,
    p_initiated_by,
    null,
    null,
    trim(p_reason),
    jsonb_build_object(
      'protocol', 'admin-adjust-credit/v1',
      'targetUserId', p_target_user_id,
      'amount', p_amount
    ),
    jsonb_build_array(
      jsonb_build_object(
        'account_id', v_target_account_id,
        'delta_available', p_amount,
        'delta_locked', 0
      ),
      jsonb_build_object(
        'account_id', '00000000-0000-4000-8000-000000000001'::uuid,
        'delta_available', v_issuance_delta,
        'delta_locked', 0
      )
    ),
    null
  );
end;
$$;

-- 앱 역할은 좁은 관리자 조정만 호출하고, 범용 복식 posting primitive를 직접 호출하지 않는다.
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
) from kkeutbal_app;
revoke all privileges on function public.admin_adjust_credit(uuid, bigint, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_credit(uuid, bigint, text, text, uuid)
  to kkeutbal_app;

commit;
