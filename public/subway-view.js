// 지하철 탭: 실제 역 위치로 그린 노선도에서 역을 골라 출발·경유·도착을 정하고, 경로와 출발역의 다음 열차를 보여줍니다.
import {findRouteVia,searchStations,stationName,placeTrains,approaching,laneName,travelMinutes} from '/subway.mjs';

const STORE_KEY='cty-subway';
const ROLES={from:'출발',via:'경유',to:'도착'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=null,loading=null,loadError='';
let state={tab:'route',mobileMode:'map',favorites:[],liveLine:'',liveView:'strip',timeMode:'now',time:'',from:'',via:'',to:'',mode:'fastest',result:null,error:'',recent:[]};
try{const saved=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');Object.assign(state,saved,{result:null,error:'',timeMode:'now',time:''});}catch{/* 저장소를 못 쓰면 기본값 */}
const save=()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify({tab:state.tab,mobileMode:state.mobileMode,favorites:state.favorites,liveLine:state.liveLine,liveView:state.liveView,from:state.from,via:state.via,to:state.to,mode:state.mode,recent:state.recent}));}catch{/* 무시 */}scheduleSync();};

// ---------- 프로필 동기화: Cloth to You 프로필(닉네임)이 있으면 서버에 저장 ----------
let account=null,syncTimer=0,lastSynced='';
const sameRoute=(a,b)=>a.from===b.from&&(a.via||'')===(b.via||'')&&a.to===b.to;
const mergeRoutes=(first,second,max)=>{const out=[];for(const r of [...(first||[]),...(second||[])])if(r?.from&&r?.to&&!out.some(o=>sameRoute(o,r)))out.push({from:r.from,via:r.via||'',to:r.to});return out.slice(0,max);};
const syncPayload=()=>({recent:state.recent,favorites:state.favorites,mode:state.mode,liveLine:state.liveLine});
function scheduleSync(){
 if(!account)return;const body=JSON.stringify(syncPayload());if(body===lastSynced)return;
 clearTimeout(syncTimer);syncTimer=setTimeout(()=>{const id=account?.id;if(!id)return;fetch('/api/subway/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:id,subway:JSON.parse(body)})}).then(r=>{if(r.ok&&account?.id===id)lastSynced=body;}).catch(()=>{/* 다음 변경 때 다시 시도 */});},800);
}
function paintProfileLabel(){const el=document.querySelector('#subway-profile');if(el)el.textContent=account?`${account.nickname} 프로필에 저장 중`:'이 기기에만 저장';}
export function setSubwayProfile(profile){
 if((profile?.id||null)===(account?.id||null))return;
 account=profile?{id:profile.id,nickname:profile.nickname}:null;lastSynced='';
 if(account){
  const saved=profile.subway||{};
  state.recent=mergeRoutes(saved.recent,state.recent,8);state.favorites=mergeRoutes(saved.favorites,state.favorites,12);
  if(saved.mode)state.mode=saved.mode;if(saved.liveLine)state.liveLine=saved.liveLine;
  lastSynced=JSON.stringify({recent:saved.recent||[],favorites:saved.favorites||[],mode:saved.mode||state.mode,liveLine:saved.liveLine||state.liveLine});
  save();
 }
 paintProfileLabel();
 if(document.querySelector('#subway-panel'))paintPanel();
}
const isFavorite=r=>!!r&&state.favorites.some(f=>sameRoute(f,{from:r.from,via:r.via||'',to:r.to}));

// 지도 상태(px/km 배율과 이동량). 다시 그려도 유지합니다.
const view={scale:0,tx:0,ty:0,fitted:false};
const project=([lat,lon])=>[(lon-126.98)*88.2,(37.56-lat)*111];// km 단위 평면 좌표
const departuresCache=new Map(),planCache=new Map();
const nowHM=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
const destText=d=>esc(d)+(/순환$/.test(d||'')?'':'행');

async function loadData(){
 if(data)return data;
 loading??=fetch('/subway-data.json').then(r=>{if(!r.ok)throw Error('지하철 데이터를 불러오지 못했어요.');return r.json();})
  .then(d=>{data=d;return d;}).catch(e=>{loadError=e.message;loading=null;throw e;});
 return loading;
}

const TAB_TEXT={route:['경로 탐색','노선도에서 역을 눌러 출발·경유·도착을 정하면, 경로와 탈 열차를 알려 드려요.'],live:['실시간 위치','노선을 고르면 지금 열차가 어디쯤 있는지 보여요. 열차를 누르면 자세한 정보가 나와요.']};
export function getSubwayTab(){return state.tab==='live'?'live':'route';}
export function setSubwayTab(tab){state.tab=tab==='live'?'live':'route';save();paint();}
export function recentRoutes(){return mergeRoutes(state.favorites.map(r=>({...r})),state.recent,5).map(r=>({...r,fav:isFavorite(r)}));}
export function openSubwayRoute(r){Object.assign(state,{tab:'route',from:r.from||'',via:r.via||'',to:r.to||'',result:null,error:''});save();if(data)compute();paint();}
export function subwaySection(){
 return `<section class="dashboard-head subway-head"><div><h1 id="subway-title"></h1><p class="muted" id="subway-desc"></p></div><span class="profile-label" id="subway-profile"></span></section>
 <section class="panel subway" id="subway"><div id="subway-body"></div><p class="fine subway-source">자료: 서울교통공사 역간거리·환승역·역사 좌표, 국가철도공단 역간거리·역위치, 서울시 지하철 시간표 · 공공누리 제1유형</p></section>`;
}

export function bindSubway(){
 const root=document.querySelector('#subway');if(!root)return;
 paint();
}

function paint(){
 const body=document.querySelector('#subway-body');if(!body)return;
 const [title,desc]=TAB_TEXT[getSubwayTab()];document.querySelector('#subway-title').textContent=title;document.querySelector('#subway-desc').textContent=desc;paintProfileLabel();
 if(state.tab!=='live')clearInterval(live.timer);
 if(!data){
  body.innerHTML=loadError?`<p class="error">${esc(loadError)}</p><button type="button" class="secondary" id="subway-retry">다시 불러오기</button>`:'<p class="loading">노선도를 불러오고 있어요…</p>';
  body.querySelector('#subway-retry')?.addEventListener('click',()=>{loadError='';paint();});
  if(!loadError)loadData().then(()=>{if(state.from&&state.to)compute();paint();},paint);
  return;
 }
 if(state.tab==='live'){paintLive(body);return;}
 body.innerHTML=`<div class="segmented m-mode" role="group" aria-label="경로 찾는 방법">${[['map','지도에서 고르기'],['search','역 검색']].map(([v,t])=>`<button type="button" data-m-mode="${v}" aria-pressed="${state.mobileMode===v}">${t}</button>`).join('')}</div>
  <div class="subway-layout m-${state.mobileMode==='search'?'search':'map'}" id="subway-layout"><div class="subway-map-wrap" id="subway-map-wrap">${mapSvg()}
  <div class="map-controls"><button type="button" class="secondary" data-zoom="in" aria-label="확대">+</button><button type="button" class="secondary" data-zoom="out" aria-label="축소">−</button><button type="button" class="secondary" data-zoom="fit" aria-label="서울 전체 보기">⤢</button></div>
  <div class="station-pop" id="station-pop" hidden></div><div class="map-hint" id="map-hint" hidden></div></div>
  <div class="subway-panel" id="subway-panel"></div></div>`;
 bindMap(body.querySelector('#subway-map-wrap'));
 body.querySelectorAll('[data-m-mode]').forEach(b=>b.onclick=()=>{state.mobileMode=b.dataset.mMode;save();body.querySelectorAll('[data-m-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const lay=body.querySelector('#subway-layout');lay.classList.toggle('m-map',state.mobileMode==='map');lay.classList.toggle('m-search',state.mobileMode==='search');if(state.mobileMode==='search'){pickRole=null;paintPickHint();}document.querySelector('#subway-map-wrap')?._apply?.();});
 if(pickRole===null&&!state.from)pickRole='from';
 paintPanel();paintPickHint();
}

// ---------- 노선도 ----------
function mapSvg(){
 const lines=Object.entries(data.lines).map(([id,line])=>line.segments.map(seg=>`<polyline class="map-line" data-line="${id}" points="${seg.stations.map(n=>project(data.coords[n]).map(v=>v.toFixed(3)).join(',')).join(' ')}" style="--line-color:${line.color}"/>`).join('')).join('');
 const stations=Object.entries(data.stations).map(([name,lines])=>`<g class="map-station${lines.length>1?' transfer':''}" data-station="${esc(name)}"><circle class="hit" r="11"/><circle r="${lines.length>1?5:3.5}"/><text x="7" y="4">${esc(name)}</text></g>`).join('');
 return `<svg id="subway-map" class="subway-map" role="img" aria-label="서울 지하철 1~9호선 노선도"><g id="map-world"><g class="map-lines">${lines}</g><g id="map-route"></g></g><g id="map-stations">${stations}</g><g id="map-marks"></g></svg>`;
}

function bindMap(wrap){
 const svg=wrap.querySelector('svg'),world=svg.querySelector('#map-world'),stationNodes=[...svg.querySelectorAll('.map-station')];
 const positions=new Map(stationNodes.map(g=>[g,project(data.coords[g.dataset.station])]));
 const marks=svg.querySelector('#map-marks');
 let frame=0;
 const apply=()=>{
  frame=0;
  world.setAttribute('transform',`translate(${view.tx} ${view.ty}) scale(${view.scale})`);
  svg.classList.toggle('labels-transfer',view.scale>=9);svg.classList.toggle('labels-all',view.scale>=22);svg.classList.toggle('labels-route',view.scale>=15);
  for(const [g,[x,y]] of positions)g.setAttribute('transform',`translate(${(x*view.scale+view.tx).toFixed(1)} ${(y*view.scale+view.ty).toFixed(1)})`);
  paintMarks(marks);positionPop(wrap);
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(apply);};
 const fit=()=>{
  const w=wrap.clientWidth,h=wrap.clientHeight;if(!w||!h)return false;
  // 서울 도심 위주로 맞춥니다(외곽 노선은 이동해서 봄).
  const [x1,y1]=project([37.70,126.82]),[x2,y2]=project([37.44,127.18]);
  view.scale=Math.min(w/(x2-x1),h/(y2-y1))*.95;view.tx=w/2-(x1+x2)/2*view.scale;view.ty=h/2-(y1+y2)/2*view.scale;view.fitted=true;return true;
 };
 const fitTo=names=>{
  const w=wrap.clientWidth,h=wrap.clientHeight;const pts=names.filter(n=>data.coords[n]).map(n=>project(data.coords[n]));if(!w||!h||!pts.length)return false;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const x1=Math.min(...xs),x2=Math.max(...xs),y1=Math.min(...ys),y2=Math.max(...ys);
  const pad=56;view.scale=Math.min(60,Math.max(4,Math.min((w-pad*2)/Math.max(x2-x1,1),(h-pad*2)/Math.max(y2-y1,1))));
  view.tx=w/2-(x1+x2)/2*view.scale;view.ty=h/2-(y1+y2)/2*view.scale;view.fitted=true;return true;
 };
 const fitRoute=()=>{const names=state.result?state.result.legs.flatMap(l=>l.stations):[];return names.length?fitTo(names):false;};
 let lastSize=null;
 const zoomAt=(factor,cx,cy)=>{const next=Math.min(120,Math.max(2,view.scale*factor));const k=next/view.scale;view.tx=cx-(cx-view.tx)*k;view.ty=cy-(cy-view.ty)*k;view.scale=next;schedule();};
 new ResizeObserver(()=>{
  const w=wrap.clientWidth,h=wrap.clientHeight;if(!w||!h)return;
  if(!view.fitted){if(!(fitRoute()||fit()))return;}
  else if(lastSize&&(lastSize.w!==w||lastSize.h!==h)){if(!(state.result&&fitRoute())){view.tx+=(w-lastSize.w)/2;view.ty+=(h-lastSize.h)/2;}}
  lastSize={w,h};schedule();
 }).observe(wrap);
 if(wrap.clientWidth&&wrap.clientHeight){if(!view.fitted)fitRoute()||fit();lastSize={w:wrap.clientWidth,h:wrap.clientHeight};apply();}
 wrap.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{const w=wrap.clientWidth/2,h=wrap.clientHeight/2;if(b.dataset.zoom==='fit'){fit();schedule();}else zoomAt(b.dataset.zoom==='in'?1.5:1/1.5,w,h);});
 svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
 // 드래그로 이동, 두 손가락으로 확대·축소, 짧게 누르면 역 선택
 const pointers=new Map();let start=null,pinch=null,moved=false;
 svg.addEventListener('pointerdown',e=>{svg.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=false;
  if(pointers.size===1)start={x:e.clientX,y:e.clientY,tx:view.tx,ty:view.ty,target:e.target.closest('.map-station')};
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),scale:view.scale};}});
 svg.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2&&pinch){const [a,b]=[...pointers.values()];const r=svg.getBoundingClientRect();const target=pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d;zoomAt(target/view.scale,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);moved=true;return;}
  if(start&&pointers.size===1){const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.hypot(dx,dy)>4)moved=true;if(moved){view.tx=start.tx+dx;view.ty=start.ty+dy;schedule();}}});
 const end=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;
  if(!pointers.size){if(!moved&&start?.target){const name=start.target.dataset.station;if(pickRole){const role=pickRole;if(role==='via')showVia=true;pickRole=null;setRole(role,name);if(state[role]===name)pickRole=nextPickRole();paintPanel();paintPickHint();}else openPop(name);}else if(!moved&&!start?.target)closePop();start=null;}};
 svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
 wrap._apply=schedule;
 wrap._fitAll=()=>{view.fitted=false;if(fit())schedule();};
 wrap._fitRoute=()=>{if(fitRoute())schedule();};
}

