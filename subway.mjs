// 지하철 경로 계산. 브라우저와 테스트에서 함께 사용합니다.
// 역·노선을 그래프로 만들고 다익스트라로 가장 짧은 경로를 찾습니다.
// 시간은 표준 운행시간 + 정차시간 + 환승(도보 + 평균 대기) 기준의 추정치이며 실제 배차·급행은 반영하지 않습니다.

const graphCache=new WeakMap();
const node=(line,station)=>line+'|'+station;

// 입력한 역 이름을 데이터의 역 이름으로 바꿉니다: '강남역'→강남, '서울'→서울역, '흑석(중앙대입구)'→흑석, '이수'→총신대입구
export function stationName(data,input){
 const raw=String(input||'').trim();if(!raw)return null;
 const base=raw.replace(/\(.*?\)/g,'').trim();
 const candidates=[raw,base,base.replace(/역$/,''),base+'역'];
 for(const name of candidates){const resolved=data.aliases?.[name]||name;if(data.stations[resolved])return resolved;}
 return null;
}

export function searchStations(data,query,limit=8){
 const q=String(query||'').trim();if(!q)return [];
 const names=Object.keys(data.stations);
 const starts=names.filter(n=>n.startsWith(q)),contains=names.filter(n=>!n.startsWith(q)&&n.includes(q));
 return [...starts,...contains].slice(0,limit);
}

function buildGraph(data){
 if(graphCache.has(data))return graphCache.get(data);
 const edges=new Map();
 const add=(from,to,cost,info)=>{if(!edges.has(from))edges.set(from,[]);edges.get(from).push({to,cost,...info});};
 for(const [line,def] of Object.entries(data.lines)){
  for(const seg of def.segments){
   for(let i=0;i<seg.times.length;i++){
    const a=node(line,seg.stations[i]),b=node(line,seg.stations[i+1]),t=seg.times[i],est=!!seg.est?.[i];
    add(a,b,t,{type:'ride',line,est});
    if(!seg.oneway)add(b,a,t,{type:'ride',line,est});
   }
  }
 }
 const {defaultWalkMinutes=3}=data.model||{};
 for(const [station,lines] of Object.entries(data.stations)){
  for(const a of lines)for(const b of lines){
   if(a===b)continue;
   const walk=data.walks?.[station]?.[[a,b].sort().join('-')]??defaultWalkMinutes;
   add(node(a,station),node(b,station),walk,{type:'transfer',walk});
  }
 }
 graphCache.set(data,edges);return edges;
}

