import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../store.mjs';
test('delete hides all same-date records, prevents backup resurrection and allows explicit re-recording',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'weather-delete-'));const prev=process.env.DATA_DIR;process.env.DATA_DIR=directory;
 try{const store=await createStore();const p=await store.profile('test','test',{});const friend=await store.profile('friend','friend',{});const r={id:'legacy',date:'2026-10-28',rating:-1,updatedAt:'2026-10-28T00:00:00Z'};
 await store.save(p.id,r);await store.save(friend.id,r);await store.remove(p.id,r.date);
 assert.equal((await store.records(p.id)).length,0);assert.equal((await store.records(friend.id)).length,1);
 assert.equal(await store.merge(p.id,[r]),0);assert.equal((await store.records(p.id)).length,0);
 await store.save(p.id,{...r,rating:0});assert.equal((await store.records(p.id))[0].rating,0);
 }finally{if(prev===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prev;/* SQLite connections remain process-owned; the OS temporary directory is isolated. */}
});