function screenOf(name){const [x,y]=project(data.coords[name]);return [x*view.scale+view.tx,y*view.scale+view.ty];}

function paintMarks(group){
 const roles=Object.keys(ROLES).filter(r=>state[r]&&data.coords[state[r]]);
 group.innerHTML=roles.map(r=>{const [x,y]=screenOf(state[r]);return `<g class="map-mark mark-${r}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="9"/><g transform="translate(0 -22)"><rect x="-17" y="-10" width="34" height="19" rx="9.5"/><text y="4">${ROLES[r]}</text></g></g>`;}).join('');
}

function paintRouteOverlay(){
 const svg=document.querySelector('#subway-map');if(!svg)return;
 const group=svg.querySelector('#map-route');const r=state.result;
 svg.classList.toggle('has-route',!!r);
 group.innerHTML=r?r.legs.map(leg=>{const pts=leg.stations.map(n=>project(data.coords[n]).map(v=>v.toFixed(3)).join(',')).join(' ');return `<polyline class="route-casing" points="${pts}"/><polyline class="route-line" points="${pts}" style="--line-color:${leg.color}"/>`;}).join(''):'';
 const keys=new Set(r?[r.from,r.to,r.via,...r.legs.flatMap(l=>[l.from,l.to])].filter(Boolean):[]);
 svg.querySelectorAll('.map-station').forEach(g=>{g.classList.toggle('on-route',!!r&&r.legs.some(l=>l.stations.includes(g.dataset.station)));g.classList.toggle('key',keys.has(g.dataset.station));});
}

