import test from 'node:test';
import assert from 'node:assert/strict';
import {preferenceSettings,sensitivityPrior,exposureAdjustment,warmthTarget,correction,recommend,comfortNotes,scoreFor} from '../lib.mjs';
test('new preference fields have backward-compatible defaults and reject unknown enum values',()=>{
 const expected={exposure:'medium',commute:'mixed',windSensitivity:'normal',sweat:'normal'};
 assert.deepEqual(preferenceSettings({}),expected);assert.deepEqual(preferenceSettings({exposure:'invalid',commute:'invalid'}),expected);
});
test('both cold and heat sensitivity are retained for different temperature ranges',()=>{
 const p={cold:2,heat:2};assert.ok(sensitivityPrior(p,5)>0);assert.ok(sensitivityPrior(p,30)<0);
});
test('exposure affects cold conditions and is removed from personal sensitivity estimates',()=>{
 assert.ok(exposureAdjustment('long',0)>0);assert.ok(exposureAdjustment('short',0)<0);assert.equal(exposureAdjustment('long',30),0);
 const p={cold:0,heat:0};const r={scoreVersion:2,score:scoreFor(5)+exposureAdjustment('long',5),context:'outdoor',exposure:'long',rating:0,weather:{feels:5}};
 assert.equal(correction(p,[r],5),0);
 const m=warmthTarget({...p,exposure:'long'},[],5);assert.equal(m.target,7.7);
});
test('wind sensitivity changes windproof priority without adding a second wind warmth correction',()=>{
 const p={cold:0,heat:0};assert.equal(warmthTarget(p,[],10).target,warmthTarget({...p,windSensitivity:'high'},[],10).target);
 assert.equal(recommend(10,0,'normal',15,'balanced',{windSensitivity:'high'}).items.at(-1).windproof,true);
});
test('sweat and commute provide advice rather than unvalidated numeric adjustments',()=>{
 const p={cold:0,heat:0};const detailed={...p,sweat:'high',commute:'transit'};
 assert.equal(warmthTarget(p,[],10).target,warmthTarget(detailed,[],10).target);assert.equal(comfortNotes(detailed,{wind:0}).length,2);
});
