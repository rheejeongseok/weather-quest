import test from 'node:test';
import assert from 'node:assert/strict';
import {warmthTarget,compareOutfit,recommend,outfit} from '../lib.mjs';
const profile={cold:0,heat:0,activity:'normal',exposure:'medium'};
const record=(index,score,rating=0,extra={})=>({id:`day:2026-10-${index}`,date:`2026-10-${index}`,updatedAt:`2026-10-${index}T08:00:00Z`,items:['shirt','light'],scoreVersion:2,score,rating,context:'outdoor',activity:'normal',exposure:'medium',weather:{feels:10,temp:11},...extra});
test('no usable observations produces a visibly provisional range',()=>{
 const model=warmthTarget(profile,[],10);assert.equal(model.source,'provisional');assert.equal(model.samples,0);assert.ok(model.range.upper>model.range.lower);assert.ok(model.target>=model.range.lower&&model.target<=model.range.upper);
});
test('comfortable observations replace an inaccurate provisional midpoint',()=>{
 const records=[record(20,8),record(21,8),record(22,8)];const model=warmthTarget(profile,records,10);
 assert.equal(model.source,'personal');assert.equal(model.target,8);assert.deepEqual(model.range,{lower:7.5,upper:8.5});assert.equal(model.anchors,3);assert.notEqual(model.initial,model.target);
});
test('cold and hot feedback bound the comfortable range without fixed rating deltas',()=>{
 const records=[record(20,5.5,-1),record(21,6.5),record(22,6.5),record(23,7.5,1)];const model=warmthTarget(profile,records,10);
 assert.equal(model.source,'personal');assert.deepEqual(model.range,{lower:6,upper:7});
 const severe=warmthTarget(profile,[record(20,5.5,-2),...records.slice(1)],10);assert.deepEqual(severe.range,model.range);
});
test('contradictory evidence is identified instead of forcing a precise target',()=>{
 const model=warmthTarget(profile,[record(20,7,-1),record(21,6,1)],10);assert.equal(model.conflict,true);assert.equal(model.source,'conflicting');assert.ok(model.range.upper>model.range.lower);
});
test('distant, indoor, deleted and duplicate dates do not manufacture personalization',()=>{
 const r=record(20,8);const model=warmthTarget(profile,[r,{...r,updatedAt:'2026-10-20T09:00:00Z'},record(21,8,0,{context:'indoor'}),record(22,8,0,{deleted:true}),record(23,8,0,{weather:{feels:30}})],10);
 assert.equal(model.samples,1);assert.equal(model.anchors,1);assert.equal(model.source,'learning');assert.equal(model.evidence.length,1);
});
test('mismatched activity/exposure evidence has less influence than a matching observation',()=>{
 const exact=warmthTarget(profile,[record(20,8)],10);const mismatch=warmthTarget(profile,[record(20,8,0,{activity:'active',exposure:'long'})],10);
 assert.ok(exact.effectiveAnchors>mismatch.effectiveAnchors);assert.equal(mismatch.evidence[0].conditionMatch,false);
});
test('a learned comfortable score is not constrained by the old 12-point provisional ceiling',()=>{
 const model=warmthTarget(profile,[record(20,14),record(21,14),record(22,14)],-1);
 assert.equal(model.source,'provisional');const close=warmthTarget(profile,[record(20,14),record(21,14),record(22,14)],10);assert.equal(close.target,14);assert.ok(close.range.upper>12);
});
test('recommendations and manual comparisons use the range rather than a single midpoint',()=>{
 const model=warmthTarget(profile,[record(20,6.5),record(21,6.5)],10);
 const r=recommend(10,0,'normal',0,'balanced',{model});assert.deepEqual(r.range,model.range);assert.ok(r.score>=model.range.lower&&r.score<=model.range.upper);
 const ids=['shirt','light'];assert.equal(compareOutfit(ids,{},model.range).inRange,true);
 assert.equal(outfit(ids).score,6);
});
test('a comfortable recorded outfit can be preferred within the same style and warmth range',()=>{
 const r=record(20,7,0,{items:['tee','padded'],itemOptions:{tee:'standard',padded:'standard'}});
 const model=warmthTarget(profile,[r, {...r,id:'day:2026-10-21',date:'2026-10-21'}],10);
 const suggested=recommend(10,0,'normal',0,'simple',{model});assert.equal(suggested.fromRecord,true);assert.deepEqual(suggested.items.map(c=>c.id),['tee','padded']);
});
