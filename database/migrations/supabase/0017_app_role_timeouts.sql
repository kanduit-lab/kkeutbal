-- 앱 롤에 서버 측 회수 장치를 건다.
--
-- 2026-07-27 전면 장애의 실제 경로: Server Action 이 트랜잭션 도중 재개되지 못하자
-- 그 백엔드가 idle in transaction 으로 11시간 남았고, 방 advisory lock 을 계속 쥐었다.
-- transaction mode pooler(6543) 는 postgres-js 의 startup connection 파라미터를
-- 조용히 버리므로(실측: statement_timeout 이 그대로 2min) 앱에서는 이 값을 못 건다.
-- 회수는 서버가 해야 하고, 롤 설정은 pooler 를 거쳐도 백엔드에 그대로 적용된다.
--
-- 값 근거:
-- - statement_timeout   앱의 모든 쿼리는 단건 조회·삽입이라 15s 면 정상 경로에 여유가 크다.
-- - lock_timeout        pg_advisory_xact_lock 대기 상한. 락을 쥔 트랜잭션은 100ms 안에 끝나므로
--                       5s 를 넘겼다는 건 상대가 이미 비정상이라는 뜻이다. 무한 대기 대신 실패시킨다.
-- - idle_in_transaction_session_timeout
--                       열린 트랜잭션을 방치한 세션을 죽인다. 이 장애가 재현 불가해지는 핵심 값.
--
-- 되돌리려면: alter role kkeutbal_app reset statement_timeout; (각 항목마다)
-- 마이그레이션은 postgres 롤로 돌기 때문에 이 설정의 영향을 받지 않는다.

begin;

alter role kkeutbal_app set statement_timeout = '15s';
alter role kkeutbal_app set lock_timeout = '5s';
alter role kkeutbal_app set idle_in_transaction_session_timeout = '15s';

commit;
