import {cities} from './lib.mjs';
import {sanitizeObserved} from './record.mjs';
// 지난 날짜 기록의 날씨를 Open-Meteo 과거 시간별 값(모델 재분석)으로 보강합니다.
// 관측소 실측값이 아니라 지난 시각에 대해 관측을 반영해 다시 계산된 값입니다.
const MAX_PAST_DAYS=92;
const HOURLY='temperature_2m,apparent_temperature,wind_speed_10m,cloud_cover,shortwave_radiation,precipitation';
const cache=new Map();
export const kstDate=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now);
const daysBetween=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
export function cityKey(name){return Object.entries(cities).find(([key,c])=>c.name===name||key===name)?.[0]||null;}
export function needsObservation(r,today){
 return !r.deleted&&r.context==='outdoor'&&!r.observed&&typeof r.date==='string'&&r.date<today&&daysBetween(r.date,today)<=MAX_PAST_DAYS&&!!cityKey(r.weather?.city);
}
const mean=list=>list.reduce((a,b)=>a+b,0)/list.length;
export function observationFor(record,hourly,fetchedAt=new Date().toISOString()){
 const start=record.weather.window?.start??record.weather.hour,end=record.weather.window?.end??start;
 const indexes=[];
 for(let h=start;h<=end;h++){const i=hourly?.time?.indexOf(`${record.date}T${String(h).padStart(2,'0')}:00`)??-1;if(i<0)return null;indexes.push(i);}
 const values=key=>indexes.map(i=>hourly[key]?.[i]);
 const feels=values('apparent_temperature');
 if(!indexes.length||feels.some(v=>!Number.isFinite(v)))return null;
 const avg=key=>{const list=values(key).filter(Number.isFinite);return list.length?mean(list):null;};
 const precip=values('precipitation').filter(Number.isFinite);
 return sanitizeObserved({temp:avg('temperature_2m'),feels:mean(feels),minFeels:Math.min(...feels),maxFeels:Math.max(...feels),wind:avg('wind_speed_10m'),
  cloud:avg('cloud_cover'),radiation:avg('shortwave_radiation'),precip:precip.length?precip.reduce((a,b)=>a+b,0):null,fetchedAt});
}
async function pastHourly(key,today,fetcher){
 const cached=cache.get(key);if(cached?.today===today)return cached.hourly;
 const city=cities[key];
 const response=await fetcher(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&hourly=${HOURLY}&timezone=Asia%2FSeoul&past_days=${MAX_PAST_DAYS}&forecast_days=1`,{signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('과거 날씨를 불러오지 못했어요.');
 const hourly=(await response.json()).hourly;cache.set(key,{today,hourly});return hourly;
}
// 반환값: 보강한 기록 수. 실패해도 기존 기록은 그대로 둡니다.
export async function backfillObservations(records,{save,fetcher=fetch,now=new Date(),limit=31}){
 const today=kstDate(now);
 const targets=records.filter(r=>needsObservation(r,today)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,limit);
 const byCity=new Map();
 for(const r of targets){const key=cityKey(r.weather.city);byCity.set(key,[...(byCity.get(key)||[]),r]);}
 let updated=0;const fetchedAt=now.toISOString();
 for(const [key,list] of byCity){
  let hourly;try{hourly=await pastHourly(key,today,fetcher);}catch(e){console.error('Observed weather fetch failed:',key,e.message);continue;}
  for(const r of list){const observed=observationFor(r,hourly,fetchedAt);if(!observed)continue;await save({...r,observed});updated++;}
 }
 return updated;
}
export function clearObservationCache(){cache.clear();}
