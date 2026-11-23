// 서울 열린데이터광장 지하철 시간표로 '지금 이후 가장 가까운 열차'를 찾습니다.
// 인증키(SEOUL_OPENAPI_KEY)가 없으면 needsKey를 돌려주고, 화면은 연결 안내를 보여줍니다.
import {readFileSync} from 'node:fs';
import {findRouteVia,stationName} from './subway.mjs';
const BASE='http://openapi.seoul.go.kr:8088';
const cache=new Map();
const cached=async(key,ttl,load)=>{const hit=cache.get(key);if(hit&&Date.now()-hit.at<ttl)return hit.value;const value=await load();cache.set(key,{at:Date.now(),value});return value;};

export const normalizeName=raw=>{let n=String(raw||'').replace(/\(.*?\)/g,'').trim();if(n.endsWith('역')&&n!=='서울역'&&n.length>2)n=n.slice(0,-1);return n==='이수'?'총신대입구':n;};
// 역사마스터의 노선명 → 1~9호선(코레일·연장 구간 포함)
const ROUTE_LINES={'경부선':'1','경인선':'1','경원선':'1','장항선':'1','일산선':'3','과천선':'4','안산선':'4','진접선':'4','별내선':'8','7호선(인천)':'7','9호선(연장)':'9'};
const lineNumber=route=>{const r=String(route||'');if(ROUTE_LINES[r])return ROUTE_LINES[r];const m=r.match(/^0?([1-9])호선$/);return m?m[1]:null;};

// 한국 시간 기준 요일 구분: 1 평일, 2 토요일, 3 일요일(공휴일은 구분하지 않음)
export function weekTag(now=new Date()){
 const day=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short'}).format(now);
 return day==='Sat'?'2':day==='Sun'?'3':'1';
}
export function kstMinutes(now=new Date()){
 const [h,m]=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).split(':').map(Number);
 return h*60+m;
}
// '24:05:00'처럼 자정을 넘긴 표기를 '00:05'로 표시
const clock=text=>{const [h,m]=String(text).split(':');return String(Number(h)%24).padStart(2,'0')+':'+m;};
const toMinutes=text=>{const [h,m,s]=String(text||'').split(':').map(Number);return Number.isFinite(h)?h*60+m+(s||0)/60:null;};

