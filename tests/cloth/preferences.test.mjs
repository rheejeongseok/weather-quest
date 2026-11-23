import test from 'node:test';
import assert from 'node:assert/strict';
import {recommend,warmthTarget,sensitivityPrior,comfortNotes,sensitivityChoices,preferenceSettings} from '../../apps/cloth/lib.mjs';

test('five-level cold and heat keep old values and add a less-sensitive side in display order',()=>{
 assert.deepEqual(sensitivityChoices.cold.map(([v])=>v),[-2,-1,0,1,2]);
 assert.deepEqual(sensitivityChoices.heat.map(([v])=>v),[-2,-1,0,1,2]);
 assert.ok(sensitivityPrior({cold:-2,heat:0},5)<0);
 assert.ok(sensitivityPrior({cold:2,heat:0},5)>0);
 assert.ok(warmthTarget({cold:-2,heat:0},[],5).target<warmthTarget({cold:0,heat:0},[],5).target);
});

test('avoided clothes leave automatic recommendations but never empty them',()=>{
 const base=recommend(0,0,'normal',0,'balanced',{});
 const avoided=base.items.map(c=>c.id);
 const next=recommend(0,0,'normal',0,'balanced',{avoid:avoided});
 assert.ok(next.items.every(c=>!avoided.includes(c.id)));
 const all=['thermal','tee','long','shirt','sweat','knit','cardigan','ziphood','fleece','wind','jacket','trench','coat','light','padded'];
 assert.ok(recommend(0,0,'normal',0,'balanced',{avoid:all}).items.length>0);
});

test('outer and top preferences reorder outfits inside the same warmth range',()=>{
 for(const [type,ids] of [['padding',['light','padded']],['coat',['trench','coat']]]){
  const r=recommend(0,0,'normal',0,'balanced',{outerType:type});
  assert.ok(r.items.some(c=>ids.includes(c.id)),type);
  assert.equal(r.target,recommend(0,0,'normal',0,'balanced',{}).target);
 }
 const knit=recommend(5,0,'normal',0,'balanced',{topType:'knit'});
 assert.ok(knit.items.some(c=>c.id==='knit'));
 const noInner=recommend(-5,0,'normal',0,'balanced',{inner:'avoid'});
 assert.ok(!noInner.items.some(c=>c.slot==='inner'));
});

test('cold spot and day swing produce advice only when relevant',()=>{
 assert.equal(comfortNotes({coldSpot:'hands'},{feels:3,wind:0}).length,1);
 assert.equal(comfortNotes({coldSpot:'hands'},{feels:15,wind:0}).length,0);
 assert.equal(comfortNotes({swingSensitivity:'high'},{feels:10,wind:0,swing:10}).length,1);
 assert.equal(comfortNotes({swingSensitivity:'high'},{feels:10,wind:0,swing:4}).length,0);
 assert.equal(comfortNotes({windSensitivity:'veryHigh'},{feels:10,wind:9}).length,1);
 assert.equal(preferenceSettings({outerType:'cape'}).outerType,'any');
});

test('new garments have variants and keep vest out of the base layer',async()=>{
 const {clothes,outfit}=await import('../../apps/cloth/lib.mjs');
 for(const id of ['vest','blazer','leather','field','longpad'])assert.ok(clothes.find(c=>c.id===id)?.variants.length>=2,id);
 assert.ok(!clothes.find(c=>c.id==='vest').roles.includes('base'));
 assert.ok(clothes.find(c=>c.id==='knit').variants.some(v=>v.id==='turtle'));
 assert.ok(outfit(['longpad']).score>outfit(['padded']).score);
});

test('season bands pick natural outfits without changing the required warmth',async()=>{
 const {seasonBands}=await import('../../apps/cloth/lib.mjs');
 const heavy=['padded','longpad','leather:shearling','coat:thick'];
 for(const t of [12,15,18,22]){
  const r=recommend(t,0);
  assert.ok(!r.items.some(c=>heavy.includes(c.id)||heavy.includes(c.id+':'+c.variantId)),`${t}℃: ${r.items.map(c=>c.variantName)}`);
  assert.ok(Math.abs(r.score-r.target)<=.6);
 }
 for(const t of [-10,-3])assert.ok(!recommend(t,0).items.some(c=>c.id==='tee'&&c.variantId==='thin'),`${t}℃ thin tee`);
 assert.ok(Object.values(seasonBands).every(([a,b])=>a<b));
});
