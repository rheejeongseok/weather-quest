-- 기존(싱가포르) 프로젝트 SQL Editor에서 실행합니다. 읽기 전용입니다.
-- 결과 migration_sql 셀 전체를 복사하여 새 서울 프로젝트에서 실행합니다.
-- 새 프로젝트에는 먼저 schema.sql을 실행해야 합니다. 프로필·기록·삭제 표시를 모두 포함합니다.
select 'begin;' || E'\n' ||
 coalesce((select string_agg(format(
  'insert into public.wq_profiles(id,nickname,nkey,data,created_at) values(%L::uuid,%L,%L,%L::jsonb,%L::timestamptz) on conflict(id) do update set nickname=excluded.nickname,nkey=excluded.nkey,data=excluded.data;',
  id,nickname,nkey,data::text,created_at::text),E'\n' order by created_at,id) from public.wq_profiles),'') || E'\n' ||
 coalesce((select string_agg(format(
  'insert into public.wq_records(user_id,id,data,created_at) values(%L::uuid,%L,%L::jsonb,%L::timestamptz) on conflict(user_id,id) do update set data=excluded.data;',
  user_id,id,data::text,created_at::text),E'\n' order by created_at,user_id,id) from public.wq_records),'') ||
 E'\ncommit;' as migration_sql;
