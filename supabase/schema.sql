-- Supabase SQL Editor에서 전체 실행하세요. 기존 데이터는 삭제하지 않습니다.
create table if not exists public.wq_profiles (
 id uuid primary key,
 nickname text not null check (char_length(nickname) between 1 and 24),
 nkey text unique not null,
 data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.wq_records (
 user_id uuid not null references public.wq_profiles(id) on delete cascade,
 id text not null,
 data jsonb not null,
 created_at timestamptz not null default now(),
 primary key (user_id,id)
);
alter table public.wq_profiles enable row level security;
alter table public.wq_records enable row level security;
revoke all on public.wq_profiles, public.wq_records from anon, authenticated;
grant all on public.wq_profiles, public.wq_records to service_role;

-- 한 파일의 모든 기록을 하나의 트랜잭션에서 병합합니다.
create or replace function public.wq_import_records(p_user_id uuid,p_records jsonb)
returns integer language plpgsql security invoker set search_path = public
as $$
declare added integer;
begin
 insert into public.wq_records(user_id,id,data)
 select p_user_id, item->>'id',item from jsonb_array_elements(p_records) as item
 on conflict(user_id,id) do nothing;
 get diagnostics added = row_count;
 return added;
end;
$$;
revoke all on function public.wq_import_records(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wq_import_records(uuid,jsonb) to service_role;
