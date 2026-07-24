# 데이터베이스 마이그레이션 런북

| Field | Value |
|-------|-------|
| Type | runbook |
| Audience | operators / maintainers |
| Status | active |
| Source of truth | this document (DB 적용 순서·검증·복구) |
| Last reviewed | 2026-07-24 |

## Purpose

Drizzle이 소유하는 테이블·인덱스·제약과 Supabase SQL이 소유하는 RLS·권한·원장 트리거를
새 DB와 기존 DB에 같은 순서로 적용한다. 스키마 정본은 `drizzle/schema.ts`다.

## Preconditions

- 대상 Supabase 프로젝트와 백업 시점을 확인한다.
- DDL 권한이 있는 관리자 연결 문자열을 준비한다. 앱 런타임 롤 `kkeutbal_app`은 DDL 용도가 아니다.
- 런타임 앱을 중지하거나 쓰기 트래픽이 없는 유지보수 창을 잡는다.
- 저장소의 `drizzle/migrations/meta/_journal.json`과 SQL 파일이 함께 배포 대상에 포함됐는지 확인한다.

## Inputs And Access

- 로컬 또는 운영 셸의 `DATABASE_URL`: 마이그레이션에만 쓰는 관리자 연결 문자열
- Supabase SQL Editor 또는 동등한 관리자 SQL 실행 경로
- `kkeutbal_app` 롤 비밀번호: 저장소에 기록하지 않는다

## Procedure

### 기존 DB 업그레이드

1. 대상 DB를 백업하고 현재 Drizzle 이력을 조회한다.

   ```sql
   select * from drizzle.__drizzle_migrations order by created_at;
   ```

2. 저장소 루트에서 Drizzle DDL을 순서대로 적용한다.

   ```powershell
   pnpm db:migrate
   ```

   live DB는 2026-07-24 기준 `0000`~`0016` 이력이 동기화되어 있다. 전역 가상 크레딧과
   게임·credit FK 인덱스, credit 안전 정수 제약, 공정 딜 라운드 상태 테이블을 포함하는 버전은
   `0016`까지 적용하므로 같은 커밋에서
   재실행하면 새 마이그레이션만 적용된다.

3. Supabase SQL Editor에서 `supabase/migrations/0008_rate_limit_buckets_rls.sql`,
   `0009_virtual_credits_security.sql`, `0010_credit_posting_hardening.sql`,
   `0011_room_credit_lifecycle.sql`, `0012_room_credit_reversals.sql`,
   `0013_admin_room_credit_settlement.sql`, `0014_fair_round_security.sql`,
   `0015_fair_reveal_immutability.sql`을 번호순으로 적용한다.
   0009는 **Drizzle** `0012` credit DDL 뒤에만 실행하며 credit 테이블의 직접 DML을 회수하고
   posting primitive·append-only 트리거를 만든다. 0010은 앱 롤의 generic posting 실행 권한을
   회수하고 관리자 조정 전용 RPC를 부여한다. 0011·0012는 account-credit 방의 buy-in 잠금,
   취소 release, 종료 정산 전용 RPC를 부여한다. 0013은 호스트를 잃은 account-credit 방을
   관리자 강제 정산할 때 DB에서 관리자 권한을 재검증한다. 0014는 Drizzle 0016의 공정 딜 상태
   테이블을 server-only로 잠그고, 0015는 종료 뒤 full reveal 행의 수정·삭제를 막는다.

4. 아래 Verification을 수행한 뒤 앱을 다시 연다.
5. 관리자 계정으로 `/admin`에 한 번 로그인해 `0011` 이전 게스트 토큰 원문을
   `guest_tokens.code_hash` HMAC으로 전환한다.

### 새 DB 구성

1. 관리자 SQL로 `kkeutbal_app` 로그인 롤을 만들고 `BYPASSRLS`를 부여한다. 비밀번호는 운영
   시크릿 저장소에서 주입한다.
2. 관리자 `DATABASE_URL`로 `pnpm db:migrate`를 실행한다.
3. `supabase/migrations/0007_database_hardening.sql`을 적용한다. 이 파일이 현재 스키마의
   RLS·최소 DML 권한·append-only 트리거 baseline이다.
4. 아래 Verification을 수행한다.

`supabase/migrations/0001`~`0006`은 이미 적용된 과거 변화 기록이다. 제거된 옛 테이블을
참조하므로 최신 Drizzle 스키마 위에 전부 재생하지 않는다.

## Verification

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'rounds_one_playing_per_room_uq',
    'bet_actions_round_seq_uq',
    'chip_ledger_reverted_of_uq',
    'buy_ins_reverted_of_uq'
  )
order by indexname;

select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'kkeutbal_app'
order by table_name, privilege_type;