// mode: 'fastest'(최단 시간) | 'fewest'(최소 환승: 환승 1회를 15분처럼 무겁게 계산)
export function findRoute(data,fromInput,toInput,{mode='fastest'}={}){
 const from=stationName(data,fromInput),to=stationName(data,toInput);
 if(!from)throw Error(`'${fromInput}' 역을 찾지 못했어요.`);
 if(!to)throw Error(`'${toInput}' 역을 찾지 못했어요.`);
 if(from===to)throw Error('출발역과 도착역이 같아요.');
 const {dwellMinutes=.5,transferWaitMinutes=3}=data.model||{};
 const transferPenalty=mode==='fewest'?15:0;
 const edges=buildGraph(data);
 const dist=new Map(),prev=new Map(),done=new Set();
 const queue=[];
 for(const line of data.stations[from]){const start=node(line,from);dist.set(start,0);queue.push([0,start]);}
 const targets=new Set(data.stations[to].map(line=>node(line,to)));
 let reached=null;
 while(queue.length){
  let best=0;for(let i=1;i<queue.length;i++)if(queue[i][0]<queue[best][0])best=i;
  const [cost,current]=queue.splice(best,1)[0];
  if(done.has(current))continue;done.add(current);
  if(targets.has(current)){reached=current;break;}
  for(const e of edges.get(current)||[]){
   // 출발역에서 바로 갈아타는 것은 의미가 없으므로 막습니다.
   if(e.type==='transfer'&&!prev.has(current))continue;
   const step=e.type==='ride'?e.cost+dwellMinutes:e.cost+transferWaitMinutes+transferPenalty;
   const next=cost+step;
   if(next<(dist.get(e.to)??Infinity)){dist.set(e.to,next);prev.set(e.to,{from:current,edge:e});queue.push([next,e.to]);}
  }
 }
 if(!reached)throw Error('연결된 경로를 찾지 못했어요.');
 // 경로 복원
 const steps=[];for(let at=reached;prev.has(at);at=prev.get(at).from)steps.unshift({...prev.get(at),to:at});
 const legs=[],transfers=[];
 for(const step of steps){
  const [line,station]=step.to.split('|');const [,fromStation]=step.from.split('|');
  if(step.edge.type==='transfer'){transfers.push({station,fromLine:step.from.split('|')[0],toLine:line,walk:step.edge.walk});legs.push(null);continue;}
  let leg=legs.at(-1);
  if(!leg){leg={line,name:data.lines[line].name,color:data.lines[line].color,stations:[fromStation],ride:0};legs.push(leg);}
  leg.stations.push(station);leg.ride+=step.edge.cost;leg.estimated||=step.edge.est;
 }
 const rides=legs.filter(Boolean).map(leg=>({...leg,from:leg.stations[0],to:leg.stations.at(-1),stops:leg.stations.length-1,
  next:leg.stations[1],minutes:Math.round((leg.ride+dwellMinutes*(leg.stations.length-2))*10)/10}));
 const walkTotal=transfers.reduce((s,t)=>s+t.walk,0);
 const total=rides.reduce((s,r)=>s+r.minutes,0)+walkTotal+transferWaitMinutes*transfers.length;
 return {from,to,mode,legs:rides,transfers,stops:rides.reduce((s,r)=>s+r.stops,0),transferCount:transfers.length,
  minutes:Math.round(total),estimated:rides.some(r=>r.estimated)};
}


// 경유 경로: 출발→경유, 경유→도착을 각각 찾아 잇습니다. 경유역에서 같은 노선을 같은 방향으로 계속 타면 한 구간으로 합칩니다.
export function findRouteVia(data,fromInput,viaInput,toInput,options={}){
 if(!viaInput||!String(viaInput).trim())return findRoute(data,fromInput,toInput,options);
 const first=findRoute(data,fromInput,viaInput,options),second=findRoute(data,viaInput,toInput,options);
 const {dwellMinutes=.5}=data.model||{};
 const legs=[...first.legs.map(l=>({...l,stations:[...l.stations]}))];
 let transfers=[...first.transfers],secondLegs=second.legs.map(l=>({...l,stations:[...l.stations]}));
 const last=legs.at(-1),next=secondLegs[0];
 const continues=last.line===next.line&&last.stations.at(-2)!==next.stations[1];
 if(continues){
  last.stations.push(...next.stations.slice(1));last.to=next.to;last.stops+=next.stops;last.minutes=Math.round((last.minutes+next.minutes+dwellMinutes)*10)/10;
  last.estimated=last.estimated||next.estimated;secondLegs=secondLegs.slice(1);
 }else{
  // 경유역에서 내려 다른 노선(또는 반대 방향)으로 갈아타는 경우
  transfers.push({station:first.to,fromLine:last.line,toLine:next.line,walk:last.line===next.line?0:(data.walks?.[first.to]?.[[last.line,next.line].sort().join('-')]??data.model?.defaultWalkMinutes??3),atVia:true});
 }
 legs.push(...secondLegs);transfers.push(...second.transfers);
 const viaTransfer=continues?null:transfers.find(t=>t.atVia);
 const minutes=Math.round(first.minutes+second.minutes+(continues?dwellMinutes:viaTransfer.walk+(data.model?.transferWaitMinutes??3)));
 return {from:first.from,via:first.to,to:second.to,mode:options.mode||'fastest',legs,transfers,stops:legs.reduce((s,l)=>s+l.stops,0),
  transferCount:transfers.length,minutes,estimated:first.estimated||second.estimated};
}

