# Supabase 싱가포르 → 서울 이전

지역만 수정하는 기능은 없습니다. 서울 `ap-northeast-2`에 새 프로젝트를 생성한 뒤 DB와 연결 환경변수를 옮깁니다. 실제 기존 프로젝트와 Vercel 환경변수는 이 작업에서 변경하지 않았습니다.

## 이 앱의 소규모 DB 이전 절차

1. Supabase에서 새 프로젝트를 만듭니다. 일반 APAC 대신 특정 지역 **Northeast Asia (Seoul)**을 선택합니다.
2. 새 프로젝트 SQL Editor에서 저장소의 `supabase/schema.sql`을 실행합니다.
3. 이전하는 동안 기록·설정 수정은 잠시 멈춥니다. 여러 사람이 쓰는 서비스라면 쓰기 차단이나 점검 모드가 별도로 필요합니다.
4. 기존 싱가포르 프로젝트 SQL Editor에서 `supabase/export-migration.sql`을 실행합니다. 읽기 전용이며 프로필, 설정, 모든 기록과 삭제 표시를 내보냅니다.
5. 결과의 `migration_sql` 셀 값 전체를 복사해 파일로도 보관한 뒤, 새 서울 프로젝트 SQL Editor에 붙여넣어 실행합니다. CSV 헤더나 감싸는 따옴표를 추가하지 말고 셀의 SQL 본문을 사용하세요. 새 프로젝트는 이 앱에 사용하는 테이블이 비어 있는 상태를 전제로 합니다.
6. 두 프로젝트에서 `select count(*) from public.wq_profiles; select count(*) from public.wq_records;`로 건수를 비교합니다. 닉네임·설정·삭제 표시도 확인합니다.
7. Vercel 프로젝트 환경변수의 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 새 프로젝트 값으로 교체합니다. 사용하는 Production/Preview 환경에 각각 적용하고 재배포합니다. 키는 소스나 채팅에 보내지 않습니다.
8. 같은 닉네임으로 프로필·설정·기록을 확인하고 새 기록 저장·수정·삭제도 확인합니다. 확인하기 전에는 기존 프로젝트를 삭제하지 않습니다. 문제가 있으면 기존 환경변수로 되돌려 재배포할 수 있습니다.

사이트의 JSON 내보내기/가져오기는 한 닉네임의 기록 백업용입니다. 프로필 전체 이전을 대신하지 않습니다. 위 SQL은 현재 이 앱의 두 테이블만 옮깁니다. 향후 Auth/Storage/Edge Functions를 추가하면 별도 이전이 필요합니다. DB가 커지면 SQL Editor 복사 대신 공식 CLI dump/restore 절차를 사용하세요.

## Vercel 실행 지역도 확인

함수 지역이 `iad1`이면 미국에서 DB를 호출합니다. 서울 DB로 옮길 때 Vercel Settings의 Function Region도 Seoul(`icn1`)로 맞추거나 `vercel.json`에 `"regions": ["icn1"]`를 지정하고 새 배포를 만들어 확인할 수 있습니다. 현재 저장소의 실행 지역을 자동으로 바꾸지는 않았습니다.

공식 참고:

- [Supabase 지역 변경](https://supabase.com/kb/troubleshooting/change-project-region-eWJo5Z)
- [지원 지역](https://supabase.com/docs/guides/platform/regions)
- [Supabase 프로젝트 간 이전](https://supabase.com/docs/guides/platform/migrating-within-supabase)
- [Vercel 함수 실행 지역](https://vercel.com/docs/functions/configuring-functions/region)