let popStation=null,pickRole=null,showVia=false,sheetOpen=true;
const nextPickRole=()=>!state.from?'from':!state.to?'to':null;
function paintPickHint(){const hint=document.querySelector('#map-hint');if(!hint)return;hint.hidden=!pickRole;if(pickRole)hint.innerHTML=`<span class="hint-dot hint-${pickRole}"></span>지도에서 <b>${ROLES[pickRole]}역</b>을 눌러 주세요<button type="button" class="hint-close" aria-label="지도에서 고르기 그만">×</button>`;hint.querySelector('.hint-close')?.addEventListener('click',()=>{pickRole=null;paintPickHint();document.querySelectorAll('.pick').forEach(p=>p.classList.remove('picking'));});}
function openPop(name){
 popStation=name;const pop=document.querySelector('#station-pop');if(!pop)return;
 const lines=data.stations[name].map(l=>`<span class="line-badge" style="--line-color:${data.lines[l].color}">${esc(data.lines[l].name)}</span>`).join('');
 pop.innerHTML=`<div class="pop-head"><b>${esc(name)}</b><button type="button" class="pop-close" aria-label="닫기">×</button></div><div class="pop-lines">${lines}</div>
  <div class="pop-actions">${Object.entries(ROLES).map(([role,label])=>`<button type="button" class="${state[role]===name?'':'secondary'}" data-role="${role}">${label}</button>`).join('')}</div>`;
 pop.hidden=false;
 pop.querySelector('.pop-close').onclick=closePop;
 pop.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{setRole(b.dataset.role,name);closePop();});
 positionPop(document.querySelector('#subway-map-wrap'));
}
function closePop(){popStation=null;const pop=document.querySelector('#station-pop');if(pop)pop.hidden=true;}
function positionPop(wrap){
 const pop=wrap?.querySelector('#station-pop');if(!pop||pop.hidden||!popStation)return;
 const [x,y]=screenOf(popStation);const w=pop.offsetWidth,h=pop.offsetHeight,W=wrap.clientWidth,H=wrap.clientHeight;
 const left=Math.min(Math.max(8,x-w/2),W-w-8),top=y-h-16<8?Math.min(y+16,H-h-8):y-h-16;
 pop.style.left=left+'px';pop.style.top=top+'px';
}

function setRole(role,name){
 // 같은 역을 다른 역할로 고르면 이전 역할에서는 뺍니다. 같은 역할을 다시 누르면 해제합니다.
 for(const r of Object.keys(ROLES))if(r!==role&&state[r]===name)state[r]='';
 state[role]=state[role]===name?'':name;
 refreshAll();
}

// ---------- 경로 ----------
function compute(){
 state.error='';state.result=null;
 if(!state.from||!state.to)return;
 try{
  state.result=findRouteVia(data,state.from,state.via,state.to,{mode:state.mode});
  const key={from:state.result.from,via:state.result.via||'',to:state.result.to};
  state.recent=[key,...state.recent.filter(r=>r.from!==key.from||r.to!==key.to||(r.via||'')!==key.via)].slice(0,5);
 }catch(e){
  const bad=[state.from,state.via,state.to].find(v=>v&&!stationName(data,v));
  const hint=bad?searchStations(data,bad,3):[];
  state.error=e.message+(hint.length?` 혹시 ${hint.join(', ')}?`:'');
 }
}

function refreshAll(){if(pickRole&&state[pickRole])pickRole=pickRole==='via'?null:nextPickRole();const before=JSON.stringify(state.result?.legs?.map(l=>l.stations));compute();if(state.result&&JSON.stringify(state.result.legs.map(l=>l.stations))!==before)sheetOpen=true;save();paintPanel();const wrap=document.querySelector('#subway-map-wrap');if(state.result&&JSON.stringify(state.result.legs.map(l=>l.stations))!==before)wrap?._fitRoute?.();wrap?._apply?.();paintPickHint();}

