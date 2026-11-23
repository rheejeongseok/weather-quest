// Cloth to You API: 프로필 시작(닉네임), 옷차림 설정·기록·백업, 날씨
// 옷차림 설정은 wq_cloth_settings, 착용 기록은 wq_records에 프로필(profile_id/user_id)별로 저장합니다.
import {composeProfile,profilePart} from '../../core/profile.mjs';
import {validateRecord} from './record.mjs';
import {backfillObservations} from './observed.mjs';
import {cities,clothes,normalizeNickname,clamp,preferenceSettings} from './lib.mjs';
const weatherCache=new Map();
const TABLE='wq_cloth_settings';
// 프로필에 옷차림 설정을 붙임. 새 테이블이 비어 있으면 예전 wq_profiles.data에서 옮겨 옵니다.
profilePart(async(db,id,legacy)=>{
 const saved=await db.appGet(TABLE,id);if(saved)return settings(saved);
 const {subway,...old}=await legacy();
 const data=settings(old);if(Object.keys(old).length)await db.appSet(TABLE,id,data);
 return data;
});
export function settings(input){return {...preferenceSettings(input),cold:clamp(Math.round(Number(input.cold)||0),-2,2),heat:clamp(Math.round(Number(input.heat)||0),-2,2),avoid:Array.isArray(input.avoid)?[...new Set(input.avoid.filter(id=>clothes.some(c=>c.id===id)))]:[],city:cities[input.city]?input.city:'seoul',activity:['normal','active','still'].includes(input.activity)?input.activity:'normal',hour:clamp(Math.round(Number.isFinite(Number(input.hour))?Number(input.hour):8),0,23),style:['simple','balanced','layered'].includes(input.style)?input.style:'balanced',onboarded:!!input.onboarded};}

export async function handle({req,u,db:storage,body,send}){
 const path=u.pathname,post=req.method==='POST';
 if(path==='/api/weather')return send(200,await weather(u.searchParams.get('city')));
 if(path==='/api/profile'&&post){const db=await storage(),b=await body();const nickname=normalizeNickname(b.nickname);const {id}=await db.profile(nickname,nickname.toLocaleLowerCase('en'));const p=await composeProfile(db,id);let records=await db.records(id);if(process.env.WQ_OBSERVED!=='off'){try{if(await backfillObservations(records,{save:r=>db.save(id,r)}))records=await db.records(id);}catch(e){console.error('Observed weather backfill failed:',e.message);}}return send(200,{profile:p,records});}
 // 옷차림 설정 테이블만 바꿉니다(다른 서랍 데이터는 각자 테이블에 있어 영향 없음).
 if(path==='/api/settings'&&post){const db=await storage(),b=await body();const {id}=await db.user(b.userId);await db.appSet(TABLE,id,settings(b));return send(200,{profile:await composeProfile(db,id)});}
 if(path==='/api/data'&&req.method==='GET'){const db=await storage();const {id}=await db.user(u.searchParams.get('userId'));return send(200,{version:1,exportedAt:new Date().toISOString(),profile:await composeProfile(db,id),records:await db.records(id)});}
 if(path==='/api/record'&&post){const db=await storage(),b=await body();await db.user(b.userId);const r=validateRecord(b.record);await db.save(b.userId,r);return send(200,{records:await db.records(b.userId)});}
 if(path==='/api/record/delete'&&post){const db=await storage(),b=await body();await db.user(b.userId);if(typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date))throw Error('삭제할 날짜를 확인해 주세요.');await db.remove(b.userId,b.date);return send(200,{records:await db.records(b.userId)});}
 if(path==='/api/import'&&post){const db=await storage(),b=await body();await db.user(b.userId);if(b.data?.version!==1||!Array.isArray(b.data.records)||b.data.records.length>5000)throw Error('지원하지 않는 백업 파일입니다.');const clean=b.data.records.map(r=>validateRecord(r,{importing:true}));if(new Set(clean.map(r=>r.id)).size!==clean.length)throw Error('중복 기록이 있는 파일입니다.');const added=await db.merge(b.userId,clean);return send(200,{added,records:await db.records(b.userId)});}
 return false;
}

// Open-Meteo 예보(도시별 10분 캐시)
async function weather(key){
 const city=cities[key];if(!city)throw Error('지원하지 않는 지역입니다.');
 let data=weatherCache.get(key);
 if(!data||Date.now()-data.fetched>600000){const upstream=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code,is_day,cloud_cover,shortwave_radiation,precipitation&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day,precipitation&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=Asia%2FSeoul&forecast_days=3`,{signal:AbortSignal.timeout(12000)});if(!upstream.ok)throw Error('날씨 제공 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');const raw=await upstream.json();data={fetched:Date.now(),hourly:raw.hourly,current:raw.current,daily:raw.daily,city:city.name};weatherCache.set(key,data);}
 return data;
}
