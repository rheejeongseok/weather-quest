import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {correction,recommend,normalizeNickname,selectedClothes,SCORE_VERSION} from '../../apps/cloth/lib.mjs';
test('colder weather increases warmth; recommendations do not repeat clothes',()=>{assert.ok(recommend(0,0).score>recommend(25,0).score);for(let t=-10;t<=35;t++){const r=recommend(t,0);assert.equal(new Set(r.items.map(c=>c.id)).size,r.items.length);assert.ok(r.items.some(c=>c.roles.includes('base')));assert.ok(r.items.length<=4);}});
test('cold feedback increases personal correction, indoor feedback is excluded',()=>{const p={cold:0,heat:0};const r={date:'2026-10-28',updatedAt:'2026-10-28',items:['shirt','light'],score:6,scoreVersion:SCORE_VERSION,rating:-1,weather:{feels:10},context:'outdoor'};assert.ok(correction(p,[r])>0);assert.equal(correction(p,[{...r,context:'indoor'}]),0);assert.equal(normalizeNickname('  친구  '),'친구');});
test('profiles, persistence, backup merge and invalid imports',async()=>{const dir=await mkdtemp(join(tmpdir(),'cloth-to-you-'));const port=13500+Math.floor(Math.random()*1000);let child;async function start(){child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,WQ_OBSERVED:'off',DATA_DIR:dir,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});await Promise.race([once(child.stdout,'data'),once(child,'error').then(([e])=>Promise.reject(e))]);}async function stop(){const done=once(child,'exit');child.kill();await done;}async function call(path,data){const r=await fetch(`http://127.0.0.1:${port}${path}`,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});return {status:r.status,...await r.json()};}try{await start();const a=await call('/api/profile',{nickname:' Test '});const b=await call('/api/profile',{nickname:'test'});assert.equal(a.profile.id,b.profile.id);const id=a.profile.id;const record={id:'test-record',date:'2026-10-28',items:['tee','shirt','wind'],rating:-1,context:'outdoor',weather:{temp:10,feels:8,hour:8,city:'서울'}};await call('/api/record',{userId:id,record});const backup=await call('/api/data?userId='+id);assert.equal(backup.records.length,1);const merged=await call('/api/import',{userId:id,data:backup});assert.equal(merged.added,0);assert.equal(merged.records.length,1);const bad=await call('/api/import',{userId:id,data:{version:1,records:[{...record,id:'bad',items:['nope']}]}});assert.equal(bad.status,400);await stop();await start();const persisted=await call('/api/data?userId='+id);assert.equal(persisted.records[0].score,4);const home=await fetch(`http://127.0.0.1:${port}/`);assert.equal(home.status,200);assert.match(await home.text(),/Cloth to You/);}finally{if(child?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}});

test('subway routes are saved per nickname profile and survive clothing settings saves',async()=>{const dir=await mkdtemp(join(tmpdir(),'my-doc-subway-'));const port=14600+Math.floor(Math.random()*800);const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,WQ_OBSERVED:'off',DATA_DIR:dir,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});await once(child.stdout,'data');
 const call=async(path,data)=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});return {status:r.status,...await r.json()};};
 try{
  const {profile}=await call('/api/profile',{nickname:'지하철테스트'});
  const saved=await call('/api/subway/save',{userId:profile.id,subway:{recent:[{from:'노원역',to:'강남'},{from:'노원',to:'강남'},{from:'없는역',to:'강남'},{from:'강남',to:'강남'}],favorites:[{from:'서울',via:'시청',to:'잠실'}],mode:'fewest',liveLine:'4'}});
  assert.deepEqual(saved.subway.recent,[{from:'노원',via:'',to:'강남'}],'names are normalized, invalid and duplicate routes dropped');
  assert.deepEqual(saved.subway.favorites,[{from:'서울역',via:'시청',to:'잠실'}]);assert.equal(saved.subway.mode,'fewest');assert.equal(saved.subway.liveLine,'4');
  await call('/api/settings',{userId:profile.id,cold:1,heat:0,city:'seoul'});
  const again=await call('/api/profile',{nickname:'지하철테스트'});
  assert.deepEqual(again.profile.subway.favorites,[{from:'서울역',via:'시청',to:'잠실'}],'clothing settings save keeps subway data');
  assert.equal(again.profile.cold,1);
  assert.equal((await call('/api/subway/save',{userId:'nope',subway:{}})).status,400);
 }finally{const done=once(child,'exit');child.kill();await done;}
});
