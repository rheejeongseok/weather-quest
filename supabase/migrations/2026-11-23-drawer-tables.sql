-- My Doc: 서랍별 데이터 테이블 추가 + 기존 데이터 복사 (2026-11-23)
-- Supabase SQL Editor에 전체를 붙여 넣고 한 번 실행하세요. 여러 번 실행해도 안전합니다.
-- 기존 wq_profiles.data 칸은 지우지 않습니다(되돌릴 수 있도록 그대로 둠).

begin;

-- 1) 옷차림 설정: 프로필당 한 줄
create table if not exists public.wq_cloth_settings (
 profile_id uuid primary key references public.wq_profiles(id) on delete cascade,
 data jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);

-- 2) 지하철 저장분(즐겨찾기·최근 경로·경로 기준·실시간 노선): 프로필당 한 줄
create table if not exists public.wq_subway_saved (
 profile_id uuid primary key references public.wq_profiles(id) on delete cascade,
 data jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);

-- 3) 서버 키(service_role)만 접근
alter table public.wq_cloth_settings enable row level security;
alter table public.wq_subway_saved enable row level security;
revoke all on public.wq_cloth_settings, public.wq_subway_saved from anon, authenticated;
grant all on public.wq_cloth_settings, public.wq_subway_saved to service_role;

-- 4) 기존 wq_profiles.data에서 복사(이미 새 테이블에 있으면 건너뜀)
insert into public.wq_cloth_settings(profile_id,data)
select id, data - 'subway'
from public.wq_profiles
where data - 'subway' <> '{}'::jsonb
on conflict (profile_id) do nothing;

insert into public.wq_subway_saved(profile_id,data)
select id, data->'subway'
from public.wq_profiles
where jsonb_typeof(data->'subway') = 'object'
on conflict (profile_id) do nothing;

commit;

-- 5) 확인용: 프로필 수와 새 테이블에 옮겨진 수
select
 (select count(*) from public.wq_profiles) as profiles,
 (select count(*) from public.wq_cloth_settings) as cloth_settings,
 (select count(*) from public.wq_subway_saved) as subway_saved;