function paintPanel(){
 const panel=document.querySelector('#subway-panel');if(!panel)return;
 const options=Object.entries(data.stations).map(([name,lines])=>`<option value="${esc(name)}">${lines.map(l=>data.lines[l].name).join('·')}</option>`).join('');
 const field=(role,placeholder,required)=>`<label class="pick pick-${role}${pickRole===role?' picking':''}"${role==='via'&&!state.via&&!showVia&&pickRole!=='via'?' hidden':''}><button type="button" class="pick-role" data-pick-role="${role}" aria-pressed="${pickRole===role}" title="지도에서 ${ROLES[role]}역 고르기">${ROLES[role]}</button><input name="${role}" list="subway-stations" value="${esc(state[role])}" placeholder="${placeholder}" ${required?'required':''}>${state[role]?`<button type="button" class="pick-clear" data-clear="${role}" aria-label="${ROLES[role]} 지우기">×</button>`:''}</label>`;
 panel.innerHTML=`<form id="subway-form" class="subway-form" autocomplete="off">
  <div class="subway-picks"><div class="pick-fields">${field('from','출발역 (지도에서 누르거나 입력)',true)}${field('via','경유역',false)}${field('to','도착역 (지도에서 누르거나 입력)',true)}${!state.via&&!showVia&&pickRole!=='via'?'<button type="button" class="add-via" data-add-via>+ 경유역 추가</button>':''}</div><button type="button" class="secondary subway-swap" aria-label="출발역과 도착역 바꾸기">⇅</button></div>
  <div class="subway-actions"><button type="submit">경로 찾기</button><button type="button" class="secondary" data-reset>초기화</button></div></form><datalist id="subway-stations">${options}</datalist>
  ${!state.result&&state.from?'<div id="subway-departures" class="subway-departures"></div>':''}
  ${state.error?`<p class="error subway-error">${esc(state.error)}</p>`:''}
  ${state.result?routeSheet(state.result):''}<div class="subway-saved">${recentList()}</div>${syncNote()}`;
 panel.classList.toggle('has-result',!!state.result);
 const form=panel.querySelector('#subway-form');
 form.onsubmit=e=>{e.preventDefault();const f=new FormData(form);for(const r of Object.keys(ROLES)){const v=String(f.get(r)||'').trim();state[r]=v?stationName(data,v)||v:'';}refreshAll();};
 form.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{state[b.dataset.clear]='';refreshAll();});
 form.querySelectorAll('[data-pick-role]').forEach(b=>b.onclick=e=>{e.preventDefault();pickRole=pickRole===b.dataset.pickRole?null:b.dataset.pickRole;closePop();form.querySelectorAll('.pick').forEach(p=>p.classList.toggle('picking',p.classList.contains('pick-'+pickRole)));form.querySelectorAll('[data-pick-role]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.pickRole===pickRole)));paintPickHint();});
 form.querySelector('[data-add-via]')?.addEventListener('click',()=>{showVia=true;pickRole='via';paintPanel();paintPickHint();});
 form.querySelector('[data-reset]').onclick=()=>{Object.assign(state,{from:'',via:'',to:'',result:null,error:'',timeMode:'now',time:''});showVia=false;pickRole='from';refreshAll();paintPickHint();document.querySelector('#subway-map-wrap')?._fitAll?.();};
 panel.querySelectorAll('[data-sheet-toggle]').forEach(b=>b.onclick=()=>{sheetOpen=!sheetOpen;panel.querySelector('.route-sheet')?.classList.toggle('open',sheetOpen);panel.querySelectorAll('[data-sheet-toggle]').forEach(x=>x.setAttribute('aria-expanded',String(sheetOpen)));});
 panel.querySelectorAll('input[name=when]').forEach(i=>i.onchange=()=>{state.timeMode=i.value;const t=panel.querySelector('input[name=time]');t.hidden=i.value!=='set';if(i.value==='set'){state.time=t.value||nowHM();t.focus();}paintPlan();});
 panel.querySelector('input[name=time]')?.addEventListener('change',e=>{state.time=e.target.value;if(state.timeMode==='set')paintPlan();});
 form.querySelector('.subway-swap').onclick=()=>{[state.from,state.to]=[state.to,state.from];refreshAll();};
 panel.querySelectorAll('input[name=mode]').forEach(i=>i.onchange=()=>{state.mode=i.value;refreshAll();});
 panel.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>{const r=state.recent[Number(b.dataset.recent)];Object.assign(state,{from:r.from,via:r.via||'',to:r.to});refreshAll();});
 panel.querySelectorAll('[data-fav-route]').forEach(b=>b.onclick=()=>{const r=state.favorites[Number(b.dataset.favRoute)];Object.assign(state,{from:r.from,via:r.via||'',to:r.to});refreshAll();});
 panel.querySelectorAll('[data-unfav]').forEach(b=>b.onclick=()=>{state.favorites.splice(Number(b.dataset.unfav),1);save();paintPanel();});
 panel.querySelector('[data-fav]')?.addEventListener('click',()=>{const r=state.result;if(!r)return;const key={from:r.from,via:r.via||'',to:r.to};state.favorites=isFavorite(key)?state.favorites.filter(f=>!sameRoute(f,key)):[key,...state.favorites].slice(0,12);save();paintPanel();});
 panel.querySelector('[data-link-profile]')?.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('mydoc:open',{detail:'cloth'})));
 paintRouteOverlay();
 if(state.result)paintPlan();else if(state.from)paintDepartures(state.from);
}

function recentList(){
 const chip=(r,attr,i,star)=>`<span class="chip route-chip"><button type="button" data-${attr}="${i}">${star?'★ ':''}${esc(r.from)}${r.via?` → ${esc(r.via)}`:''} → ${esc(r.to)}</button>${star?`<button type="button" class="chip-x" data-unfav="${i}" aria-label="즐겨찾기에서 빼기">×</button>`:''}</span>`;
 const recent=state.recent.filter(r=>!isFavorite(r));
 const parts=[];
 if(state.favorites.length)parts.push(`<div class="subway-recent"><b>즐겨찾기</b><div class="chips">${state.favorites.map((r,i)=>chip(r,'fav-route',i,true)).join('')}</div></div>`);
 if(recent.length)parts.push(`<div class="subway-recent"><b>최근 찾은 경로</b><div class="chips">${recent.map(r=>chip(r,'recent',state.recent.indexOf(r),false)).join('')}</div></div>`);
 if(!parts.length)parts.push('<p class="fine subway-hint">노선도에서 역을 누르거나 이름을 입력하세요. 출발과 도착을 고르면 바로 경로를 찾아요.</p>');
 return parts.join('');
}
function syncNote(){return account?`<p class="fine sync-note">☁ <b>${esc(account.nickname)}</b> 프로필에 최근·즐겨찾기 경로를 저장해요.</p>`:'<p class="fine sync-note">이 기기에만 저장돼요. <button type="button" class="link-button" data-link-profile>프로필 연결하기</button></p>';}

function routeSheet(r){
 return `<section class="route-sheet${sheetOpen?' open':''}" aria-label="경로 결과"><button type="button" class="sheet-bar" data-sheet-toggle aria-expanded="${sheetOpen}"><span class="sheet-handle" aria-hidden="true"></span><b>약 ${r.minutes}분</b><span>환승 ${r.transferCount}회 · ${esc(r.from)} → ${esc(r.to)}</span><i aria-hidden="true">${'⌃'}</i></button><div class="sheet-body">${routeResult(r)}</div></section>`;
}
function routeOptions(){
 return `<div class="route-options"><div class="subway-modes" role="radiogroup" aria-label="경로 기준">${[['fastest','최단 시간'],['fewest','최소 환승']].map(([v,t])=>`<label class="chip"><input type="radio" name="mode" value="${v}" ${state.mode===v?'checked':''}><span>${t}</span></label>`).join('')}</div>
  <div class="subway-when" role="radiogroup" aria-label="출발 시각">${[['now','지금 출발'],['set','시각 지정']].map(([v,t])=>`<label class="chip"><input type="radio" name="when" value="${v}" ${state.timeMode===v?'checked':''}><span>${t}</span></label>`).join('')}<input type="time" name="time" value="${esc(state.time||nowHM())}" aria-label="출발 시각"${state.timeMode==='set'?'':' hidden'}></div></div>`;
}
function routeResult(r){
 const legs=r.legs.map((leg,i)=>{
  const middle=leg.stations.slice(1,-1);const viaInside=r.via&&middle.includes(r.via);
  const tr=r.transfers[i];
  const transfer=tr?`<li class="route-transfer"><span class="transfer-mark">${tr.atVia?'경유·환승':'환승'}</span><span>${esc(tr.station)}에서 ${esc(data.lines[tr.toLine].name)}${tr.fromLine===tr.toLine?' 반대 방향':''}으로 갈아타기${tr.walk?` · 도보 약 ${Math.max(1,Math.round(tr.walk))}분`:''}</span></li>`:'';
  return `<li class="route-leg" style="--line-color:${leg.color}">
   <div class="route-stop"><span class="route-dot"></span><div><b>${esc(leg.from)}</b> <span class="line-badge">${esc(leg.name)}</span><small>${esc(leg.next)} 방향 · ${leg.stops}개 역 · 약 ${Math.round(leg.minutes)}분</small></div></div>
   ${middle.length?`<details class="route-middle"${viaInside?' open':''}><summary>${middle.length}개 역 지나기${viaInside?` · ${esc(r.via)} 경유`:''}</summary><ol>${middle.map(s=>`<li${s===r.via?' class="via-stop"':''}>${esc(s)}${s===r.via?' <span class="via-tag">경유</span>':''}</li>`).join('')}</ol></details>`:'<div class="route-middle empty"></div>'}
   <div class="route-stop"><span class="route-dot"></span><div><b>${esc(leg.to)}</b>${i===r.legs.length-1?' <small>도착</small>':''}</div></div></li>${transfer}`;
 }).join('');
 const fav=isFavorite(r);
 return `<div class="route-result"><div class="route-summary"><div><strong>약 ${r.minutes}분</strong><button type="button" class="fav-toggle" data-fav aria-pressed="${fav}" aria-label="즐겨찾기 ${fav?'해제':'추가'}">${fav?'★':'☆'} 즐겨찾기</button><span>환승 ${r.transferCount}회 · ${r.stops}개 역${r.via?` · ${esc(r.via)} 경유`:''}</span></div><div class="route-lines">${r.legs.map(l=>`<span class="line-badge" style="--line-color:${l.color}">${esc(l.name)}</span>`).join('<i>→</i>')}</div></div>
  ${routeOptions()}
  <div id="subway-plan" class="subway-departures"></div>
  <details class="route-detail"><summary>역별 경로 보기 <small>${r.stops}개 역 · 환승 ${r.transferCount}회</small></summary><ol class="route-diagram">${legs}</ol>
  <p class="fine">표준 운행시간에 정차 0.5분, 환승 시 도보와 평균 대기 3분을 더한 추정치예요. 급행·지연은 반영하지 않아요.${r.estimated?' 9호선·코레일·인천 구간은 거리로 추정한 시간이에요.':''}</p></details></div>`;
}

