import test from 'node:test';
import assert from 'node:assert/strict';
import {warmthTarget,correction,recommend,outfit,scoreFor} from '../lib.mjs';
const profile={cold:0,heat:0,activity:'normal'};
const record=(rating=0)=>({date:'2026-10-28',items:['shirt','light'],score:6,scoreVersion:2,rating,context:'outdoor',activity:'normal',weather:{feels:10}});
test('target is warmer as temperature falls and activity offsets remain separate',()=>{
 const temps=[30,25,20,15,10,5,0,-5,-10];const targets=temps.map(t=>warmthTarget(profile,[],t).target);
 for(let i=1;i<targets.length;i++)assert.ok(targets[i]>=targets[i-1]);
 assert.equal(warmthTarget({...profile,activity:'active'},[],10).target,scoreFor(10)-1);
 assert.equal(warmthTarget({...profile,activity:'still'},[],10).target,scoreFor(10)+1);
});
test('cold and hot feedback influence nearby temperatures, not unrelated seasons',()=>{
 const cold=Array.from({length:6},()=>record(-1));const hot=Array.from({length:6},()=>record(1));
 assert.ok(correction(profile,cold,10)>0);assert.ok(correction(profile,hot,10)<0);
 assert.equal(correction(profile,cold,30),0);assert.equal(warmthTarget(profile,cold,10).samples,6);
 assert.equal(correction(profile,cold.map(r=>({...r,context:'indoor'})),10),0);
});
test('activity at the time of recording is removed from personal sensitivity learning',()=>{
 const r={...record(),score:scoreFor(10)-1,activity:'active'};
 assert.equal(correction(profile,[r],10),0);
 assert.ok(correction(profile,[{...r,activity:'normal'}],10)<0);
});
test('deleting observations recalculates target from remaining records',()=>{
 const r=record(-2);assert.ok(warmthTarget(profile,[r],10).target>warmthTarget(profile,[],10).target);
 assert.equal(warmthTarget(profile,[{...r,deleted:true}],10).target,warmthTarget(profile,[],10).target);
});
test('style changes layers but does not change required warmth and variants remain reproducible',()=>{
 const simple=recommend(0,0,'normal',0,'simple');const layered=recommend(0,0,'normal',0,'layered');
 assert.equal(simple.target,layered.target);assert.ok(simple.items.length<layered.items.length);
 for(const r of [simple,layered]){const recreated=outfit(r.items.map(c=>c.id),Object.fromEntries(r.items.map(c=>[c.id,c.variantId])));assert.equal(recreated.score,r.score);assert.ok(Math.abs(r.score-r.target)<=.6);}
});
