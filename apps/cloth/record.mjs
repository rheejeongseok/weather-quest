import {outfit,clamp,SCORE_VERSION,preferenceChoices,recordChoices} from './lib.mjs';
export {recordChoices};
export const dailyRecord=r=>({...r,id:`day:${r.date}`});
export function dailyRecords(records){
 const days=new Map();
 for(const r of records){const key=r.date||r.id;const old=days.get(key);const canonical=r.id===`day:${r.date}`;const oldCanonical=old?.id===`day:${old?.date}`;
  if(!old||(canonical&&!oldCanonical)||(canonical===oldCanonical&&String(r.updatedAt||'').localeCompare(String(old.updatedAt||''))>=0))days.set(key,r);
 }return [...days.values()].filter(r=>!r.deleted);
}
const RECOMMENDATION_SOURCES=['provisional','estimated','learning','personal','directional','conflicting'];
const round1=n=>Math.round(n*10)/10;
const finite=(n,min,max)=>Number.isFinite(n)?round1(clamp(n,min,max)):null;
const hourOf=(value,fallback)=>clamp(Math.round(Number.isFinite(Number(value))?Number(value):fallback),0,23);
const choice=(list,value,fallback=null)=>Object.hasOwn(list,value)?value:fallback;
function sanitizeWindow(input,hour){
 if(!input||typeof input!=='object')return null;
 const start=hourOf(input.start,hour),end=hourOf(input.end,start);
 if(end<start)throw Error('외출 종료 시각은 시작 시각보다 빠를 수 없어요.');
 return {start,end,minFeels:finite(input.minFeels,-60,60),maxFeels:finite(input.maxFeels,-60,60),meanFeels:finite(input.meanFeels,-60,60)};
}
export function sanitizeObserved(input){
 if(!input||typeof input!=='object'||!Number.isFinite(input.feels))return null;
 return {temp:finite(input.temp,-60,60),feels:finite(input.feels,-60,60),minFeels:finite(input.minFeels,-60,60),maxFeels:finite(input.maxFeels,-60,60),wind:finite(input.wind,0,300),
  cloud:finite(input.cloud,0,100),radiation:finite(input.radiation,0,1500),precip:finite(input.precip,0,500),source:'open-meteo',
  fetchedAt:typeof input.fetchedAt==='string'&&Number.isFinite(Date.parse(input.fetchedAt))?new Date(input.fetchedAt).toISOString():new Date().toISOString()};
}
// 기록 당시 앱이 보여준 추천. 이후 추천 정확도를 확인하는 근거이며 학습 계산에는 쓰지 않습니다.
function sanitizeRecommendation(input,worn){
 if(!input||typeof input!=='object')return null;
 const lower=finite(input.lower,0,30),upper=finite(input.upper,0,30);
 if(lower===null||upper===null||upper<lower)return null;
 let items=null,itemOptions=null,score=null;
 try{const result=outfit(input.items,input.itemOptions||{});items=result.items.map(c=>c.id);itemOptions=Object.fromEntries(result.items.map(c=>[c.id,c.variantId]));score=result.score;}catch{/* 추천 조합이 현재 목록에 없으면 범위만 보존합니다. */}
 const followed=items?items.length===worn.items.length&&worn.items.every(c=>itemOptions[c.id]===c.variantId):null;
 const rangeResult=worn.score<lower?'below':worn.score>upper?'above':'within';
 return {lower,upper,target:finite(input.target,0,30),source:RECOMMENDATION_SOURCES.includes(input.source)?input.source:null,feels:finite(input.feels,-60,60),
  hour:Number.isFinite(Number(input.hour))?hourOf(input.hour,8):null,items,itemOptions,score,followed,rangeResult};
}
export function validateRecord(r,{importing=false}={}){
 if(!r||typeof r.id!=='string'||!r.id.length||r.id.length>80||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('착용 기록 형식이 올바르지 않습니다.');
 if(r.itemOptions!==undefined&&(!r.itemOptions||typeof r.itemOptions!=='object'||Array.isArray(r.itemOptions)))throw Error('소재·두께 정보가 올바르지 않습니다.');
 const result=outfit(r.items,r.itemOptions);
 if(!Number.isInteger(r.rating)||Math.abs(r.rating)>2||!Number.isFinite(r.weather?.feels)||!Number.isFinite(r.weather?.temp)||!['outdoor','indoor'].includes(r.context))throw Error('피드백이나 날씨 정보가 올바르지 않습니다.');
 if(r.scoreVersion!==undefined&&!(Number.isInteger(r.scoreVersion)&&r.scoreVersion>=1&&r.scoreVersion<=SCORE_VERSION))throw Error('지원하지 않는 보온 점수 버전입니다.');
 const legacy=importing&&r.scoreVersion!==SCORE_VERSION;
 const itemOptions=Object.fromEntries(result.items.map(c=>[c.id,c.variantId]));
 const hour=hourOf(r.weather.hour,8);
 const accessories=Array.isArray(r.accessories)?[...new Set(r.accessories.filter(a=>Object.hasOwn(recordChoices.accessories,a)))]:[];
 return {id:r.id,date:r.date,items:r.items,itemOptions,score:legacy&&Number.isFinite(r.score)?clamp(r.score,0,100):result.score,scoreVersion:legacy?(Number.isInteger(r.scoreVersion)?r.scoreVersion:1):SCORE_VERSION,
  garments:legacy?undefined:result.items.map(c=>({id:c.id,name:c.name,variantId:c.variantId,variantName:c.variantName,material:c.material,score:c.score})),
  rating:r.rating,context:r.context,activity:['normal','active','still'].includes(r.activity)?r.activity:null,exposure:Object.hasOwn(preferenceChoices.exposure,r.exposure)?r.exposure:null,
  weather:{temp:r.weather.temp,feels:r.weather.feels,wind:Number.isFinite(r.weather.wind)&&r.weather.wind>=0?r.weather.wind:null,city:String(r.weather.city||'').slice(0,40),hour,
   rain:finite(r.weather.rain,0,100),precip:finite(r.weather.precip,0,500),cloud:finite(r.weather.cloud,0,100),radiation:finite(r.weather.radiation,0,1500),window:sanitizeWindow(r.weather.window,hour)},
  swing:choice(recordChoices.swing,r.swing),bottom:choice(recordChoices.bottom,r.bottom),accessories,layerChange:choice(recordChoices.layerChange,r.layerChange),
  recommendation:sanitizeRecommendation(r.recommendation,result),observed:sanitizeObserved(r.observed),
  updatedAt:importing&&typeof r.updatedAt==='string'&&Number.isFinite(Date.parse(r.updatedAt))?new Date(r.updatedAt).toISOString():new Date().toISOString()};
}
