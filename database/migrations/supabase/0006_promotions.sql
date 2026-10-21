-- 적용됨 (supabase MCP, 2026-07-23, migration name: promotions)
-- promotions: 공지·광고 슬롯 (배너 / 팝업). drizzle schema.ts `promotions` 와 같은 DDL.
--
-- 노출 대상은 모든 방문자지만 조회는 서버 컴포넌트가 kkeutbal_app 롤로 한다 —
-- 브라우저가 PostgREST 로 직접 읽지 않으므로 anon/authenticated 정책은 열지 않는다.

create type promotion_kind as enum ('banner', 'popup');

create table public.promotions (
  id uuid primary key default gen_random_uuid() not null,
  kind promotion_kind not null,
  title text not null,
  body text,
  link_url text,
  link_label text,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 0,
  dismiss_hours integer not null default 24,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promotions
  add constraint promotions_created_by_users_id_fk
  foreign key (created_by) references public.users(id);

create index promotions_kind_active_idx
  on public.promotions using btree (kind, is_active);

-- 정책 없음 = anon/authenticated 전면 차단이 의도된 상태다.
alter table public.promotions enable row level security;

grant all privileges on public.promotions to kkeutbal_app;
