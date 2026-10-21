-- Vision 설정은 서버 관리자 기능이다. API 키는 환경변수에만 보관하며,
-- 브라우저 역할은 provider·model·enabled 설정에도 직접 접근하지 못한다.

begin;

alter table public.vision_settings enable row level security;

revoke all privileges on public.vision_settings from public, anon, authenticated;
grant select, insert, update, delete on public.vision_settings to kkeutbal_app;

commit;
