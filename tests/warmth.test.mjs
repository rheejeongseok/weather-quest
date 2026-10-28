import test from 'node:test';
import assert from 'node:assert/strict';
import {outfit,compareOutfit,clothes,correction} from '../lib.mjs';
import {validateRecord} from '../record.mjs';
const example={id:'warmth-test',date:'2026-10-28',items:['shirt','light'],rating:0,context:'outdoor',weather:{temp:10,feels:8,hour:8,city:'서울'}};
test('thicker variants give warmer combinations without a material-only multiplier',()=>{
 assert.ok(outfit(['shirt'],{shirt:'flannel'}).score>outfit(['shirt'],{shirt:'thin'}).score);
 assert.ok(outfit(['knit'],{knit:'thick'}).score>outfit(['knit'],{knit:'thin'}).score);
 assert.ok(outfit(['wind']).score<outfit(['long']).score);
 for(const c of clothes)for(const v of c.variants)assert.ok(Number.isFinite(v.score)&&v.score>0&&v.material);
});
test('manual combinations report lighter, similar and warmer and warn about wind separately',()=>{
 assert.match(compareOutfit(['tee'],{},5).message,/가벼워요/);
 assert.match(compareOutfit(['tee'],{},1).message,/비슷/);
 assert.match(compareOutfit(['padded'],{},1).message,/따뜻/);
 assert.ok(compareOutfit(['knit'],{},3,30).windWarning);
 assert.equal(compareOutfit(['tee','wind'],{},3,30).windWarning,'');
});
test('server recalculates selected variants and persists their snapshot',()=>{
 const r=validateRecord({...example,itemOptions:{shirt:'flannel',light:'warm'},score:99});
 assert.equal(r.score,7.5);assert.equal(r.scoreVersion,2);assert.equal(r.garments[0].variantName,'플란넬·기모 셔츠');
 assert.throws(()=>validateRecord({...example,itemOptions:{shirt:'made-up'}}));
});
test('legacy backups preserve original points but learning uses current scale',()=>{
 const legacy=validateRecord({...example,score:8,updatedAt:'2026-10-28T00:00:00Z'},{importing:true});assert.equal(legacy.score,8);assert.equal(legacy.scoreVersion,1);
 const modern=validateRecord(example);const p={cold:0,heat:0};assert.equal(correction(p,[legacy]),correction(p,[modern]));
 const imported=validateRecord(modern,{importing:true});assert.equal(imported.score,modern.score);assert.deepEqual(imported.itemOptions,modern.itemOptions);
});
