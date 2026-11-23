import test from 'node:test';
import assert from 'node:assert/strict';
import {warmthTarget,sensitivityPrior,SCORE_VERSION} from '../../apps/cloth/lib.mjs';
const p={cold:0,heat:0,activity:'normal',exposure:'medium'};
const rec=(day,feels,score,rating=0)=>({id:`day:2026-11-${day}`,date:`2026-11-${day}`,updatedAt:'2026-11-01T00:00:00Z',items:['shirt','light'],score,scoreVersion:SCORE_VERSION,rating,context:'outdoor',activity:'normal',exposure:'medium',weather:{feels,temp:feels}});

test('one record already moves the estimate at other temperatures, two move it further',()=>{
 const none=warmthTarget(p,[],0).target;
 const one=warmthTarget(p,[rec(10,10,8)],0);
 const two=warmthTarget(p,[rec(10,10,8),rec(11,9,8.3)],0);
 assert.equal(one.source,'estimated');assert.equal(one.globalSamples,1);
 assert.ok(one.target>none&&two.target>one.target);
 // 설정값은 기록 1개만큼의 비중: 같은 기온의 기록 1개면 기록이 말하는 차이의 절반, 멀어질수록 덜 이동
 const same=warmthTarget(p,[rec(10,10,8)],10).personalOffset;
 assert.ok(Math.abs(same-(8-5.8)/2)<.15,String(same));assert.ok(one.personalOffset<same);
});

test('cold and hot votes give a rough one-point-per-step estimate in the quick estimate',()=>{
 const cold=warmthTarget(p,[rec(10,10,6,-1)],0),hot=warmthTarget(p,[rec(10,10,6,1)],0),base=warmthTarget(p,[],0);
 assert.ok(cold.target>base.target&&hot.target<base.target);
 const veryCold=warmthTarget(p,[rec(10,10,6,-2)],0);assert.ok(veryCold.target>cold.target);
});

test('records far away in temperature are not transferred',()=>{
 assert.equal(warmthTarget(p,[rec(10,-5,12)],20).source,'provisional');
 assert.equal(warmthTarget(p,[rec(10,-5,12)],20).target,warmthTarget(p,[],20).target);
});

test('a nearby record is compared after correcting for the temperature difference',()=>{
 // 10℃에서 6점이 조금 추웠다면 15℃의 하한은 6점보다 낮아야 합니다.
 const m=warmthTarget(p,[rec(10,10,6,-1)],15);
 assert.ok(m.range.lower<6,JSON.stringify(m.range));
 assert.ok(warmthTarget(p,[rec(10,10,6,-1)],5).range.lower>6.5);
});

test('sensitivity settings make a clearly visible difference',()=>{
 assert.equal(sensitivityPrior({cold:2,heat:0},5),2);
 assert.equal(sensitivityPrior({cold:0,heat:2},28),-2);
 assert.ok(sensitivityPrior({cold:0,heat:2},0)<=-1,'heat-prone people also need less in cold weather');
 assert.ok(warmthTarget({...p,cold:2},[],10).target-warmthTarget({...p,cold:-2},[],10).target>=3);
});
