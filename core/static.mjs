// 서버와 브라우저가 함께 쓰는 모듈: 브라우저 주소 → 저장소 경로.
// 로컬 서버(core/handler.mjs)는 이 표로 응답하고, 배포 빌드(scripts/build.mjs)는 이 표대로 dist/에 복사합니다.
export const SHARED_MODULES={
 '/cloth/lib.mjs':'apps/cloth/lib.mjs',
 '/cloth/comfort-model.mjs':'apps/cloth/comfort-model.mjs',
 '/cloth/forecast.mjs':'apps/cloth/forecast.mjs',
 '/subway/subway.mjs':'apps/subway/subway.mjs'
};
