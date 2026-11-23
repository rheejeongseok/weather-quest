// My Doc 뼈대: 헤더·모바일 메뉴·홈(브리핑+서랍 목록)·서랍 전환·홈 화면 앱. 서랍 화면은 각 서랍 모듈이 맡습니다.
import {esc} from '/shell/util.js';
import {configureCloth,bootCloth,mark as markCloth,showView,getProfile,briefWeatherCard,briefOutfitCard} from '/cloth/cloth-view.js';
import {subwaySection,bindSubway,setSubwayTab,getSubwayTab,recentRoutes,openSubwayRoute,setSubwayProfile,briefSubwayCard,paintBriefSubway} from '/subway/subway-view.js';

const app=document.querySelector('#app');
let currentApp=location.hash.startsWith('#subway')?'subway':location.hash.startsWith('#cloth')?'cloth':'home';
const navPaths={weather:'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',outfits:'m8 4-6 4 3 5 3-2v10h8V11l3 2 3-5-6-4c0 4-8 4-8 0Z',feedback:'m15 5 4 4M4 20l4-1 12-12a3 3 0 0 0-4-4L4 15v5Z',history:'M7 3v4m10-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M7 14h3m4 0h3m-10 3h3',route:'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a3 3 0 0 1 3-3h7m2 5v4a3 3 0 0 1-3 3H8',live:'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM4 11h16M8 15h.01M16 15h.01M8 18l-2 3m10-3 2 3',settings:'M4 7h3m4 0h9M4 17h9m4 0h3M7 4v6m4-6v6m2 4v6m4-6v6'};
document.querySelectorAll('#nav [data-view], #subway-nav [data-subway-view]').forEach(a=>{const label=a.textContent;a.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+navPaths[a.dataset.view||a.dataset.subwayView]+'"/></svg><span>'+label+'</span>';});
// My Doc 서랍: Cloth to You(프로필 필요)와 지하철(프로필 없이 바로)
const subwayRoot=document.querySelector('#subway-app');
function markSubwayNav(){const t=getSubwayTab();document.querySelectorAll('#subway-nav [data-subway-view]').forEach(a=>{if(a.dataset.subwayView===t)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
const homeRoot=document.querySelector('#home-app');
let installPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;if(currentApp==='home')renderHome();});
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function installHint(){
 if(isStandalone())return '';
 if(installPrompt)return '<button type="button" class="install-chip" data-install>홈 화면에 추가</button>';
 if(/iphone|ipad|ipod/i.test(navigator.userAgent))return '<p class="install-tip">Safari 공유 버튼 → ‘홈 화면에 추가’로 앱처럼 쓸 수 있어요</p>';
 return '';
}
function renderHome(){
 const profile=getProfile(),now=new Date(),date=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now).reduce((o,p)=>(o[p.type]=p.value,o),{});
 const recent=recentRoutes();
 const tags=list=>`<ul class="drawer-tags">${list.map(t=>`<li>${t}</li>`).join('')}</ul>`;
 homeRoot.innerHTML=`<section class="home"><div class="home-top"><span>Personal drawer</span><span>${esc(`${date.year}.${date.month}.${date.day} ${date.weekday}`)}</span></div>
 <h1 class="home-mark" aria-label="My Doc">MY DOC</h1>
 <div class="home-intro"><p class="home-lead">나에게 필요한 것만 모아 둔 생활 서랍</p>${installHint()}</div>
 <div class="home-section"><span>Today</span><span>Briefing</span></div>
 <div class="brief-grid">${briefWeatherCard()}${briefOutfitCard()}<article class="brief-card" id="brief-subway" style="--drawer:#00A5DE">${briefSubwayCard()}</article></div>
 <div class="home-section"><span>Drawers</span><span>[ 03 ]</span></div>
 <ol class="drawer-list">
  <li class="drawer-row" style="--drawer:#2f5d50"><span class="drawer-no">[ 01 ]</span><div class="drawer-name"><h2>Cloth to You</h2><small>옷차림</small></div>
   <div class="drawer-body"><p>날씨와 내 착용 기록으로, 오늘 나에게 맞는 옷을 찾아 줘요.</p>${tags(['Weather','Outfit','Wear log'])}<p class="drawer-status">${profile?`<b>${esc(profile.nickname)}</b>님 프로필로 쓰는 중`:'닉네임만 정하면 바로 시작해요'}</p></div>
   <div class="drawer-go"><button type="button" class="arrow-button" data-open="cloth">열기 <span aria-hidden="true">→</span></button></div></li>
  <li class="drawer-row" style="--drawer:#00A5DE"><span class="drawer-no">[ 02 ]</span><div class="drawer-name"><h2>Subway</h2><small>지하철</small></div>
   <div class="drawer-body"><p>서울 1~9호선 노선도에서 경로와 탈 열차, 실시간 열차 위치를 봐요.</p>${tags(['Route','Timetable','Live'])}${recent.length?`<div class="drawer-recent">${recent.map((r,i)=>`<button type="button" class="chip" data-home-route="${i}">${r.fav?'★ ':''}${esc(r.from)}${r.via?' → '+esc(r.via):''} → ${esc(r.to)}</button>`).join('')}</div>`:'<p class="drawer-status">프로필 없이 바로 쓸 수 있어요</p>'}</div>
   <div class="drawer-go"><button type="button" class="arrow-button" data-open="subway" data-tab="route">경로 탐색 <span aria-hidden="true">→</span></button><button type="button" class="arrow-button secondary" data-open="subway" data-tab="live">실시간 위치 <span aria-hidden="true">→</span></button></div></li>
  <li class="drawer-row" style="--drawer:#d6455d"><span class="drawer-no">[ 03 ]</span><div class="drawer-name"><h2>Nihongo Quest</h2><small>일본어 공부</small></div>
   <div class="drawer-body"><p>JLPT 단어·문법을 퀘스트처럼 풀고, 모의고사와 오답 노트로 복습해요.</p>${tags(['JLPT','Quest','Mock exam'])}<p class="drawer-status">별도 사이트로 열려요</p></div>
   <div class="drawer-go"><a class="arrow-button button-link" href="https://nihongo-quest-blush.vercel.app/" target="_blank" rel="noopener">열기 <span aria-hidden="true">↗</span></a></div></li>
  <li class="drawer-row is-next"><span class="drawer-no">[ 04 ]</span><div class="drawer-name"><h2>Next drawer</h2><small>준비 중</small></div>
   <div class="drawer-body"><p>자주 찾는 정보나 귀찮은 일이 생기면, 여기에 새 서랍으로 추가해요.</p></div><div class="drawer-go" aria-hidden="true"></div></li>
 </ol></section>`;
 homeRoot.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{if(b.dataset.tab)setSubwayTab(b.dataset.tab);showApp(b.dataset.open);if(b.dataset.view&&getProfile()?.onboarded)showView(b.dataset.view);});
 homeRoot.querySelector('[data-install]')?.addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice.catch(()=>null);installPrompt=null;renderHome();});
 paintBriefSubway();
 homeRoot.querySelectorAll('[data-home-route]').forEach(b=>b.onclick=()=>{const r=recent[Number(b.dataset.homeRoute)];showApp('subway');openSubwayRoute(r);markSubwayNav();});
}
function showApp(name){
 currentApp=['cloth','subway'].includes(name)?name:'home';
 homeRoot.hidden=currentApp!=='home';app.hidden=currentApp!=='cloth';subwayRoot.hidden=currentApp!=='subway';
 if(currentApp==='home')renderHome();
 document.querySelectorAll('[data-app]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.app===currentApp)));
 document.querySelector('#subway-nav').hidden=currentApp!=='subway';markCloth();
 document.querySelector('#header-section').textContent={home:'',cloth:'Cloth to You',subway:'지하철'}[currentApp];
 document.querySelectorAll('[data-menu-app]').forEach(b=>{if(b.dataset.menuApp===currentApp)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 if(currentApp==='subway'){if(!subwayRoot.firstChild){subwayRoot.innerHTML=subwaySection();bindSubway();}markSubwayNav();}
 window.scrollTo({top:0,behavior:'instant'});
}
document.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>showApp(b.dataset.app));
window.addEventListener('mydoc:open',e=>showApp(e.detail));
const menu=document.querySelector('#mobile-menu'),menuBackdrop=document.querySelector('#menu-backdrop'),menuToggle=document.querySelector('#menu-toggle');
function setMenu(open){menu.hidden=!open;menuBackdrop.hidden=!open;menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'전체 메뉴 닫기':'전체 메뉴 열기');document.body.classList.toggle('menu-open',open);if(open)menu.focus({preventScroll:true});else if(menu.contains(document.activeElement))menuToggle.focus();}
menuToggle.onclick=()=>setMenu(menu.hidden);
menuBackdrop.onclick=()=>setMenu(false);
menu.querySelectorAll('[data-menu-close],[data-menu-link]').forEach(b=>b.addEventListener('click',()=>setMenu(false)));
menu.querySelectorAll('[data-menu-app]').forEach(b=>b.onclick=()=>{setMenu(false);showApp(b.dataset.menuApp);});
document.querySelector('#menu-switch').onclick=()=>{setMenu(false);document.querySelector('#switch').click();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden)setMenu(false);});
document.querySelector('.brand').onclick=e=>{e.preventDefault();showApp('home');};
document.querySelectorAll('#subway-nav [data-subway-view]').forEach(a=>a.onclick=e=>{e.preventDefault();setSubwayTab(a.dataset.subwayView);markSubwayNav();window.scrollTo({top:0,behavior:'instant'});});
// 서랍과 이어 붙이기: 프로필이 바뀌면 지하철 저장분과 메뉴의 프로필 표시도 함께 바꿉니다.
configureCloth({isActive:()=>currentApp==='cloth',open:name=>showApp(name),refreshHome:()=>{if(currentApp==='home')renderHome();},onProfile:p=>{setSubwayProfile(p);const mn=document.querySelector('#menu-nickname');if(mn)mn.textContent=p?p.nickname:'프로필 없음';const ms=document.querySelector('#menu-switch');if(ms)ms.textContent=p?'프로필 전환':'프로필 선택';}});
showApp(currentApp);
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{/* 설치 실패해도 앱은 그대로 동작 */});
bootCloth();