// ---------- 탈 열차(시간표 기반 탑승 계획) ----------
async function paintPlan(){
 const box=document.querySelector('#subway-plan');if(!box||!state.result)return;
 const time=state.timeMode==='set'?(state.time||nowHM()):'';
 const q=new URLSearchParams({from:state.result.from,via:state.result.via||'',to:state.result.to,mode:state.mode});if(time)q.set('time',time);
 const key=q.toString()+(time?'':'@'+nowHM());
 const hit=planCache.get(key);if(hit){box.innerHTML=planHtml(hit);return;}
 box.innerHTML='<p class="fine">시간표에서 탈 열차를 찾고 있어요…</p>';
 try{
  const r=await fetch('/api/subway/plan?'+q);const value=await r.json();
  if(!r.ok)throw Error(value.error||'시간표를 불러오지 못했어요.');
  planCache.set(key,value);if(planCache.size>30)planCache.delete(planCache.keys().next().value);
  const current=document.querySelector('#subway-plan');if(current&&q.get('from')===state.result?.from&&q.get('to')===state.result?.to)current.innerHTML=planHtml(value);
 }catch(e){const current=document.querySelector('#subway-plan');if(current)current.innerHTML=`<p class="fine">탈 열차: ${esc(e.message)}</p>`;}
}
function planHtml(p){
 if(p.needsKey)return '<div class="departures-empty"><b>탈 열차</b><p>서울 열린데이터광장 인증키를 연결하면, 시간표로 어느 열차를 타면 되는지 알려 드려요.</p></div>';
 const day={1:'평일',2:'토요일',3:'일요일'}[p.weekTag]||'';const first=p.legs[0];
 return `<div class="plan"><div class="plan-head"><small>${p.startMode==='set'?`${esc(p.start)} 출발 기준`:`지금(${esc(p.start)}) 출발 기준`}</small><strong>${esc(first.depart)} 출발 → ${esc(p.arrive)} 도착</strong><span>총 ${p.minutes}분${first.wait>0?` · 첫 열차까지 ${first.wait}분`:' · 바로 탈 수 있어요'}</span></div>
  <ol class="plan-legs">${p.legs.map(l=>`<li class="plan-leg" style="--line-color:${esc(l.color)}"><span class="plan-time">${esc(l.depart)}</span><div class="plan-body"><div><span class="line-badge">${esc(l.name)}</span> <b>${esc(l.from)}</b>에서 ${l.train?`<b>${destText(l.train.destination)}</b>${l.train.express?' <em class="tag-express">급행</em>':''} 탑승 <small class="train-no">열차 ${esc(l.train.no)}</small>`:'탑승 <small>(시간표 없음 · 예상)</small>'}</div>
   <small>${esc(l.to)} ${esc(l.arrive)} 도착${l.estimated&&l.train?' (예상)':''} · ${l.stops}개 역${l.wait>0?` · ${l.wait}분 기다림`:''}</small>${l.congestion?`<small class="plan-cong">평소 혼잡 ${congChip(l.congestion)}${l.congestion.station?` · ${esc(l.congestion.station)} 부근 가장 붐빔`:''}</small>`:''}${l.next.length?`<small class="plan-next">놓치면 ${l.next.map(n=>`${esc(n.depart)}${n.destination!==l.train?.destination?` ${destText(n.destination)}`:''}`).join(' · ')}</small>`:''}</div></li>${l.transfer?`<li class="plan-transfer"><span class="plan-time"></span><div class="plan-body"><small>${esc(l.transfer.station)}에서 갈아타기 · 도보 약 ${Math.max(1,Math.round(l.transfer.walk))}분</small></div></li>`:''}`).join('')}</ol>
  <p class="fine">${day} 시간표 기준이에요. 공휴일·지연·임시 열차는 반영되지 않아요.</p></div>`;
}

// ---------- 출발역 다음 열차 ----------
async function paintDepartures(name){
 const box=document.querySelector('#subway-departures');if(!box)return;
 const hit=departuresCache.get(name);
 if(hit&&Date.now()-hit.at<60e3){box.innerHTML=departuresHtml(hit.value);return;}
 box.innerHTML=`<p class="fine">${esc(name)} 다음 열차를 확인하고 있어요…</p>`;
 try{
  const r=await fetch('/api/subway/departures?station='+encodeURIComponent(name));const value=await r.json();
  if(!r.ok)throw Error(value.error||'시간표를 불러오지 못했어요.');
  departuresCache.set(name,{at:Date.now(),value});
  const current=document.querySelector('#subway-departures');if(state.from===name&&current)current.innerHTML=departuresHtml(value);
 }catch(e){const current=document.querySelector('#subway-departures');if(state.from===name&&current)current.innerHTML=`<p class="fine">다음 열차: ${esc(e.message)}</p>`;}
}
function departuresHtml(v){
 if(v.needsKey)return `<div class="departures-empty"><b>${esc(v.station)} 다음 열차</b><p>서울 열린데이터광장 인증키를 연결하면, 지금 시각에 가장 가까운 열차 시간이 여기에 보여요.</p></div>`;
 const day={1:'평일',2:'토요일',3:'일요일'}[v.weekTag]||'';
 return `<div class="departures"><div class="departures-head"><b>${esc(v.station)} 다음 열차</b><small>${day} 시간표 기준</small></div>${v.lines.map(l=>`<div class="departure-line" style="--line-color:${data.lines[l.line]?.color||'#555'}"><span class="line-badge">${esc(data.lines[l.line]?.name||l.line+'호선')}</span>${l.directions.length?l.directions.map(d=>`<div class="departure-dir">${d.trains.map(t=>`<span class="departure-time"><b>${t.minutesLeft<=0?'곧 출발':t.minutesLeft+'분 후'}</b> ${esc(t.time)} · ${esc(t.destination)}${/순환$/.test(t.destination)?'':'행'}${t.express?' <em>급행</em>':''}</span>`).join('')}</div>`).join(''):'<p class="fine">오늘 남은 열차가 없어요.</p>'}</div>`).join('')}</div>`;
}

