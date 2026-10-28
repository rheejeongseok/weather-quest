import {randomUUID} from 'node:crypto';

export function createSupabaseStore({url,key,fetcher=fetch}){
 const base=url.replace(/\/$/,'')+'/rest/v1/';
 async function request(path,{method='GET',body,prefer}={}){
  const headers={apikey:key,'Content-Type':'application/json'};
  if(key.startsWith('eyJ'))headers.Authorization=`Bearer ${key}`;
  if(prefer)headers.Prefer=prefer;
  const response=await fetcher(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(!response.ok){console.error('Supabase request failed:',response.status,path.split('?')[0]);throw Error('DB에 연결하지 못했어요. Supabase SQL 실행 및 서버 환경변수 설정을 확인해 주세요.');}
  return response.status===204?null:response.json();
 }
 const query=value=>encodeURIComponent(value);
 return {
  async profile(nickname,nkey,defaults){await request('wq_profiles?on_conflict=nkey',{method:'POST',body:{id:randomUUID(),nickname,nkey,data:defaults},prefer:'resolution=ignore-duplicates,return=minimal'});const rows=await request('wq_profiles?nkey=eq.'+query(nkey)+'&select=id,nickname,data');return {id:rows[0].id,nickname:rows[0].nickname,...rows[0].data};},
  async user(id){const rows=await request('wq_profiles?id=eq.'+query(id)+'&select=id,nickname,data');if(!rows.length)throw Error('프로필을 다시 선택해 주세요.');return {id:rows[0].id,nickname:rows[0].nickname,...rows[0].data};},
  async settings(id,data){await request('wq_profiles?id=eq.'+query(id),{method:'PATCH',body:{data},prefer:'return=minimal'});},
  async records(id){const all=[];for(let offset=0;;offset+=1000){const rows=await request('wq_records?user_id=eq.'+query(id)+'&select=data&order=id&limit=1000&offset='+offset);all.push(...rows.map(r=>r.data));if(rows.length<1000)return all;}},
  async save(id,record){await request('wq_records?on_conflict=user_id,id',{method:'POST',body:{id:record.id,user_id:id,data:record},prefer:'resolution=merge-duplicates,return=minimal'});},
  async merge(id,items){return request('rpc/wq_import_records',{method:'POST',body:{p_user_id:id,p_records:items}});}
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
  async records(id){return db.prepare('SELECT data FROM wq_records WHERE user_id=? ORDER BY id').all(id).map(r=>JSON.parse(r.data));},
  async save(id,record){db.prepare('INSERT INTO wq_records VALUES(?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data').run(record.id,id,JSON.stringify(record));},
  async merge(id,items){let count=0;db.exec('BEGIN');try{const stmt=db.prepare('INSERT OR IGNORE INTO wq_records VALUES(?,?,?)');for(const r of items)count+=Number(stmt.run(r.id,id,JSON.stringify(r)).changes);db.exec('COMMIT');return count;}catch(e){db.exec('ROLLBACK');throw e;}}
 };return store;
}
