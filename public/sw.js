// My Doc 서비스 워커: 화면 파일은 네트워크 우선(실패하면 저장본), API는 항상 네트워크.
// 코드가 바뀌어도 다음 접속에서 바로 새 파일을 받고, 오프라인일 때만 저장본을 씁니다.
const CACHE = 'mydoc-v2';
const SHELL = ['/', '/styles/base.css', '/styles/shell.css', '/styles/cloth.css', '/styles/subway.css', '/shell/main.js', '/shell/util.js', '/cloth/cloth-view.js', '/cloth/lib.mjs', '/cloth/comfort-model.mjs', '/cloth/forecast.mjs', '/subway/subway-view.js', '/subway/subway.mjs', '/subway/subway-data.json', '/favicon.svg', '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request.mode === 'navigate' ? '/' : request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request.mode === 'navigate' ? '/' : request).then(hit => hit || Response.error()))
  );
});
