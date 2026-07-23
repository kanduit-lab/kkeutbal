-- guest_tokens: 게스트 초대 토큰 (drizzle 0002_dizzy_exiles 가 테이블 생성).
-- 토큰 코드는 로그인 자격이므로 anon/authenticated 에게 어떤 정책도 열지 않는다.
-- 읽기·쓰기는 전용 롤 kkeutbal_app(bypassrls) 을 통한 Server Action 만 한다.

alter table public.guest_tokens enable row level security;

-- 정책 없음 = anon/authenticated 전면 차단이 의도된 상태다.
