# Supabase + Vercel 설정

## 1. Supabase 테이블 만들기

1. https://supabase.com/dashboard/project/gkvosqqmynfgiopaqfei 에 접속합니다.
2. 왼쪽 **SQL Editor** → **New query**를 선택합니다.
3. 저장소의 `supabase/schema.sql` 내용을 전부 복사해 붙여넣습니다.
4. **Run**을 눌러 실행합니다. 테이블 `wq_profiles`, `wq_records`와 병합 함수 `wq_import_records`가 만들어집니다.
5. Table Editor에서 두 테이블을 확인합니다. RLS는 활성화하되 브라우저 익명 접근 정책은 만들지 않습니다. Vercel 서버가 secret key로 접근합니다.

기존 테이블과 기록을 삭제하는 SQL은 없습니다. 이미 같은 이름의 다른 구조가 있다면 실행 전에 확인하세요.

## 2. Supabase 서버용 키 확인

프로젝트 **Settings → API Keys**에서 **Secret keys**의 서버용 키(`sb_secret_...`)를 복사합니다. 새 키가 없다면 생성합니다. 구형 키 화면에서는 **Legacy API Keys → service_role** 키도 사용할 수 있습니다. `anon` 또는 publishable 키는 사용하지 마세요.

이 키는 GitHub 파일이나 채팅에 붙이지 말고 다음 Vercel 환경변수 입력란에만 넣습니다.

## 3. Vercel 환경변수

https://vercel.com/jung-seok-lee-s-projects/weather-quest → **Settings → Environment Variables**에서 다음 두 개를 등록합니다.

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | `https://gkvosqqmynfgiopaqfei.supabase.co` |
| `SUPABASE_SECRET_KEY` | 앞에서 복사한 secret key 또는 service_role 키 |

Production과 Preview 환경을 선택합니다. 로컬에서도 같은 DB를 쓰려면 `.env.local`에 같은 변수를 넣고 `node --env-file=.env.local server.mjs`로 실행합니다. 이 파일은 Git에서 제외됩니다.

## 4. GitHub 연결과 배포

Vercel 프로젝트의 **Settings → Git**에서 `rheejeongseok/weather-quest`가 연결되어 있는지 확인합니다.

**Settings → Build and Deployment**:

- Framework Preset: **Other**
- Root Directory: 저장소 루트(비워 두기)
- Node.js Version: **24.x**
- Build Command / Output Directory: `vercel.json` 설정 사용 (`node scripts/build.mjs` / `dist`)

환경변수 저장 후 **Deployments → 최신 배포 → Redeploy**를 실행합니다. 환경변수 변경은 기존 배포에 소급 적용되지 않습니다. GitHub push 시 자동 배포하도록 연결해 두면 이후 수정도 자동 반영됩니다.

## 5. 동기화 확인

1. 배포 주소에서 새 닉네임을 입력하고 초기 설정을 저장합니다.
2. 실제 입은 옷과 피드백을 한 번 저장합니다.
3. 다른 기기 또는 시크릿 창에서 같은 닉네임을 입력합니다.
4. 설정과 피드백이 보이는지 확인합니다.
5. Supabase Table Editor에서도 기록을 확인합니다.

DB 연결 오류라면 SQL 실행 여부, 두 환경변수, 서버용 키 종류, 환경변수 저장 후 재배포 여부를 확인하세요. 실제 연결 검증은 SQL과 환경변수가 설정된 후에 가능합니다.
