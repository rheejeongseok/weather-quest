import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {createStore} from './store.mjs';
import {validateRecord} from './record.mjs';
import {cities,normalizeNickname,clamp} from './lib.mjs';
const root=dirname(fileURLToPath(import.meta.url));
let storePromise;
function storage(){return storePromise??=createStore().catch(e=>{storePromise=null;throw e;});}
const cache=new Map();
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){if(req.body && typeof req.body === 'object')return req.body;if(typeof req.body === 'string')return JSON.parse(req.body);let s='';for await(const c of req){s+=c;if(Buffer.byteLength(s)>2_000_000)throw Error('파일이 너무 큽니다.');}return JSON.parse(s||'{}');}
function settings(input){return {cold:clamp(Number(input.cold)||0,0,2),heat:clamp(Number(input.heat)||0,0,2),city:cities[input.city]?input.city:'seoul',activity:['normal','active','still'].includes(input.activity)?input.activity:'normal',hour:clamp(Math.round(Number.isFinite(Number(input.hour))?Number(input.hour):8),0,23),style:['simple','balanced','layered'].includes(input.style)?input.style:'balanced',onboarded:!!input.onboarded};}

export default async function handler(req,res){try{const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/handler'&&u.searchParams.has('route'))u.pathname='/api/'+u.searchParams.get('route');
 const db=u.pathname.startsWith('/api/')&&u.pathname!=='/api/weather'?await storage():null;
 if(u.pathname==='/api/profile'&&req.method==='POST'){const b=await body(req);const nickname=normalizeNickname(b.nickname);const p=await db.profile(nickname,nickname.toLocaleLowerCase('en'),settings({}));return json(res,200,{profile:p,records:await db.records(p.id)});}
 if(u.pathname==='/api/settings'&&req.method==='POST'){const b=await body(req);await db.user(b.userId);await db.settings(b.userId,settings(b));return json(res,200,{profile:await db.user(b.userId)});}
 if(u.pathname==='/api/data'&&req.method==='GET'){const p=await db.user(u.searchParams.get('userId'));return json(res,200,{version:1,exportedAt:new Date().toISOString(),profile:p,records:await db.records(p.id)});}
 if(u.pathname==='/api/record'&&req.method==='POST'){const b=await body(req);await db.user(b.userId);const r=validateRecord(b.record);await db.save(b.userId,r);return json(res,200,{records:await db.records(b.userId)});}
 if(u.pathname==='/api/record/delete'&&req.method==='POST'){const b=await body(req);await db.user(b.userId);if(typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date))throw Error('삭제할 날짜를 확인해 주세요.');await db.remove(b.userId,b.date);return json(res,200,{records:await db.records(b.userId)});}
 if(u.pathname==='/api/import'&&req.method==='POST'){const b=await body(req);await db.user(b.userId);if(b.data?.version!==1||!Array.isArray(b.data.records)||b.data.records.length>5000)throw Error('지원하지 않는 백업 파일입니다.');const clean=b.data.records.map(r=>validateRecord(r,{importing:true}));if(new Set(clean.map(r=>r.id)).size!==clean.length)throw Error('중복 기록이 있는 파일입니다.');const added=await db.merge(b.userId,clean);return json(res,200,{added,records:await db.records(b.userId)});}
 if(u.pathname==='/api/weather'){const city=cities[u.searchParams.get('city')];if(!city)throw Error('지원하지 않는 지역입니다.');const key=u.searchParams.get('city');let data=cache.get(key);if(!data||Date.now()-data.fetched>600000){const upstream=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code,is_day&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&daily=temperature_2m_min,temperature_2m_max&timezone=Asia%2FSeoul&forecast_days=3`,{signal:AbortSignal.timeout(12000)});if(!upstream.ok)throw Error('날씨 제공 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');const raw=await upstream.json();data={fetched:Date.now(),hourly:raw.hourly,current:raw.current,daily:raw.daily,city:city.name};cache.set(key,data);}return json(res,200,data);}
 if(u.pathname.startsWith('/api/'))return json(res,404,{error:'API를 찾을 수 없습니다.'});
 const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/design.css':'design.css','/polish.css':'polish.css','/favicon.svg':'favicon.svg','/favicon.ico':'favicon.ico','/apple-touch-icon.png':'apple-touch-icon.png','/main.js':'main.js','/forecast.mjs':'../forecast.mjs','/lib.mjs':'../lib.mjs'};const file=files[u.pathname];if(!file){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.ico')?'image/x-icon':file.endsWith('.png')?'image/png':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(readFileSync(join(root,'public',file)));
 }catch(e){json(res,400,{error:e.message||'요청을 처리하지 못했어요.'});}}