// ---------- 실시간 위치 ----------
// 노선을 고르면 역 목록을 세로 띠로 그리고, 열차를 방향별 칸(▲/▼)에 놓습니다. 화면이 보일 때만 20초마다 갱신하고 10분 뒤 자동 갱신을 멈춥니다.
const LIVE_REFRESH=20e3,LIVE_IDLE=10*60e3,ROW=52;
const live={value:null,error:'',loading:false,timer:0,started:0,lastFetch:0,paused:false,selected:'',station:''};
const STATUS=['진입','도착','출발','접근 중'];
const STATUS_CHIP={0:'진입',1:'도착',2:'출발',3:'전역출발',4:'전역진입',5:'전역도착',99:'운행 중'};
const STATUS_HELP=[['0','진입','역에 들어오는 중'],['1','도착','역에 서 있음'],['2','출발','역을 막 떠남'],['3','전역출발','앞 역을 떠나 오는 중']];
const statusChip=code=>STATUS_CHIP[code]?`<i class="st st-${code}">${STATUS_CHIP[code]}</i>`:'';
const statusLegend=()=>`<p class="st-legend">${STATUS_HELP.map(([c,l,d])=>`<span>${statusChip(Number(c))}${d}</span>`).join('')}</p>`;
function paintLive(body){
 state.liveView='strip';
 const fromName=stationName(data,state.from||'');
 if(!data.lines[state.liveLine])state.liveLine=(fromName&&data.stations[fromName]?.[0])||'2';
 body.innerHTML=`<div class="live"><div class="live-lines" role="group" aria-label="노선 선택">${Object.entries(data.lines).map(([id,l])=>`<button type="button" class="live-line-chip" data-live-line="${id}" style="--line-color:${l.color}" aria-pressed="${id===state.liveLine}" aria-label="${esc(l.name)}">${id}</button>`).join('')}</div><div id="live-body"></div>
  <div class="line-fab-wrap"><div class="line-sheet" id="line-sheet" hidden role="group" aria-label="노선 선택"><b>노선 선택</b><div class="line-sheet-grid">${Object.entries(data.lines).map(([id,l])=>`<button type="button" class="live-line-chip" data-live-line="${id}" style="--line-color:${l.color}" aria-pressed="${id===state.liveLine}" aria-label="${esc(l.name)}">${id}</button>`).join('')}</div></div>
  <button type="button" class="fab-refresh" aria-label="새로고침">↻</button><button type="button" class="line-fab" style="--line-color:${data.lines[state.liveLine].color}" aria-expanded="false" aria-controls="line-sheet"><b>${state.liveLine}</b><span>호선 변경</span></button></div></div>`;
 body.querySelector('.fab-refresh').onclick=()=>{live.started=Date.now();live.paused=false;loadLive();};
 body.querySelector('.line-fab').onclick=e=>{const sheet=body.querySelector('#line-sheet');sheet.hidden=!sheet.hidden;e.currentTarget.setAttribute('aria-expanded',String(!sheet.hidden));};
 body.querySelectorAll('[data-live-line]').forEach(b=>b.onclick=()=>{state.liveLine=b.dataset.liveLine;save();live.value=null;live.selected='';live.station='';live.error='';live.lastFetch=0;paintLive(body);});
 live.started=Date.now();live.paused=false;
 paintLiveBody();
 clearInterval(live.timer);live.timer=setInterval(tickLive,3000);tickLive();
}
function tickLive(){
 const el=document.querySelector('#live-body');
 if(!el||state.tab!=='live'){clearInterval(live.timer);return;}
 if(document.hidden||!el.offsetParent||live.loading||live.paused)return;
 if(Date.now()-live.started>LIVE_IDLE){live.paused=true;paintLiveBody();return;}
 if(Date.now()-live.lastFetch>=LIVE_REFRESH||live.value?.line!==state.liveLine)loadLive();
}
async function loadLive(){
 const line=state.liveLine;live.loading=true;live.lastFetch=Date.now();paintLiveBody();
 try{
  const r=await fetch('/api/subway/positions?line='+line);const v=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(v.error||'실시간 위치를 불러오지 못했어요.');
  if(line===state.liveLine){live.value=v;live.error='';}
 }catch(e){if(line===state.liveLine)live.error=e.message;}
 finally{live.loading=false;if(line===state.liveLine)paintLiveBody();}
}
function paintLiveBody(){
 const el=document.querySelector('#live-body');if(!el)return;
 document.querySelector('.fab-refresh')?.classList.toggle('spinning',live.loading);
 const id=state.liveLine,line=data.lines[id],v=live.value;
 if(v?.needsKey){el.innerHTML='<div class="subway-live-empty"><b>실시간 지하철 인증키가 필요해요</b><p>서버 환경변수 SEOUL_SUBWAY_KEY에 서울 열린데이터광장 실시간 지하철 인증키를 넣으면 열차 위치가 보여요.</p></div>';return;}
 if(!v||v.line!==id){el.innerHTML=live.error?`<p class="error">${esc(live.error)}</p><button type="button" class="secondary" data-live-refresh>다시 시도</button>`:'<p class="loading">열차 위치를 불러오고 있어요…</p>';bindLiveBody(el);return;}
 const placed=placeTrains(data,id,v.trains);
 const time=v.fetchedAt?new Date(v.fetchedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'';
 const from=stationName(data,state.from||'');
 const near=from&&data.stations[from]?.includes(id)?approaching(data,id,placed,from):null;
 el.innerHTML=`<div class="live-status"><div><b>${esc(line.name)}</b> 열차 ${placed.count}대 · ${esc(time)} 기준<small>${live.paused?'10분이 지나 자동 갱신을 멈췄어요.':'화면을 보고 있는 동안 20초마다 갱신해요.'}</small></div>
  ${live.paused?'<button type="button" class="secondary" data-live-resume>자동 갱신 켜기</button>':`<button type="button" class="secondary" data-live-refresh${live.loading?' disabled':''}>${live.loading?'불러오는 중…':'새로고침'}</button>`}</div>
  ${live.error?`<p class="error">${esc(live.error)}</p>`:''}
  ${near?`<div class="live-approach"><b>${esc(from)}에 오는 열차</b>${near.length?near.map(n=>`<div class="live-approach-row"><span>${esc(n.lane)}</span><strong>${n.dist<.15?'곧 도착':`약 ${Math.max(1,Math.round(n.minutes))}분`}</strong><small>${n.dist<.15?'':`${Math.max(1,Math.ceil(n.dist-.15))}정거장 전 · `}${esc(stationName(data,n.train.station)||n.train.station)} ${STATUS[n.train.status]||''} · ${esc(n.train.destName||n.train.destination)}행</small></div>`).join(''):'<p class="fine">지금은 이 역으로 오는 열차가 보이지 않아요.</p>'}</div>`:''}
  ${placed.count?`<div class="segmented live-views" role="group" aria-label="보기 방식"><button type="button" data-live-view="strip" aria-pressed="${state.liveView!=='list'}">노선 보기</button><button type="button" data-live-view="list" aria-pressed="${state.liveView==='list'}">열차 목록</button></div>`:''}
  ${placed.count?'':'<p class="fine">지금 운행 중인 열차 정보가 없어요. 운행 시간이 아니거나 잠시 정보가 비어 있을 수 있어요.</p>'}
  ${state.liveView==='list'?trainList(id,placed,from):line.segments.map((seg,k)=>stripHtml(id,seg,placed.segs[k],from)).join('')}
  ${live.station?stationCard(id,placed):trainCard(id,placed,from)}
  ${placed.unknown.length?`<p class="fine">노선도에 없는 역(${placed.unknown.map(esc).join(', ')})에 있는 열차는 표시하지 않았어요.</p>`:''}
  <p class="fine">실시간 위치는 열차가 보낸 마지막 위치라 몇십 초 늦을 수 있어요. 자료: 서울시 실시간 지하철 위치.</p>`;
 bindLiveBody(el);
}
function bindLiveBody(el){
 el.querySelector('[data-live-refresh]')?.addEventListener('click',()=>{live.started=Date.now();loadLive();});
 el.querySelectorAll('[data-live-view]').forEach(b=>b.onclick=()=>{state.liveView=b.dataset.liveView;save();paintLiveBody();});
 el.querySelectorAll('[data-train]').forEach(b=>b.onclick=()=>{live.selected=live.selected===b.dataset.train?'':b.dataset.train;live.station='';paintLiveBody();});
 el.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>{live.station=live.station===b.dataset.stop?'':b.dataset.stop;live.selected='';paintLiveBody();});
 el.querySelector('[data-detail-close]')?.addEventListener('click',()=>{live.selected='';live.station='';paintLiveBody();});
 el.querySelector('[data-station-from]')?.addEventListener('click',()=>{state.from=live.station;save();paintLiveBody();});
 if(live.station){loadStationTimetable(live.station);loadStationArrivals(live.station);}
 el.querySelector('[data-live-resume]')?.addEventListener('click',()=>{live.started=Date.now();live.paused=false;loadLive();});
}
function stripHtml(id,seg,trains,from){
 const n=seg.stations.length,color=data.lines[id].color;
 const lanes={'-1':[],'1':[]};for(const t of [...trains].sort((a,b)=>a.p-b.p))lanes[t.d].push(t);
 for(const arr of Object.values(lanes)){let prev=-9;for(const t of arr){t.y=Math.max(t.p,prev+.7);prev=t.y;}}
 const stops=seg.stations.map((s,i)=>`<button type="button" data-stop="${esc(s)}" class="live-stop${data.stations[s]?.length>1?' transfer':''}${s===from?' mine':''}${live.station===s?' selected':''}" style="top:${i*ROW}px" aria-label="${esc(s)} 역 정보"><span>${esc(s)}</span></button>`).join('');
 const chips=[...lanes['-1'],...lanes['1']].map(t=>`<button type="button" data-train="${esc(t.no)}" class="live-train ${t.d>0?'down':'up'}${live.selected===t.no?' selected':''}" style="top:${(t.y*ROW+(ROW-TRAIN_H)/2).toFixed(1)}px" aria-label="${esc(`열차 ${t.no} ${t.destName||t.destination}행 ${t.station} ${STATUS[t.status]||''}`)}">${TRAIN_SVG}<span class="train-label"><b>${esc(t.destName||t.destination)}${t.express?'<em>급행</em>':''}${t.last?'<em class="last">막차</em>':''}</b><small>${statusChip(t.status)}${esc(t.no)}</small></span></button>`).join('');
 const height=Math.max(n,Math.ceil(Math.max(0,...trains.map(t=>t.y+1))))*ROW;
 return `<div class="live-strip" style="--line-color:${color}">${statusLegend()}<div class="live-lane-head"><span>${seg.oneway?'':`↑ ${esc(laneName(id,seg,-1))}`}</span><span></span><span>${esc(laneName(id,seg,1))} ↓</span></div>
  <div class="live-track" style="height:${height}px"><i class="live-rail" style="top:${ROW/2}px;height:${(n-1)*ROW}px"></i>${stops}${chips}</div></div>`;
}
// 열차 아이콘(앞머리가 위, 아래로 가는 열차는 CSS로 뒤집음)
const TRAIN_H=40;
const TRAIN_SVG='<svg class="train-icon" viewBox="0 0 16 30" aria-hidden="true"><path d="M2 10C2 4 4.5 1 8 1s6 3 6 9v16.5c0 1.4-1.1 2.5-2.5 2.5h-7A2.5 2.5 0 0 1 2 26.5Z" fill="currentColor"/><path d="M4.5 9.5C4.5 6.2 6 4.5 8 4.5s3.5 1.7 3.5 5V11h-7Z" fill="#fff" opacity=".92"/><rect x="4.5" y="14" width="7" height="3.5" rx="1" fill="#fff" opacity=".7"/><rect x="4.5" y="20" width="7" height="3.5" rx="1" fill="#fff" opacity=".7"/></svg>';
// 역 정보: 실시간으로 오는 열차 + 시간표 다음 출발
const ttPending=new Set(),arrivalsCache=new Map(),arrPending=new Set();
const CONG_CLASS={'여유':'ok','보통':'mid','붐빔':'busy','매우 붐빔':'very'};
const congChip=c=>c?`<span class="cong cong-${CONG_CLASS[c.level]||'mid'}" title="평소 ${esc(c.slot)} 무렵 평균, 정원 대비 ${c.percent}%">${esc(c.level)} ${c.percent}%</span>`:'';
const ARRIVAL_CODES={0:'진입 중',1:'도착',2:'출발',3:'전역 출발',4:'전역 진입',5:'전역 도착'};
function arrivalWhen(t){if(t.seconds!==null&&t.seconds>=60)return `${Math.round(t.seconds/60)}분 후`;if(t.seconds!==null&&t.seconds>0)return '곧 도착';return ARRIVAL_CODES[t.code]||t.message||'운행 중';}
function loadStationArrivals(name){
 const hit=arrivalsCache.get(name);if(hit&&Date.now()-hit.at<20e3||arrPending.has(name))return;
 arrPending.add(name);
 fetch('/api/subway/arrivals?station='+encodeURIComponent(name)).then(r=>r.json().then(v=>{if(!r.ok)throw Error(v.error||'도착정보를 불러오지 못했어요.');return v;}))
  .then(value=>arrivalsCache.set(name,{at:Date.now(),value}),e=>arrivalsCache.set(name,{at:Date.now(),value:{error:e.message}}))
  .finally(()=>{arrPending.delete(name);if(live.station===name)paintLiveBody();});
}
function loadStationTimetable(name){
 const hit=departuresCache.get(name);if(hit&&Date.now()-hit.at<60e3||ttPending.has(name))return;
 ttPending.add(name);
 fetch('/api/subway/departures?station='+encodeURIComponent(name)).then(r=>r.json().then(v=>{if(!r.ok)throw Error(v.error||'시간표를 불러오지 못했어요.');return v;}))
  .then(value=>departuresCache.set(name,{at:Date.now(),value}),e=>departuresCache.set(name,{at:Date.now(),value:{error:e.message}}))
  .finally(()=>{ttPending.delete(name);if(live.station===name)paintLiveBody();});
}
function stationCard(id,placed){
 const name=live.station;if(!name)return '';
 const line=data.lines[id],seg=line.segments.find(s=>s.stations.includes(name));
 const near=approaching(data,id,placed,name);
 const tt=departuresCache.get(name)?.value,ttLine=tt?.lines?.find(l=>l.line===id);
 const dirLane=direction=>seg?laneName(id,seg,id==='2'?(direction==='내선'?1:-1):(direction==='상행'?-1:1)):direction;
 const arr=arrivalsCache.get(name)?.value,arrLine=arr?.lines?.find(l=>l.line===id);
 const official=arrLine?.directions?.length?arrLine.directions.map(d=>`<div class="arr-dir"><div class="arr-head"><b>${esc(d.label||(d.dir==='up'?'상행':'하행'))}</b>${congChip(d.congestion)}</div>${d.trains.slice(0,2).map(t=>`<div class="arr-row"><strong>${esc(arrivalWhen(t))}</strong><small>${destText(t.destination)}${t.express?` <em class="tag-express">${esc(t.express)}</em>`:''}${t.last?' <em class="tag-last">막차</em>':''} · ${esc(t.no)} · ${Number.isFinite(t.code)&&t.code!==99&&t.near?`${statusChip(t.code)}현재 ${esc(t.near)}`:`${statusChip(99)}${esc(t.message)}`}</small></div>`).join('')}</div>`).join(''):null;
 const realtime=official??(arr&&!arr.needsKey&&!arr.error&&!arrLine?'<p class="fine">지금 이 역 도착 정보가 없어요.</p>':null)??(near.length?near.map(n=>`<div class="detail-row"><span>${esc(n.lane)}</span><b>${n.dist<.15?'곧 도착':`약 ${Math.max(1,Math.round(n.minutes))}분`}</b><small>${n.dist<.15?'':`${Math.max(1,Math.ceil(n.dist-.15))}정거장 전 · `}${destText(n.train.destName||n.train.destination)} · ${esc(n.train.no)}</small></div>`).join(''):'<p class="fine">지금 이 역으로 오는 열차가 보이지 않아요.</p>');
 const timetable=tt?.needsKey?'<p class="fine">시간표 인증키가 필요해요.</p>':tt?.error?`<p class="fine">${esc(tt.error)}</p>`:!tt?'<p class="fine">시간표를 불러오고 있어요…</p>':ttLine?.directions?.length?ttLine.directions.filter(d=>d.trains.length).map(d=>`<div class="detail-row"><span>${esc(dirLane(d.direction))}</span><b>${d.trains.slice(0,3).map(t=>esc(t.time)).join(' · ')}</b><small>${destText(d.trains[0].destination)}</small></div>`).join(''):'<p class="fine">오늘 남은 열차가 없어요.</p>';
 return `<div class="live-detail" role="dialog" aria-label="${esc(name)} 역 정보" style="--line-color:${line.color}"><div class="live-detail-head"><b>${esc(name)}</b>${(data.stations[name]||[]).map(l=>`<span class="line-badge" style="--line-color:${data.lines[l].color}">${esc(data.lines[l].name)}</span>`).join('')}<button type="button" class="pick-clear" data-detail-close aria-label="닫기">×</button></div>
  <div class="detail-block"><small class="detail-title">실시간 도착 · 평소 혼잡도</small>${realtime}${official?'<p class="fine cong-note">혼잡도는 서울교통공사의 이 시간대 평소 평균이에요(정원 대비, 34%면 좌석이 다 찬 정도). 9호선·코레일 구간은 자료가 없어요.</p>':''}</div>
  <div class="detail-block"><small class="detail-title">시간표 · 다음 출발</small>${timetable}</div>
  <button type="button" class="secondary detail-action" data-station-from${state.from===name?' disabled':''}>${state.from===name?'출발역으로 설정됨':'출발역으로 설정'}</button></div>`;
}
// 열차 하나의 정보(실시간 자료 그대로 + 출발역까지 예상)
function trainInfo(id,placed,t,from){
 const k=placed.segs.findIndex(list=>list.includes(t)),seg=data.lines[id].segments[k];
 const info={lane:laneName(id,seg,t.d),toFrom:null};
 const i=from?seg.stations.indexOf(from):-1;
 if(i>=0){const loop=seg.stations[0]===seg.stations.at(-1),L=seg.stations.length-1;let dist=(i-t.p)*t.d;if(loop)dist=((dist%L)+L)%L;if(dist>=-.05)info.toFrom={dist,minutes:travelMinutes(seg,t.p,i,t.d)};}
 return info;
}
function trainCard(id,placed,from){
 if(!live.selected)return '';
 const t=placed.segs.flat().find(x=>x.no===live.selected);
 if(!t)return `<div class="live-detail" role="dialog" aria-label="열차 정보"><div class="live-detail-head"><b>열차 ${esc(live.selected)}</b><button type="button" class="pick-clear" data-detail-close aria-label="닫기">×</button></div><p class="fine">이 열차는 지금 목록에 없어요. 운행을 마쳤거나 정보가 잠시 비어 있을 수 있어요.</p></div>`;
 const info=trainInfo(id,placed,t,from),line=data.lines[id];
 const rows=[['행선지',`${destText(t.destName||t.destination)}`],['현재 위치',`${statusChip(t.status)}${esc(stationName(data,t.station)||t.station)}`],['방향',esc(info.lane)],['종류',`${t.express?'급행':'일반'}${t.last?' · 막차':''}`]];
 if(info.toFrom)rows.push([`${esc(from)}까지`,info.toFrom.dist<.15?'곧 도착':`약 ${Math.max(1,Math.round(info.toFrom.minutes))}분 · ${Math.max(1,Math.ceil(info.toFrom.dist-.15))}정거장`]);
 if(t.at)rows.push(['위치 수신',esc(t.at.slice(11,19))]);
 return `<div class="live-detail" role="dialog" aria-label="열차 정보" style="--line-color:${line.color}"><div class="live-detail-head"><span class="line-badge">${esc(line.name)}</span><b>열차 ${esc(t.no)}</b><button type="button" class="pick-clear" data-detail-close aria-label="닫기">×</button></div><dl>${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><p class="fine">열차번호는 운행 편성 번호예요. 실제 차량(객차) 번호는 공개 자료에 없어요.</p></div>`;
}
function trainList(id,placed,from){
 const all=placed.segs.flatMap((list,k)=>list.map(t=>({t,k}))).sort((a,b)=>a.t.d-b.t.d||a.k-b.k||a.t.p-b.t.p);
 return `<div class="live-list" role="table" aria-label="열차 목록"><div class="live-list-row head" role="row"><span>열차</span><span>행선지</span><span>현재 위치</span><span>방향</span></div>${all.map(({t})=>{const info=trainInfo(id,placed,t,from);return `<button type="button" class="live-list-row${live.selected===t.no?' selected':''}" role="row" data-train="${esc(t.no)}"><span><b>${esc(t.no)}</b>${t.express?' <em>급행</em>':''}${t.last?' <em>막차</em>':''}</span><span>${destText(t.destName||t.destination)}</span><span>${statusChip(t.status)}${esc(stationName(data,t.station)||t.station)}</span><span>${esc(info.lane)}${info.toFrom&&info.toFrom.dist<40?` · <small>${esc(from)}까지 ${info.toFrom.dist<.15?'곧':'약 '+Math.max(1,Math.round(info.toFrom.minutes))+'분'}</small>`:''}</span></button>`;}).join('')}</div>`;
}