// ---------- 실시간 열차 위치 배치 ----------
const isLoop=seg=>seg.stations[0]===seg.stations.at(-1);
const wrapPos=(p,L)=>((p%L)+L)%L;
export function laneName(id,seg,d){if(id==='2'&&isLoop(seg))return d>0?'내선순환':'외선순환';if(seg.oneway)return '순환';return (d>0?seg.stations.at(-1):seg.stations[0])+' 방면';}

// 실시간 열차 → 구간·방향·위치(역 번호, 소수는 역 사이)
export function placeTrains(d,id,trains){
 const segs=d.lines[id].segments,out=segs.map(()=>[]),unknown=new Set();let count=0;
 for(const t of trains){
  const name=stationName(d,t.station);
  const cands=segs.map((s,k)=>({s,k,i:name?s.stations.indexOf(name):-1})).filter(c=>c.i>=0);
  if(!cands.length){unknown.add(t.station);continue;}
  const dest=stationName(d,t.destination);
  const pick=cands.find(c=>dest&&dest!==name&&c.s.stations.includes(dest))||cands[0];
  const seg=pick.s,L=seg.stations.length-1,loop=isLoop(seg);
  // 방향: 한 방향 순환 → 정방향, 같은 구간 안 행선지 → 그쪽, 아니면 상하행 구분(2호선만 0=정방향)
  const dir=seg.oneway?1:!loop&&dest&&dest!==name&&seg.stations.includes(dest)?Math.sign(seg.stations.indexOf(dest)-pick.i):(id==='2')===(t.updn===0)?1:-1;
  let p=pick.i+([-.3,0,.3,-.65][t.status]??0)*dir;
  p=loop?wrapPos(p,L):Math.max(0,Math.min(L,p));
  out[pick.k].push({...t,p,d:dir,destName:dest});count++;
 }
 return {segs:out,unknown:[...unknown],count};
}
// 위치 p에서 역 i까지 d 방향으로 가는 예상 시간(구간 운행시간 + 정차 0.5분)
export function travelMinutes(seg,p,i,d){
 const loop=isLoop(seg),L=seg.stations.length-1;let total=0,pos=p,left=loop?wrapPos((i-p)*d,L):(i-p)*d,guard=0;
 while(left>1e-6&&guard++<300){
  const k=d>0?Math.floor(pos+1e-9):Math.ceil(pos-1e-9)-1,kk=loop?wrapPos(k,L):k;
  const frac=Math.min(left,d>0?k+1-pos:pos-k);total+=(seg.times[kk]??1.5)*frac;pos+=d*frac;left-=frac;if(loop)pos=wrapPos(pos,L);
  if(left>1e-6)total+=.5;
 }
 return total;
}
// 출발역으로 오는 가장 가까운 열차(방향별)
export function approaching(d,id,placed,from){
 const best=new Map();
 placed.segs.forEach((trains,k)=>{
  const seg=d.lines[id].segments[k],i=seg.stations.indexOf(from);if(i<0)return;const loop=isLoop(seg),L=seg.stations.length-1;
  for(const t of trains){
   let dist=(i-t.p)*t.d;if(loop)dist=wrapPos(dist,L);if(dist<-.05)continue;
   if(!loop&&t.destName&&seg.stations.includes(t.destName)&&(seg.stations.indexOf(t.destName)-i)*t.d<0)continue;// 이 역 전에 끝나는 열차
   const key=laneName(id,seg,t.d),cur=best.get(key);
   if(!cur||dist<cur.dist)best.set(key,{train:t,dist,minutes:travelMinutes(seg,t.p,i,t.d)});
  }
 });
 return [...best].map(([lane,v])=>({lane,...v}));
}
