-- drizzle 원장 동기화 전용. 앱 스키마는 건드리지 않는다.
--
-- 배경: `users.is_managed`(drizzle `0020_lying_leader`)는 supabase 쪽
-- `add_users_is_managed`(20260727135354)로 먼저 적용됐고 `drizzle.__drizzle_migrations`에는
-- 기록이 남지 않았다. 디스크 `_journal.json`은 21건(idx 0~20)인데 원장은 20건(idx 19까지)이라,
-- 이 DB에 `drizzle-kit migrate`를 돌리면 0020을 다시 실행한다. drizzle이 생성하는 DDL에는
-- `IF NOT EXISTS`가 없으므로 `column "is_managed" of relation "users" already exists`로 죽는다.
-- 새 환경 프로비저닝과 CI 배포를 막는 지뢰라서, 이미 반영된 사실만 원장에 채워 넣는다.
-- `drizzle_migration_ledger_*_sync` 선례(0012·0013·0014·0015·0017)와 같은 성격의 파일이다.
--
-- 값 근거:
-- - hash        drizzle이 기록하는 값 = `drizzle/migrations/0020_lying_leader.sql` 원문의 sha256.
--               디스크 0000~0019 파일 20개의 sha256이 원장 20행(id 1~20)과 순서까지 그대로
--               일치하는 것을 확인했다. `.gitattributes`가 이 경로를 `eol=lf`로 고정하므로
--               체크아웃 환경이 달라도 바이트가 같다.
-- - created_at  `_journal.json` idx 20의 `when` 값. 원장의 created_at은 지금까지 전부 해당
--               journal entry의 `when`과 같다. drizzle은 마지막 행의 created_at만 보고 적용
--               여부를 판단하므로, 0020을 건너뛰게 만드는 실제 키가 이 값이다.
--
-- 재실행 안전:
-- - 같은 hash 또는 같은 created_at 행이 이미 있으면 넣지 않는다. `__drizzle_migrations`에는
--   hash unique 제약이 없어서 `on conflict`로는 막지 못한다.
-- - `users.is_managed`가 없는 DB에서는 아무것도 넣지 않는다. 그런 DB는 drizzle이 0020을 정상
--   적용해야 하고, 원장만 앞서 나가면 컬럼이 영영 생기지 않는다.
--
-- 되돌리려면: delete from drizzle.__drizzle_migrations
--             where hash = '31b402344670f497aa7b8934886ac792451d82a4ea69caef4191dbb53ddb4559';

begin;

-- drizzle이 아직 한 번도 돌지 않은 DB에서도 이 파일이 파싱 단계에서 죽지 않게 한다.
-- 형태는 `drizzle_migration_ledger_baseline`이 만든 것과 동일하다.
create schema if not exists drizzle;

create table if not exists drizzle.__drizzle_migrations (
  id serial primary key,
  hash text not null,
  created_at bigint
);

insert into drizzle.__drizzle_migrations (hash, created_at)
select '31b402344670f497aa7b8934886ac792451d82a4ea69caef4191dbb53ddb4559', 1785159109562
where exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'is_managed'
  )
  and not exists (
    select 1
    from drizzle.__drizzle_migrations
    where hash = '31b402344670f497aa7b8934886ac792451d82a4ea69caef4191dbb53ddb4559'
       or created_at = 1785159109562
  );

commit;