async function call(key,service,path,fetcher){
 const url=`${BASE}/${encodeURIComponent(key)}/json/${service}/${path}`;
 const response=await fetcher(url,{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('지하철 정보 서버에 연결하지 못했어요.');
 const body=await response.json().catch(()=>null);
 const result=body?.[service]?.RESULT||body?.RESULT;
 if(result&&!['INFO-000','INFO-200'].includes(result.CODE))throw Error(result.CODE==='INFO-100'?'지하철 인증키가 올바르지 않아요.':`지하철 정보 조회 실패(${result.CODE})`);
 return body?.[service]?.row||[];
}

// 역 이름 → 노선별 역코드(서울시 역사마스터)
async function stationCodes(key,name,fetcher){
 const master=await cached('master',24*3600e3,()=>call(key,'subwayStationMaster','1/1000/',fetcher));
 const data=loadSubwayData(),target=canonical(data,name);
 return master.filter(r=>lineNumber(r.ROUTE)&&canonical(data,r.BLDN_NM)===target).map(r=>({line:lineNumber(r.ROUTE),code:r.BLDN_ID}));
}

// 시간표 행 → 지금 이후 출발 열차(방향별 최대 count개)
export function upcoming(rows,nowMinutes,count=3,line=''){
 const loop=line==='2';// 2호선 순환열차는 원본에 출발·종착이 모두 성수로 기록됨
 const groups=new Map();
 for(const r of rows){
  const left=toMinutes(r.LEFTTIME),arrive=toMinutes(r.ARRIVETIME);
  const time=left&&left>0?left:null;// 종착역 도착만 있는 행(출발 00:00:00)은 제외
  if(time===null)continue;
  let t=time;if(t<nowMinutes-180)t+=24*60;// 자정 넘은 시간 보정
  if(t<nowMinutes)continue;
  const key=r.INOUT_TAG;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({time:clock(r.LEFTTIME),minutesLeft:Math.round(t-nowMinutes),destination:loop&&r.ORIGINSTATION&&r.ORIGINSTATION===r.DESTSTATION?(r.INOUT_TAG==='1'?'내선순환':'외선순환'):normalizeName(r.SUBWAYENAME),express:r.EXPRESS_YN==='Y'||r.EXPRESS_YN==='E',arrive:arrive?clock(r.ARRIVETIME):null});
 }
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([inout,list])=>({direction:loop?(inout==='1'?'내선':'외선'):(inout==='1'?'상행':'하행'),trains:list.sort((a,b)=>a.minutesLeft-b.minutesLeft).slice(0,count)}));
}

export async function departures(name,{key=process.env.SEOUL_OPENAPI_KEY,fetcher=fetch,now=new Date()}={}){
 if(!key)return {needsKey:true,station:normalizeName(name)};
 const codes=await stationCodes(key,name,fetcher);
 if(!codes.length)throw Error('시간표에서 역을 찾지 못했어요.');
 const tag=weekTag(now),nowMinutes=kstMinutes(now);
 const lines=[];
 for(const {line,code} of codes){
  const rows=[];
  for(const inout of ['1','2']){
   rows.push(...await cached(`tt:${code}:${tag}:${inout}`,12*3600e3,()=>call(key,'SearchSTNTimeTableByIDService',`1/500/${code}/${tag}/${inout}/`,fetcher)));
  }
  lines.push({line,directions:upcoming(rows,nowMinutes,3,line)});
 }
 return {station:normalizeName(name),weekTag:tag,lines:lines.sort((a,b)=>a.line.localeCompare(b.line))};
}
export function clearSubwayCache(){cache.clear();}

// 실시간 열차 위치(서울시 실시간 지하철 API, 인증키 SEOUL_SUBWAY_KEY). 하루 1,000건 제한이라 노선별 15초 캐시
const REALTIME='http://swopenapi.seoul.go.kr/api/subway';
const cleanDestination=raw=>normalizeName(raw).replace(/(종착|지선)$/,'');
export function parsePositions(list){
 return (list||[]).map(x=>({no:String(x.trainNo||''),station:normalizeName(x.statnNm),updn:Number(x.updnLine)===1?1:0,destination:cleanDestination(x.statnTnm),status:Number(x.trainSttus)||0,express:x.directAt==='1'||x.directAt==='7',last:x.lstcarAt==='1',at:x.recptnDt||null})).filter(t=>t.station)
  // 같은 열차가 두 번 오는 경우(운영기관 경계 구간에서 예전·지금 위치가 함께 옴)는 가장 최근 수신만 남김
  .reduce((list,t)=>{const i=list.findIndex(x=>x.no&&x.no===t.no);if(i<0)list.push(t);else if((t.at||'')>=(list[i].at||''))list[i]=t;return list;},[]);
}
export async function positions(line,{key=process.env.SEOUL_SUBWAY_KEY,fetcher=fetch,now=Date.now}={}){
 line=String(line||'');if(!/^[1-9]$/.test(line))throw Error('노선을 확인해 주세요.');
 if(!key)return {needsKey:true,line};
 return cached(`pos:${line}`,15e3,async()=>{
  const response=await fetcher(`${REALTIME}/${encodeURIComponent(key)}/json/realtimePosition/0/200/${encodeURIComponent(line+'호선')}`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('실시간 지하철 서버에 연결하지 못했어요.');
  const body=await response.json().catch(()=>null);
  const info=body?.errorMessage||body||{};
  if(info.code&&!['INFO-000','INFO-200'].includes(info.code))throw Error(info.code==='INFO-100'?'실시간 지하철 인증키가 올바르지 않아요.':info.code==='ERROR-337'?'오늘 실시간 조회 한도를 다 썼어요. 내일 다시 볼 수 있어요.':`실시간 위치 조회 실패(${info.code})`);
  return {line,fetchedAt:new Date(now()).toISOString(),trains:parsePositions(body?.realtimePositionList)};
 });
}

// ---------- 탑승 계획: 경로를 시간표에 맞춰 '어느 열차를 타면 되는지' ----------
// 타는 역 시간표에서 지금(또는 고른 시각) 이후 열차를 고르고, 내리는 역 시간표에서 같은 열차번호의 도착 시각을 찾습니다.
// 내리는 역 시간표가 없으면 행선지가 내리는 역 너머인지 확인하고 표준 운행시간으로 도착을 추정합니다.
let subwayData=null;
const loadSubwayData=()=>subwayData??=JSON.parse(readFileSync(new URL('./public/subway-data.json',import.meta.url),'utf8'));
const canonical=(data,name)=>stationName(data,normalizeName(name))||normalizeName(name);

// 같은 노선에서 stations 방향으로 계속 가면 dest에 닿는지, 그리고 그 사이에 alight가 있는지
export function servesStation(data,line,stations,dest){
 if(!dest||!data.stations[dest]||!data.stations[dest].includes(line))return true;// 노선 데이터 밖 행선지(진접 등)는 통과로 봄
 const alight=stations.at(-1);if(dest===alight||stations.includes(dest)&&stations.indexOf(dest)>=stations.length-1)return true;
 if(stations.slice(1).includes(dest))return false;// 내리기 전에 끝남
 const next=new Map();const add=(a,b)=>{if(!next.has(a))next.set(a,[]);next.get(a).push(b);};
 for(const seg of data.lines[line].segments)for(let i=0;i<seg.stations.length-1;i++){add(seg.stations[i],seg.stations[i+1]);if(!seg.oneway)add(seg.stations[i+1],seg.stations[i]);}
 const prev=stations.at(-2),seen=new Set(stations),queue=[[alight,prev]];
 while(queue.length){const [at,from]=queue.shift();for(const n of next.get(at)||[]){if(n===from||seen.has(n))continue;if(n===dest)return true;seen.add(n);queue.push([n,at]);}}
 return false;
}
const minutesOf=row=>{const a=toMinutes(row.ARRIVETIME),l=toMinutes(row.LEFTTIME);return {arrive:a>0?a:l>0?l:null,left:l>0?l:null};};

async function lineCode(key,name,line,fetcher){return (await stationCodes(key,name,fetcher)).find(c=>c.line===line)?.code||null;}
async function timetable(key,code,tag,fetcher){
 const rows=[];for(const inout of ['1','2'])rows.push(...await cached(`tt:${code}:${tag}:${inout}`,12*3600e3,()=>call(key,'SearchSTNTimeTableByIDService',`1/500/${code}/${tag}/${inout}/`,fetcher)));
 return rows;
}
// 2호선 순환 구간의 진행 방향 → 시간표 상하행 구분(1 내선=노선 데이터 정방향, 2 외선)
function loopInout(data,leg){
 if(leg.line!=='2')return null;const seg=data.lines['2'].segments.find(s=>s.stations[0]===s.stations.at(-1));if(!seg)return null;
 const i0=seg.stations.indexOf(leg.stations[0]),i1=seg.stations.indexOf(leg.stations[1]);if(i0<0||i1<0)return null;
 let d=i1-i0;if(Math.abs(d)>1)d=-Math.sign(d);return d>0?'1':'2';
}
// leg 하나: t분 이후 출발하는 열차 중 이 구간을 실제로 가는 첫 열차와 다음 열차들
export function pickTrains(data,leg,boardRows,alightRows,t,count=3){
 const data2=data,byTrain=new Map();for(const r of alightRows){const m=minutesOf(r);if(m.arrive!==null)byTrain.set(r.TRAIN_NO,m.arrive);}
 const limit=leg.minutes*1.6+8,out=[],want=loopInout(data,leg);
 const rows=boardRows.map(r=>({r,left:minutesOf(r).left})).filter(x=>x.left!==null&&x.left>=t).sort((a,b)=>a.left-b.left);
 for(const {r,left} of rows){
  const loop=r.ORIGINSTATION&&r.ORIGINSTATION===r.DESTSTATION;
  const destination=loop&&leg.line==='2'?(r.INOUT_TAG==='1'?'내선순환':'외선순환'):canonical(data2,r.SUBWAYENAME);
  let arrive=byTrain.get(r.TRAIN_NO),estimated=false;
  if(arrive!==undefined&&arrive<left)arrive+=24*60;
  const matched=arrive!==undefined&&arrive>left&&arrive-left<=limit;// 아니면 반대 방향이거나 돌아가는 열차
  if(matched){}
  else if(loop&&leg.line==='2'&&alightRows.length&&(!want||r.INOUT_TAG===want)){// 2호선 순환열차는 성수를 지나면 열차번호가 바뀜 → 같은 방향에서 예상 시각에 가장 가까운 도착
   const expect=left+leg.minutes,near=alightRows.filter(a=>a.INOUT_TAG===r.INOUT_TAG).map(a=>minutesOf(a).arrive).filter(v=>v!==null).map(v=>v<left?v+24*60:v).filter(v=>Math.abs(v-expect)<=4).sort((x,y)=>Math.abs(x-expect)-Math.abs(y-expect));
   if(!near.length)continue;arrive=near[0];
  }
  else if(alightRows.length||arrive!==undefined)continue;// 내리는 역에 서지 않거나(급행 통과 등) 방향이 다른 열차
  else{if(!(loop&&leg.line==='2')&&!servesStation(data2,leg.line,leg.stations,destination))continue;arrive=left+leg.minutes;estimated=true;}
  out.push({no:r.TRAIN_NO,depart:left,arrive,destination,express:r.EXPRESS_YN==='Y'||r.EXPRESS_YN==='E',estimated,inout:r.INOUT_TAG});
  if(out.length>=count)break;
 }
 return out;
}
const hm=m=>{if(m===null||m===undefined)return null;const r=Math.round(m);return clock(`${Math.floor(r/60)}:${String(r%60).padStart(2,'0')}`);};
export async function plan({from,via='',to,mode='fastest',time=''},{key=process.env.SEOUL_OPENAPI_KEY,fetcher=fetch,now=new Date(),data=loadSubwayData()}={}){
 const route=findRouteVia(data,from,via,to,{mode});
 if(!key)return {needsKey:true};
 const tag=weekTag(now);
 const set=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time||'');
 const start=set?Number(set[1])*60+Number(set[2]):kstMinutes(now);
 let t=start;const legs=[];
 for(let k=0;k<route.legs.length;k++){
  const leg=route.legs[k];
  const [bc,ac]=await Promise.all([lineCode(key,leg.from,leg.line,fetcher),lineCode(key,leg.to,leg.line,fetcher)]);
  const boardRows=bc?await timetable(key,bc,tag,fetcher):[],alightRows=ac?await timetable(key,ac,tag,fetcher):[];
  const trains=boardRows.length?pickTrains(data,leg,boardRows,alightRows,t):[];
  const first=trains[0];
  const depart=first?first.depart:t,arrive=first?first.arrive:t+leg.minutes;
  legs.push({line:leg.line,name:leg.name,color:leg.color,from:leg.from,to:leg.to,stops:leg.stops,wait:Math.round(depart-t),depart:hm(depart),arrive:hm(arrive),
   train:first?{no:first.no,destination:first.destination,express:first.express}:null,estimated:!first||first.estimated,
   next:trains.slice(1).map(x=>({depart:hm(x.depart),destination:x.destination,express:x.express}))});
  const dir=first?.inout?(first.inout==='1'?'up':'down'):null;
  if(dir){const levels=leg.stations.slice(0,-1).map(st=>congestionAt(st,leg.line,dir,depart,tag)).filter(Boolean);if(levels.length){const top=levels.reduce((a,b)=>b.percent>a.percent?b:a);legs.at(-1).congestion={...top,station:leg.stations[levels.indexOf(top)]};}}
  const transfer=route.transfers[k];
  t=arrive+(transfer?(transfer.walk??3):0);
  if(transfer)legs.at(-1).transfer={station:transfer.station,walk:transfer.walk??3,toLine:transfer.toLine};
 }
 const endMinutes=t;
 return {weekTag:tag,start:hm(start),startMode:set?'set':'now',arrive:hm(endMinutes),minutes:Math.round(endMinutes-start),legs,routeMinutes:route.minutes};
}

// ---------- 평균 혼잡도(서울교통공사, 1~8호선, 30분 단위) ----------
// 값은 정원(좌석+입석 160명) 대비 %. 약 34%면 좌석이 다 찬 정도라 그 기준으로 4단계로 나눔
let congestionData=null;
const loadCongestion=()=>congestionData??=JSON.parse(readFileSync(new URL('./subway-congestion.json',import.meta.url),'utf8'));
export const congestionLevel=v=>v<35?'여유':v<80?'보통':v<130?'붐빔':'매우 붐빔';
export function congestionAt(station,line,dir,minutes,tag,source=loadCongestion()){
 const list=source.stations[station]?.[line]?.[dir]?.[{1:'weekday',2:'sat',3:'sun'}[tag]];if(!list)return null;
 let m=Math.round(minutes)%1440;if(m<300)m+=1440;// 자정 이후는 전날 시간표 칸(00:00·00:30)
 const i=Math.floor((m-330)/30),v=list[i];
 return i>=0&&i<list.length&&v!==null&&v!==undefined?{percent:v,level:congestionLevel(v),slot:source.slots[i]}:null;
}

// ---------- 역 실시간 도착정보(실시간 지하철 키, 역별 20초 캐시) ----------
// 도착정보 API의 역 이름이 노선도 이름과 다른 경우. 그 밖에는 역사마스터의 원래 이름(괄호 포함)으로 한 번 더 찾음
const ARRIVAL_NAMES={'서울역':['서울'],'총신대입구':['총신대입구(이수)'],'당고개':['불암산']};
const arrivalNameCache=new Map();
export function parseArrivals(list,{data=loadSubwayData(),now=Date.now()}={}){
 const lines=new Map();
 for(const x of list||[]){
  const line=String(Number(x.subwayId)-1000);if(!/^[1-9]$/.test(line))continue;
  const dir=['상행','내선'].includes(x.updnLine)?'up':'down';
  const received=Date.parse(String(x.recptnDt||'').replace(' ','T')+'+09:00');
  const raw=Number(x.barvlDt)||0,elapsed=Number.isFinite(received)?Math.max(0,(now-received)/1000):0;
  const train={no:String(x.btrainNo||''),destination:canonical(data,x.bstatnNm),heading:String(x.trainLineNm||''),message:String(x.arvlMsg2||''),near:String(x.arvlMsg3||''),code:Number(x.arvlCd),seconds:raw>0?Math.max(0,Math.round(raw-elapsed)):null,express:x.btrainSttus&&x.btrainSttus!=='일반'?String(x.btrainSttus):'',last:x.lstcarAt==='1',order:String(x.ordkey||'')};
  if(!lines.has(line))lines.set(line,{line,directions:{}});
  const group=lines.get(line).directions;(group[dir]??={dir,label:'',trains:[]}).trains.push(train);
 }
 return [...lines.values()].sort((a,b)=>a.line.localeCompare(b.line)).map(l=>({line:l.line,directions:['up','down'].filter(d=>l.directions[d]).map(d=>{const g=l.directions[d];g.trains.sort((a,b)=>a.order.localeCompare(b.order));g.label=(g.trains[0].heading.split(' - ')[1]||'').replace(/\((?!급행)[^)]*\)/g,'').trim();return g;})}));
}
export async function arrivals(name,{key=process.env.SEOUL_SUBWAY_KEY,fetcher=fetch,now=new Date(),data=loadSubwayData()}={}){
 const station=canonical(data,name);
 if(!data.stations[station])throw Error('역 이름을 확인해 주세요.');
 if(!key)return {needsKey:true,station};
 const fetchName=async apiName=>{
  const response=await fetcher(`${REALTIME}/${encodeURIComponent(key)}/json/realtimeStationArrival/0/40/${encodeURIComponent(apiName)}`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('실시간 지하철 서버에 연결하지 못했어요.');
  const body=await response.json().catch(()=>null),info=body?.errorMessage||body||{};
  if(info.code&&!['INFO-000','INFO-200'].includes(info.code))throw Error(info.code==='ERROR-337'?'오늘 실시간 조회 한도를 다 썼어요.':`실시간 도착정보 조회 실패(${info.code})`);
  return body?.realtimeArrivalList||[];
 };
 const list=await cached(`arr:${station}`,20e3,async()=>{
  const known=arrivalNameCache.get(station);if(known)return fetchName(known);
  const names=[...(ARRIVAL_NAMES[station]||[station])];
  for(let i=0;i<names.length;i++){
   const rows=await fetchName(names[i]);if(rows.length){arrivalNameCache.set(station,names[i]);return rows;}
   if(i===names.length-1&&process.env.SEOUL_OPENAPI_KEY){// 역사마스터의 원래 이름으로 한 번 더
    const master=await cached('master',24*3600e3,()=>call(process.env.SEOUL_OPENAPI_KEY,'subwayStationMaster','1/1000/',fetcher)).catch(()=>[]);
    for(const r of master)if(canonical(data,r.BLDN_NM)===station&&!names.includes(r.BLDN_NM))names.push(r.BLDN_NM);
   }
  }
  return [];
 });
 const tag=weekTag(now),minutes=kstMinutes(now);
 const lines=parseArrivals(list,{data,now:now.getTime()}).filter(l=>data.stations[station].includes(l.line));
 for(const l of lines)for(const d of l.directions)d.congestion=congestionAt(station,l.line,d.dir,minutes,tag);
 return {station,lines};
}

// ---------- 프로필별 지하철 저장(최근·즐겨찾기 경로, 경로 기준, 실시간 노선) ----------
export function sanitizeSubwaySaved(input,{data=loadSubwayData()}={}){
 const station=v=>{const n=stationName(data,String(v||'').slice(0,30));return n||'';};
 const route=r=>{if(!r||typeof r!=='object')return null;const from=station(r.from),to=station(r.to),via=station(r.via);return from&&to&&from!==to?{from,via:via&&via!==from&&via!==to?via:'',to}:null;};
 const list=(items,max)=>{const out=[];for(const r of Array.isArray(items)?items:[]){const v=route(r);if(v&&!out.some(o=>o.from===v.from&&o.via===v.via&&o.to===v.to))out.push(v);if(out.length>=max)break;}return out;};
 return {recent:list(input?.recent,8),favorites:list(input?.favorites,12),mode:input?.mode==='fewest'?'fewest':'fastest',liveLine:/^[1-9]$/.test(String(input?.liveLine||''))?String(input.liveLine):'',updatedAt:new Date().toISOString()};
}
