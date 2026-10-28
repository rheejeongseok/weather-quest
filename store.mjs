import {randomUUID} from 'node:crypto';
import {dailyRecord,dailyRecords} from './record.mjs';

export function createSupabaseStore({url,key,fetcher=fetch}){
 url=String(url||'').trim();key=String(key||'').trim();
 let endpoint;try{endpoint=new URL(url);}catch{throw Error('SUPABASE_URL은 https://프로젝트ID.supabase.co 형태의 Project URL이어야 해요.');}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw Error('SUPABASE_URL에는 대시보드 주소가 아닌 Project URL(https://프로젝트ID.supabase.co)을 입력해 주세요.');
 if(/[\r\n\t ]/.test(key)||/[^\x21-\x7e]/.test(key))throw Error('SUPABASE_SECRET_KEY에 공백·줄바꿈·잘못된 문자가 있어요. 새 프로젝트의 서버용 키를 다시 복사해 주세요.');
 const base=endpoint.origin+'/rest/v1/';
 async function request(path,{method='GET',body,prefer}={}){
  const headers={apikey:key,'Content-Type':'application/json'};
  if(key.startsWith('eyJ'))headers.Authorization=`Bearer ${key}`;
  if(prefer)headers.Prefer=prefer;
  let response;
  try{response=await fetcher(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});}catch(e){
   const code=e.cause?.code||e.code||e.name;console.error('Supabase connection failed:',endpoint.hostname,code);
   const reason=['ENOTFOUND','EAI_AGAIN'].includes(code)?'프로젝트 주소의 DNS 조회 실패':e.name==='TimeoutError'||code==='ETIMEDOUT'?'연결 시간 초과':'서버 연결 실패';
   throw Error(`Supabase ${reason}. Vercel의 SUPABASE_URL이 새 프로젝트의 Project URL인지, 프로젝트가 실행 중인지 확인하고 재배포해 주세요.`);
  }
  if(!response.ok){
   console.error('Supabase request failed:',response.status,path.split('?')[0]);
   if(response.status===401)throw Error('Supabase 키 인증 실패(401). URL과 Secret key가 같은 새 프로젝트의 값인지, 키가 활성 상태인지 확인하고 재배포해 주세요.');
   if(response.status===403)throw Error('Supabase 접근 권한 오류(403). 서버용 Secret key와 schema.sql의 테이블 권한 설정을 확인해 주세요.');
   if(response.status===404)throw Error('Supabase 테이블·함수를 찾지 못했어요(404). 새 프로젝트에서 schema.sql을 실행했는지 확인해 주세요.');
   throw Error(`Supabase DB 요청 오류(${response.status}). 프로젝트 상태와 테이블 설정을 확인해 주세요.`);
  }
  const text=await response.text();
  if(!text.trim())return null;
  try{return JSON.parse(text);}catch{throw Error('DB 서버가 올바른 JSON 응답을 보내지 않았어요. 잠시 후 다시 시도해 주세요.');}
 }
 const query=value=>encodeURIComponent(value);
 return {
  async profile(nickname,nkey,defaults){await request('wq_profiles?on_conflict=nkey',{method:'POST',body:{id:randomUUID(),nickname,nkey,data:defaults},prefer:'resolution=ignore-duplicates,return=minimal'});const rows=await request('wq_profiles?nkey=eq.'+query(nkey)+'&select=id,nickname,data');return {id:rows[0].id,nickname:rows[0].nickname,...rows[0].data};},
  async user(id){const rows=await request('wq_profiles?id=eq.'+query(id)+'&select=id,nickname,data');if(!rows.length)throw Error('프로필을 다시 선택해 주세요.');return {id:rows[0].id,nickname:rows[0].nickname,...rows[0].data};},
  async settings(id,data){await request('wq_profiles?id=eq.'+query(id),{method:'PATCH',body:{data},prefer:'return=minimal'});},
  async records(id){const all=[];for(let offset=0;;offset+=1000){const rows=await request('wq_records?user_id=eq.'+query(id)+'&select=data&order=id&limit=1000&offset='+offset);all.push(...rows.map(r=>r.data));if(rows.length<1000)return dailyRecords(all);}},
  async save(id,record){const r=dailyRecord(record);await request('wq_records?on_conflict=user_id,id',{method:'POST',body:{id:r.id,user_id:id,data:r},prefer:'resolution=merge-duplicates,return=minimal'});await request('wq_records?user_id=eq.'+query(id)+'&data->>date=eq.'+query(r.date)+'&id=neq.'+query(r.id),{method:'DELETE',prefer:'return=minimal'});},
  async remove(id,date){await this.save(id,{date,deleted:true,updatedAt:new Date().toISOString()});},
  async merge(id,items){const existing=new Set((await this.records(id)).map(r=>r.date));const fresh=dailyRecords(items).filter(r=>!existing.has(r.date)).map(dailyRecord);if(!fresh.length)return 0;return request('rpc/wq_import_records',{method:'POST',body:{p_user_id:id,p_records:fresh}});}
 };
}

export async function createStore(){
 const url=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(url&&key)return createSupabaseStore({url,key});
 if(process.env.VERCEL||url||key)throw Error('SUPABASE_URL과 SUPABASE_SECRET_KEY 환경변수를 모두 설정해 주세요.');
 const {DatabaseSync}=await import('node:sqlite');const {mkdirSync}=await import('node:fs');const {join}=await import('node:path');const {fileURLToPath}=await import('node:url');
 const dir=process.env.DATA_DIR||fileURLToPath(new URL('./data',import.meta.url));mkdirSync(dir,{recursive:true});
 const db=new DatabaseSync(join(dir,'weather.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,nickname TEXT NOT NULL,nkey TEXT UNIQUE NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS wq_records(id TEXT NOT NULL,user_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,id)); INSERT OR IGNORE INTO wq_records SELECT id,user_id,data FROM records;');
 const store={
  async profile(nickname,nkey,defaults){db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?)').run(randomUUID(),nickname,nkey,JSON.stringify(defaults));return store.user(db.prepare('SELECT id FROM profiles WHERE nkey=?').get(nkey).id);},
  async user(id){const r=db.prepare('SELECT * FROM profiles WHERE id=?').get(id);if(!r)throw Error('프로필을 다시 선택해 주세요.');return {id:r.id,nickname:r.nickname,...JSON.parse(r.data)};},
  async settings(id,data){db.prepare('UPDATE profiles SET data=? WHERE id=?').run(JSON.stringify(data),id);},
  async records(id){return dailyRecords(db.prepare('SELECT data FROM wq_records WHERE user_id=? ORDER BY id').all(id).map(r=>JSON.parse(r.data)));},
  async save(id,record){const r=dailyRecord(record);db.exec('BEGIN');try{db.prepare('INSERT INTO wq_records VALUES(?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data').run(r.id,id,JSON.stringify(r));db.prepare("DELETE FROM wq_records WHERE user_id=? AND json_extract(data,'$.date')=? AND id<>?").run(id,r.date,r.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  async remove(id,date){await store.save(id,{date,deleted:true,updatedAt:new Date().toISOString()});},
  async merge(id,items){const existing=new Set((await store.records(id)).map(r=>r.date));let count=0;db.exec('BEGIN');try{const stmt=db.prepare('INSERT OR IGNORE INTO wq_records VALUES(?,?,?)');for(const input of dailyRecords(items)){if(existing.has(input.date))continue;const r=dailyRecord(input);count+=Number(stmt.run(r.id,id,JSON.stringify(r)).changes);}db.exec('COMMIT');return count;}catch(e){db.exec('ROLLBACK');throw e;}}
 };return store;
}