select p.proname,
       has_function_privilege('kkeutbal_app', p.oid, 'EXECUTE') as app_can_execute
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'ensure_credit_account',
    'admin_adjust_credit',
    'lock_room_credit_buy_in',
    'release_room_credit_buy_in',
    'settle_room_credits',
    'post_credit_transaction'
  )
order by p.proname;
```

추가로 `rate_limit_buckets`, `round_participants`, `credit_accounts`, `credit_transactions`,
`credit_entries`, `room_credit_locks`, `round_fairness`, `round_fairness_participants`,
`round_fairness_reveals`가 존재하고 `chip_ledger.delta`, `rounds.pot`이 `bigint`인지
확인한다. `kkeutbal_app`은 credit 테이블에 SELECT만, `ensure_credit_account`,
`admin_adjust_credit`, `lock_room_credit_buy_in`, `release_room_credit_buy_in`,
`settle_room_credits`에는 EXECUTE를 가져야 한다. generic `post_credit_transaction`에는 EXECUTE가
없어야 하며 `anon`·`authenticated`에는 앱 테이블 권한이 없어야 한다.

## Rollback

이 저장소는 자동 down migration을 제공하지 않는다. 실패 시 앱을 열지 말고 백업으로 복원한 뒤
원인을 수정해 새 forward migration을 만든다. 이미 데이터가 쓰인 상태에서 컬럼을 축소하거나
마이그레이션 SQL을 역순으로 임의 실행하지 않는다.

## Failure Modes

- `permission denied`: 앱 롤 URL로 DDL을 실행했다. 관리자 연결 문자열로 다시 실행한다.
- `relation already exists`: Drizzle 이력과 실제 스키마가 어긋났다. SQL을 건너뛰지 말고
  `drizzle.__drizzle_migrations`와 대상 객체를 대조한다.
- bigint 전환이 view 의존성으로 실패: `0008_flippant_amphibian.sql`이
  `session_standings`를 `security_invoker` 옵션 그대로 재생성하는 버전인지 확인한다.
- 레거시 바이인 백필이 append-only 트리거에 막힘: `0009_perfect_molly_hayes.sql`의 트리거
  비활성화 구간을 분리 실행하지 않는다. 전체 파일을 한 트랜잭션으로 적용해야 자동 복구된다.
- unique/check 제약 추가 실패: 기존 데이터가 새 불변식을 위반한다. 위반 행을 백업·분석한 뒤
  정정 행으로 복구하고 마이그레이션을 재실행한다.
- 앱 로그인 전체 실패: `rate_limit_buckets` DDL 또는 0008 권한 적용이 빠졌는지 확인한다.
- 가상 크레딧 조회·지급·방 정산 실패: Drizzle `0012` 뒤에 Supabase 0009~0012를 적용했는지,
  `credit_accounts` 직접 DML이나 generic `post_credit_transaction`이 아니라 목적별 RPC 경로를 쓰는지
  확인한다.

## Contacts Or Owners

저장소 관리자와 Supabase 프로젝트 소유자가 공동 승인한다.

## Change History

- 2026-07-24: live DB에 `0006`~`0011`, 보안 SQL `0007`~`0008` 적용. Drizzle 이력 12건
  동기화 및 view/append-only 트리거 의존성 보정.
- 2026-07-24: Drizzle 순차 마이그레이션과 Supabase 보안 baseline의 적용 경계를 문서화.
- 2026-07-24: `0012` 전역 가상 크레딧 DDL과 0009 posting 함수·권한 경계를 추가.
- 2026-07-24: `0013` FK 조회 인덱스, `0014` credit 안전 정수 제약, 0010 관리자 전용 credit RPC를
  Supabase와 Drizzle 이력에 함께 적용.
- 2026-07-24: `0015` credit 거래/lock의 남은 FK 역방향 조회 인덱스를 추가.
- 2026-07-24: Supabase 0011·0012로 account-credit 방의 buy-in lock·취소 release·종료 정산 RPC와
  앱 롤 실행 권한을 추가. 원격 rollback 트랜잭션으로 lifecycle 보존식을 확인.
- 2026-07-24: Drizzle 0016의 공정 딜 라운드 상태·참가자 snapshot·reveal 테이블과 Supabase 0014
  server-only RLS/권한을 추가. 원격 rollback 트랜잭션으로 FK·phase 초기 상태를 확인.
- 2026-07-24: Supabase 0013으로 관리자 강제 정산도 account-credit lock을 release하게 보완하고,
  비참가 관리자 rollback lifecycle로 권한·정산 귀속을 확인.
- 2026-07-24: Supabase 0015로 `round_fairness_reveals` full reveal의 update/delete를 차단했다.
