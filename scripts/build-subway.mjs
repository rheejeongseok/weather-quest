// 공공데이터 원본(data-src/subway)을 경로 계산용 public/subway-data.json으로 조립합니다.
// 실행: node scripts/build-subway.mjs
import {readFileSync,writeFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const csv=file=>readFileSync(new URL('data-src/subway/'+file,root),'utf8').trim().split(/\r?\n/).slice(1).map(line=>line.split(','));

// 역 이름 정리: 괄호 부기명 제거, 공백 제거, '신내역' 같은 표기 통일. 같은 역의 다른 이름은 별칭으로 합칩니다.
const ALIASES={'이수':'총신대입구','불암산':'당고개'};
export function normalizeStation(raw){
 let name=String(raw||'').replace(/\(.*?\)/g,'').trim();
 if(name.endsWith('역')&&name!=='서울역'&&name.length>2)name=name.slice(0,-1);
 return ALIASES[name]||name;
}
// 거리만 있는 구간(9호선·코레일·인천 구간)의 운행시간 추정식.
// 서울교통공사 1~8호선 271개 구간의 표준 운행시간을 거리로 회귀한 결과(오차 약 0.3분).
const minutesFromDistance=km=>Math.round((0.40+1.05*km)*10)/10;
const mmss=text=>{const [m,s]=String(text).split(':').map(Number);return Math.round((m+(s||0)/60)*10)/10;};

// ---- 서울교통공사 1~8호선(소요시간: 직전 역에서 걸린 시간) ----
const metro=csv('seoulmetro-interstation.csv').map(([,line,name,time,km])=>({line,name:normalizeStation(name),time:mmss(time),km:Number(km)}));
const metroLine=line=>metro.filter(r=>r.line===line);
// 직전 역 기준 시간 목록 → [역 목록, 구간 시간 목록]
function fromPrevious(rows){return {stations:rows.map(r=>r.name),times:rows.slice(1).map(r=>r.time),est:rows.slice(1).map(()=>0)};}
// 이어진 역 목록을 분기 지점에서 나눕니다. 각 분기의 첫 행은 '분기점에서 걸린 시간'입니다.
function branch(rows,start,end,junction){
 const part=rows.slice(start,end);
 return {stations:[junction,...part.map(r=>r.name)],times:part.map(r=>r.time),est:part.map(()=>0)};
}
// ---- 거리 자료(다음 역까지 거리) ----
function fromNextDistance(rows){
 const stations=rows.map(r=>normalizeStation(r.name));
 const times=rows.slice(0,-1).map(r=>minutesFromDistance(Number(r.km)||1));
 return {stations,times,est:times.map(()=>1)};
}
const korail=csv('korail-distance.csv').map(([,line,name,km])=>({line,name,km}));
const korailLine=label=>korail.filter(r=>r.line===label);
const take=(rows,from,to)=>{const names=rows.map(r=>normalizeStation(r.name));const a=names.indexOf(from),b=names.indexOf(to);if(a<0||b<0)throw Error(`구간을 찾지 못했어요: ${from}→${to}`);return rows.slice(a,b+1);};

const segments={};
// 1호선: 경원선(연천~회기) + 서울교통공사(청량리~서울역) + 경부·경인 본선, 광명·서동탄 지선
{
 const gyeongin=korailLine('1호선(경인선)'),gyeongbu=korailLine('1호선(경부선)'),gwangmyeong=korailLine('1호선(광명선)'),seodongtan=korailLine('1호선(서동탄선)');
 const north=fromNextDistance(take(gyeongin,'연천','회기'));
 const city=fromPrevious(metroLine('1').slice().reverse().map((r,i,a)=>({...r,time:i===0?0:a[i-1].time})));// 청량리→서울역
 // 회기→청량리 거리는 코레일 자료의 회기 행(다음 역까지 1.4km)
 const hoegiKm=Number(take(gyeongin,'회기','회기')[0].km);
 const southRows=take(gyeongin,'남영','구로');
 const south=fromNextDistance(southRows);
 const trunk={stations:[...north.stations,...city.stations,...south.stations],
  times:[...north.times,minutesFromDistance(hoegiKm),...city.times,minutesFromDistance(1.7),...south.times],est:[...north.est,1,...city.est,1,...south.est],
  note:'서울역→남영 거리는 자료에 없어 1.7km로 추정'};
 const incheon=fromNextDistance(take(gyeongin,'구로','인천'));
 const busan=fromNextDistance(take(gyeongbu,'구로','신창'));
 const gm=fromNextDistance(take(gwangmyeong,'금천구청','광명'));
 const sdt=fromNextDistance(take(seodongtan,'병점','서동탄'));
 segments['1']=[trunk,incheon,busan,gm,sdt];
}
// 2호선: 순환선 + 성수지선 + 신정지선
{
 const rows=metroLine('2');const names=rows.map(r=>r.name);
 const loopEnd=names.indexOf('시청',1);
 const loop=fromPrevious(rows.slice(0,loopEnd+1));
 const seongsuStart=names.indexOf('용답'),sinjeongStart=names.indexOf('도림천');
 segments['2']=[loop,branch(rows,seongsuStart,sinjeongStart,'성수'),branch(rows,sinjeongStart,rows.length,'신도림')];
}
// 3호선: 일산선(대화~삼송, 코레일 거리) + 서울교통공사(지축~오금)
{
 const ilsan=fromNextDistance(korailLine('3호선'));// 마지막 삼송 행의 거리는 지축까지
 const lastKm=Number(korailLine('3호선').at(-1).km);
 const seoul=fromPrevious(metroLine('3'));
 segments['3']=[{stations:[...ilsan.stations,...seoul.stations],times:[...ilsan.times,minutesFromDistance(lastKm),...seoul.times],est:[...ilsan.est,1,...seoul.est]}];
}
// 4호선: 서울교통공사(당고개~남태령) + 과천·안산선(선바위~오이도, 코레일 거리)
{
 const seoul=fromPrevious(metroLine('4'));
 const south=fromNextDistance(korailLine('4호선'));
 segments['4']=[{stations:[...seoul.stations,...south.stations],times:[...seoul.times,minutesFromDistance(1.8),...south.times],est:[...seoul.est,1,...south.est],
  note:'남태령→선바위 거리는 자료에 없어 1.8km로 추정. 진접선(별내별가람~진접)은 원본 자료에 없음'}];
}
// 5호선: 방화~하남검단산 본선 + 강동~마천 지선
{
 const rows=metroLine('5');const names=rows.map(r=>r.name);const split=names.indexOf('둔촌동');
 segments['5']=[fromPrevious(rows.slice(0,split)),branch(rows,split,rows.length,'강동')];
}
// 6호선: 응암순환(한 방향: 응암→역촌→불광→독바위→연신내→구산→응암) + 응암~신내
{
 const rows=metroLine('6');const names=rows.map(r=>r.name);const loopEnd=names.indexOf('응암',1);
 segments['6']=[{...fromPrevious(rows.slice(0,loopEnd+1)),oneway:true},fromPrevious(rows.slice(loopEnd))];
}
// 7호선: 서울교통공사(장암~온수) + 인천 구간(까치울~석남, 거리)
{
 const seoul=fromPrevious(metroLine('7'));
 const rows=csv('line7-distance.csv').map(([,,name,km])=>({name,km}));
 const names=rows.map(r=>normalizeStation(r.name));
 const onsu=names.indexOf('온수');
 const west=fromNextDistance(rows.slice(onsu));
 segments['7']=[{stations:[...seoul.stations,...west.stations.slice(1)],times:[...seoul.times,...west.times],est:[...seoul.est,...west.est]}];
}
// 8호선
segments['8']=[fromPrevious(metroLine('8'))];
segments['8'][0].note='별내선 연장(구리~별내)은 원본 자료에 없음';
// 9호선(거리, 급행 미반영)
{
 const rows=csv('line9-distance.csv').map(([,,name,km])=>({name,km}));
 segments['9']=[{...fromNextDistance(rows),note:'급행 정차는 반영하지 않음(일반열차 기준)'}];
}

// ---- 환승 도보시간(서울교통공사 환승역 자료) ----
const lineKey=label=>{const m=String(label).match(/^([1-9])호선/);return m?m[1]:null;};
const walks={};
for(const [,line,name,target,,time] of csv('seoulmetro-transfer.csv')){
 const a=lineKey(line+'호선'),b=lineKey(target);if(!a||!b||a===b)continue;
 const station=normalizeStation(name);const key=[a,b].sort().join('-');
 (walks[station]??={})[key]=Math.max(walks[station][key]||0,mmss(time));
}

const lines={
 '1':{name:'1호선',color:'#0052A4'},'2':{name:'2호선',color:'#00A84D'},'3':{name:'3호선',color:'#EF7C1C'},
 '4':{name:'4호선',color:'#00A5DE'},'5':{name:'5호선',color:'#996CAC'},'6':{name:'6호선',color:'#CD7C2F'},
 '7':{name:'7호선',color:'#747F00'},'8':{name:'8호선',color:'#E6186C'},'9':{name:'9호선',color:'#BDB092'}
};
for(const [id,segs] of Object.entries(segments)){
 for(const s of segs){if(s.times.length!==s.stations.length-1||s.est.length!==s.times.length)throw Error(`${id}호선 구간 길이가 맞지 않아요`);if(s.times.some(t=>!(t>0)))throw Error(`${id}호선에 0분 구간이 있어요`);}
 lines[id].segments=segs;
}
const stationLines={};
for(const [id,line] of Object.entries(lines))for(const s of line.segments)for(const name of s.stations)(stationLines[name]??=new Set()).add(id);
const stations=Object.fromEntries(Object.entries(stationLines).sort(([a],[b])=>a.localeCompare(b,'ko')).map(([name,set])=>[name,[...set].sort()]));
// ---- 역 좌표(노선도 그리기용) ----
// 우선순위: 서울교통공사 1~8호선 역사 좌표 → 국가철도공단 노선별 역위치. 같은 역의 노선별 좌표는 평균합니다.
const coordSum={};
const addCoord=(name,lat,lon)=>{if(!Number.isFinite(lat)||!Number.isFinite(lon))return;const key=normalizeStation(name);if(!stationLines[key])return;(coordSum[key]??=[]).push([lat,lon]);};
for(const [,,,name,lat,lon] of csv('seoulmetro-coords.csv'))addCoord(name,Number(lat),Number(lon));
for(const n of [1,2,3,4,5,6,7,9])for(const [,,name,lon,lat] of csv(`krna-line${n}-coords.csv`)){const key=normalizeStation(name);if(!coordSum[key])addCoord(name,Number(lat),Number(lon));}
const coords=Object.fromEntries(Object.entries(coordSum).map(([k,list])=>[k,[+(list.reduce((s,p)=>s+p[0],0)/list.length).toFixed(6),+(list.reduce((s,p)=>s+p[1],0)/list.length).toFixed(6)]]));
// 좌표가 없는 역: 같은 구간의 앞뒤 역 사이를 운행시간 비율로 보간하고, 끝 역이면 바깥으로 연장합니다.
const approx=[];
for(let pass=0;pass<3;pass++)for(const line of Object.values(lines))for(const s of line.segments){
 s.stations.forEach((name,i)=>{
  if(coords[name])return;
  const before=[...s.stations.slice(0,i)].reverse().findIndex(n=>coords[n]),after=s.stations.slice(i+1).findIndex(n=>coords[n]);
  const bi=before<0?-1:i-1-before,ai=after<0?-1:i+1+after;
  const t=(a,b)=>s.times.slice(Math.min(a,b),Math.max(a,b)).reduce((x,y)=>x+y,0);
  if(bi>=0&&ai>=0){const r=t(bi,i)/t(bi,ai),A=coords[s.stations[bi]],B=coords[s.stations[ai]];coords[name]=[+(A[0]+(B[0]-A[0])*r).toFixed(6),+(A[1]+(B[1]-A[1])*r).toFixed(6)];approx.push(name);}
  else{const [p,q]=bi>=0?[bi,bi-1]:[ai,ai+1];const P=coords[s.stations[p]],Q=coords[s.stations[q]];if(!P||!Q)return;const r=t(p,i)/Math.max(t(p,q),.1);coords[name]=[+(P[0]+(P[0]-Q[0])*r).toFixed(6),+(P[1]+(P[1]-Q[1])*r).toFixed(6)];approx.push(name);}
 });
}
const missing=Object.keys(stationLines).filter(n=>!coords[n]);
if(missing.length)throw Error('좌표가 없는 역: '+missing.join(', '));

const data={version:1,builtAt:new Date().toISOString().slice(0,10),coords,approxCoords:[...new Set(approx)],
 model:{dwellMinutes:.5,transferWaitMinutes:3,defaultWalkMinutes:3,distanceFormula:'0.40 + 1.05 × km'},
 aliases:ALIASES,lines,stations,walks,
 sources:['서울교통공사 역간거리 및 소요시간(서울 열린데이터광장 OA-12034)','서울교통공사 환승역거리 소요시간 정보(OA-13290)','국가철도공단 코레일·수도권7호선·수도권9호선 역간거리(공공데이터포털)','서울교통공사 1~8호선 역사 좌표(공공데이터포털 15099316)','국가철도공단 수도권1~7·9호선 역위치(공공데이터포털)']};
writeFileSync(new URL('public/subway-data.json',root),JSON.stringify(data));
const count=Object.keys(stations).length,transfers=Object.values(stations).filter(l=>l.length>1).length;
console.log(`지하철 데이터: 역 ${count}개, 환승역 ${transfers}개, 노선 ${Object.keys(lines).length}개, 추정 좌표 ${data.approxCoords.length}개(${data.approxCoords.join(', ')}) → public/subway-data.json`);

// ---------- 평균 혼잡도(서울교통공사 지하철혼잡도정보, 1~8호선, 30분 단위) → 서버 전용 subway-congestion.json ----------
// up = 상선·내선(실시간 updnLine 0, 시간표 INOUT 1), down = 하선·외선. 값은 정원 대비 % (100 = 좌석+입석 정원)
{
 const rows=readFileSync(new URL('data-src/subway/seoulmetro-congestion.csv',root),'utf8').trim().split('\n').map(l=>l.split(','));
 const header=rows.shift(),slots=header.slice(5).map(h=>{const m=h.match(/(\d+)시(\d+)분/);return m?String(m[1]).padStart(2,'0')+':'+m[2]:h;});
 const days={'평일':'weekday','토요일':'sat','일요일':'sun'},out={};let missing=new Set();
 for(const r of rows){
  const day=days[r[0]],line=(r[1].match(/^(\d)호선$/)||[])[1];if(!day||!line)continue;
  let name=normalizeStation(String(r[3]).replace(/[A-Z]$/,''));name=ALIASES[name]||name;// 성수E·응암S 같은 구분 표기는 같은 역
  if(!stations[name]){missing.add(name);continue;}
  const dir=['상선','내선'].includes(r[4])?'up':'down';
  const values=r.slice(5).map(v=>v===''?null:Math.round(Number(v)));
  ((out[name]??={})[line]??={})[dir]??={};
  const prev=out[name][line][dir][day];
  out[name][line][dir][day]=prev?prev.map((v,i)=>Math.max(v??0,values[i]??0)):values;// 같은 역이 두 번 나오면 큰 값
 }
 writeFileSync(new URL('subway-congestion.json',root),JSON.stringify({source:'서울교통공사 지하철혼잡도정보(공공데이터포털 15071311, 2026년 9월 기준)',slots,stations:out}));
 console.log(`혼잡도: 역 ${Object.keys(out).length}개${missing.size?`, 노선도에 없는 역 ${[...missing].join(', ')}`:''} → subway-congestion.json`);
}
