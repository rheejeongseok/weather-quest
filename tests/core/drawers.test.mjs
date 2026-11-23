import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from '../../core/store.mjs';
import {composeProfile} from '../../core/profile.mjs';
import '../../apps/cloth/routes.mjs';
import '../../apps/subway/routes.mjs';

test('legacy profile data moves into each drawer table and drawers stay separate',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'my-doc-drawers-'));process.env.DATA_DIR=dir;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;
 const store=await createStore();const {id}=await store.profile('이전','이전');
 // 예전 방식: 옷차림 설정과 지하철 저장분이 wq_profiles.data 한 칸에 함께
 const raw=new DatabaseSync(join(dir,'weather.sqlite'));raw.prepare('UPDATE profiles SET data=? WHERE id=?').run(JSON.stringify({cold:1,heat:-1,city:'seoul',hour:7,onboarded:true,subway:{recent:[{from:'노원',to:'강남'}],favorites:[],mode:'fewest',liveLine:'4'}}),id);raw.close();
 const p=await composeProfile(store,id);
 assert.equal(p.cold,1);assert.equal(p.hour,7);assert.equal(p.onboarded,true);assert.equal(p.subway.mode,'fewest');assert.deepEqual(p.subway.recent,[{from:'노원',via:'',to:'강남'}]);
 assert.equal((await store.appGet('wq_cloth_settings',id)).cold,1,'cloth settings copied to their own table');
 assert.equal((await store.appGet('wq_subway_saved',id)).liveLine,'4','subway data copied to its own table');
 assert.equal((await store.appGet('wq_cloth_settings',id)).subway,undefined,'cloth table holds no subway data');
 // 한 서랍 저장이 다른 서랍을 건드리지 않음
 await store.appSet('wq_cloth_settings',id,{...p,cold:2,subway:undefined});
 assert.equal((await composeProfile(store,id)).subway.liveLine,'4');
 await store.appSet('wq_subway_saved',id,{recent:[],favorites:[],mode:'fastest',liveLine:''});
 assert.equal((await composeProfile(store,id)).cold,2);
 // 새 프로필은 기본 설정으로 시작
 const fresh=await composeProfile(store,(await store.profile('새사람','새사람')).id);
 assert.equal(fresh.onboarded,false);assert.equal(fresh.subway,undefined);
});
