-- 끗발 — RLS 정책 · realtime 권한 · 원장 불변성
--
-- 테이블 정의는 drizzle 이 소유한다 (drizzle/schema.ts). 이 파일은 그 위에 얹는
-- 보안·무결성 계층만 담당한다. 설계 근거: docs/02-data-model.md, docs/07-auth-and-security.md
--
-- 적용 순서: pnpm db:push  →  이 파일 실행
--
-- 전제: auth.uid() 가 public.users.id 를 반환한다.
--       Auth.js 세션을 Supabase JWT 로 브리지해 sub 에 users.id 를 넣는다.

-- ─────────────────────────────────────────────────────────────
-- 1. 헬퍼
-- ─────────────────────────────────────────────────────────────

-- 방 참가자 판정. RLS 정책 대부분이 이 함수를 탄다.
-- room_members(room_id, user_id) PK 인덱스를 사용하므로 구독 지연에 영향이 거의 없다.
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- 방에서의 역할 보유 여부.
create or replace function public.has_room_role(p_room_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and user_id = auth.uid()
      and role::text = any(p_roles)
  );
$$;

-- 판이 끝났는지. 손패 공개 시점 판정에 쓴다.
create or replace function public.is_round_ended(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rounds
    where id = p_round_id and status <> 'playing'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. RLS 활성화
-- ─────────────────────────────────────────────────────────────

alter table public.users         enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
alter table public.rounds        enable row level security;
alter table public.bet_actions   enable row level security;
alter table public.chip_ledger   enable row level security;
alter table public.buy_ins       enable row level security;
alter table public.hand_records  enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3. 정책
-- ─────────────────────────────────────────────────────────────

-- users: 본인 + 같은 방에 있는 사람만 보인다.
create policy users_select on public.users for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.room_members me
      join public.room_members other on other.room_id = me.room_id
      where me.user_id = auth.uid() and other.user_id = public.users.id
    )
  );

create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- groups
create policy groups_select on public.groups for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.group_members
      where group_id = public.groups.id and user_id = auth.uid()
    )
  );

create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());

create policy groups_update_owner on public.groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy group_members_select on public.group_members for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_members mine
      where mine.group_id = public.group_members.group_id and mine.user_id = auth.uid()
    )
  );

-- rooms: 참가자만 조회. 코드로 찾는 입장 경로는 Server Action(service role)이 담당한다.
-- 코드 조회를 클라이언트에 열면 코드 무차별 대입으로 방 목록이 새어나간다.
create policy rooms_select on public.rooms for select to authenticated
  using (public.is_room_member(id));

create policy rooms_insert on public.rooms for insert to authenticated
  with check (host_id = auth.uid());

create policy rooms_update_host on public.rooms for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

-- room_members
create policy room_members_select on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

create policy room_members_insert on public.room_members for insert to authenticated
  with check (user_id = auth.uid() or public.has_room_role(room_id, array['host']));

create policy room_members_update on public.room_members for update to authenticated
  using (public.has_room_role(room_id, array['host']))
  with check (public.has_room_role(room_id, array['host']));

-- rounds: 조회는 참가자, 변경은 host/dealer
create policy rounds_select on public.rounds for select to authenticated
  using (public.is_room_member(room_id));

create policy rounds_insert on public.rounds for insert to authenticated
  with check (public.has_room_role(room_id, array['host', 'dealer']));

create policy rounds_update on public.rounds for update to authenticated
  using (public.has_room_role(room_id, array['host', 'dealer']))
  with check (public.has_room_role(room_id, array['host', 'dealer']));

-- bet_actions: 본인 제출, 승인·정정은 host/dealer
create policy bet_actions_select on public.bet_actions for select to authenticated
  using (public.is_room_member(room_id));

create policy bet_actions_insert on public.bet_actions for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.has_room_role(room_id, array['host', 'dealer'])  -- 대리 입력
  );

create policy bet_actions_update on public.bet_actions for update to authenticated
  using (public.has_room_role(room_id, array['host', 'dealer']))
  with check (public.has_room_role(room_id, array['host', 'dealer']));

-- buy_ins: 본인 또는 host/dealer
create policy buy_ins_select on public.buy_ins for select to authenticated
  using (public.is_room_member(room_id));

create policy buy_ins_insert on public.buy_ins for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.has_room_role(room_id, array['host', 'dealer'])
  );

-- chip_ledger: 조회만 열고 쓰기는 전부 서버(service role) 경로로 막는다.
-- 칩 생성은 게임 규칙 판정의 결과여야 하며, 클라이언트가 직접 만들 수 있으면 안 된다.
create policy chip_ledger_select on public.chip_ledger for select to authenticated
  using (public.is_room_member(room_id));
-- INSERT/UPDATE/DELETE 정책 없음 → authenticated 는 쓰기 불가 (service role 은 RLS 우회)

-- hand_records: 본인은 항상, 타인은 판 종료 후에만
create policy hand_records_select on public.hand_records for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_round_ended(round_id)
      and exists (
        select 1 from public.rounds r
        where r.id = public.hand_records.round_id and public.is_room_member(r.room_id)
      )
    )
  );

create policy hand_records_insert on public.hand_records for insert to authenticated
  with check (user_id = auth.uid());

create policy hand_records_update on public.hand_records for update to authenticated
  using (user_id = auth.uid() and not public.is_round_ended(round_id))
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 4. 원장 불변성
-- ─────────────────────────────────────────────────────────────

-- service role 도 실수로 원장을 고치지 못하게 트리거로 한 번 더 막는다.
-- 정정은 UPDATE 가 아니라 reverted_of 로 원본을 가리키는 새 행 INSERT 로 한다.
create or replace function public.chip_ledger_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'chip_ledger is append-only: use a correction row with reverted_of instead';
end;
$$;

drop trigger if exists chip_ledger_no_update on public.chip_ledger;
create trigger chip_ledger_no_update
  before update or delete on public.chip_ledger
  for each row execute function public.chip_ledger_is_append_only();

-- ─────────────────────────────────────────────────────────────
-- 5. Realtime 채널 권한
-- ─────────────────────────────────────────────────────────────

-- Broadcast/Presence 권한은 realtime.messages 의 RLS 로 강제한다.
-- 클라이언트는 private: true 로 구독하며, 토픽은 'room:{room_id}' 규약을 따른다.
-- 정책은 구독 시 1회 평가 후 커넥션 동안 캐시되므로 메시지마다 DB 를 조회하지 않는다.

create policy realtime_room_read on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'room:%'
    and public.is_room_member(
      nullif(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  );

create policy realtime_room_write on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'room:%'
    and public.is_room_member(
      nullif(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 6. 파생 조회 (랭킹은 테이블로 저장하지 않는다)
-- ─────────────────────────────────────────────────────────────

-- 지표 정의의 소유자는 docs/06-features-ranking-budget-betting.md 이다.
create or replace view public.session_standings
with (security_invoker = true)
as
select
  l.room_id,
  l.user_id,
  coalesce(sum(l.delta), 0)                                        as balance,
  coalesce((select sum(b.amount) from public.buy_ins b
             where b.room_id = l.room_id and b.user_id = l.user_id), 0) as buy_in_total,
  coalesce(sum(l.delta), 0)
    - coalesce((select sum(b.amount) from public.buy_ins b
                 where b.room_id = l.room_id and b.user_id = l.user_id), 0) as net
from public.chip_ledger l
group by l.room_id, l.user_id;
