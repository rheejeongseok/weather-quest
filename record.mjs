import {outfit,clamp,SCORE_VERSION,preferenceChoices} from './lib.mjs';
export const dailyRecord=r=>({...r,id:`day:${r.date}`});
export function dailyRecords(records){
 const days=new Map();
 for(const r of records){const key=r.date||r.id;const old=days.get(key);const canonical=r.id===`day:${r.date}`;const oldCanonical=old?.id===`day:${old?.date}`;
  if(!old||(canonical&&!oldCanonical)||(canonical===oldCanonical&&String(r.updatedAt||'').localeCompare(String(old.updatedAt||''))>=0))days.set(key,r);
 }return [...days.values()].filter(r=>!r.deleted);
}
export function validateRecord(r,{importing=false}={}){
 if(!r||typeof r.id!=='string'||!r.id.length||r.id.length>80||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('착용 기록 형식이 올바르지 않습니다.');
 if(r.itemOptions!==undefined&&(!r.itemOptions||typeof r.itemOptions!=='object'||Array.isArray(r.itemOptions)))throw Error('소재·두께 정보가 올바르지 않습니다.');
 const result=outfit(r.items,r.itemOptions);
 if(!Number.isInteger(r.rating)||Math.abs(r.rating)>2||!Number.isFinite(r.weather?.feels)||!Number.isFinite(r.weather?.temp)||!['outdoor','indoor'].includes(r.context))throw Error('피드백이나 날씨 정보가 올바르지 않습니다.');
 if(r.scoreVersion!==undefined&&![1,SCORE_VERSION].includes(r.scoreVersion))throw Error('지원하지 않는 보온 점수 버전입니다.');
 const legacy=importing&&r.scoreVersion!==SCORE_VERSION;
 const itemOptions=Object.fromEntries(result.items.map(c=>[c.id,c.variantId]));
 return {id:r.id,date:r.date,items:r.items,itemOptions,score:legacy&&Number.isFinite(r.score)?clamp(r.score,0,100):result.score,scoreVersion:legacy?1:SCORE_VERSION,
  garments:legacy?undefined:result.items.map(c=>({id:c.id,name:c.name,variantId:c.variantId,variantName:c.variantName,material:c.material,score:c.score})),
  rating:r.rating,context:r.context,activity:['normal','active','still'].includes(r.activity)?r.activity:null,exposure:Object.hasOwn(preferenceChoices.exposure,r.exposure)?r.exposure:null,weather:{temp:r.weather.temp,feels:r.weather.feels,city:String(r.weather.city||'').slice(0,40),hour:clamp(Number.isFinite(Number(r.weather.hour))?Number(r.weather.hour):8,0,23)},
  updatedAt:importing&&typeof r.updatedAt==='string'&&Number.isFinite(Date.parse(r.updatedAt))?new Date(r.updatedAt).toISOString():new Date().toISOString()};
}
