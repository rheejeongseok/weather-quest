import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../record.mjs';
import {warmthTarget,recordFeels,recommendationStats,comparabilityWeight} from '../lib.mjs';
import {backfillObservations,observationFor,needsObservation,cityKey,clearObservationCache} from '../observed.mjs';

const base={id:'obs-test',date:'2026-11-10',items:['shirt','light'],rating:0,context:'outdoor',weather:{temp:10,feels:8,hour:8,city:'서울'}};

test('new context fields are sanitized and old records stay valid',()=>{
 const old=validateRecord(base);
 assert.equal(old.swing,null);assert.equal(old.bottom,null);assert.deepEqual(old.accessories,[]);assert.equal(old.layerChange,null);
 assert.equal(old.recommendation,null);assert.equal(old.observed,null);assert.equal(old.weather.window,null);
 const r=validateRecord({...base,swing:'colderLater',bottom:'warm',accessories:['scarf','scarf','gloves','bogus'],layerChange:'removed',
  weather:{...base.weather,rain:30,precip:2.345,cloud:120,radiation:-5,window:{start:8,end:10,minFeels:7,maxFeels:12.345,meanFeels:9.5}}});
 assert.equal(r.swing,'colderLater');assert.equal(r.bottom,'warm');assert.deepEqual(r.accessories,['scarf','gloves']);assert.equal(r.layerChange,'removed');
 assert.equal(r.weather.rain,30);assert.equal(r.weather.precip,2.3);assert.equal(r.weather.cloud,100);assert.equal(r.weather.radiation,0);
 assert.deepEqual(r.weather.window,{start:8,end:10,minFeels:7,maxFeels:12.3,meanFeels:9.5});
 assert.equal(validateRecord({...base,swing:'nope',bottom:'nope',layerChange:'nope'}).swing,null);
 assert.throws(()=>validateRecord({...base,weather:{...base.weather,window:{start:10,end:8}}}),/종료 시각/);
});

test('recommendation snapshot records whether the worn outfit was inside the range and followed',()=>{
 const worn=validateRecord(base);// shirt 2.5 + light 3.5 = 6
 const within=validateRecord({...base,recommendation:{lower:5,upper:7,target:6,source:'learning',feels:8,hour:8,items:['shirt','light'],itemOptions:{}}});
 assert.equal(worn.score,6);assert.equal(within.recommendation.rangeResult,'within');assert.equal(within.recommendation.followed,true);assert.equal(within.recommendation.score,6);
 const below=validateRecord({...base,recommendation:{lower:7,upper:9,source:'personal',items:['knit','coat']}});
 assert.equal(below.recommendation.rangeResult,'below');assert.equal(below.recommendation.followed,false);
 const variant=validateRecord({...base,recommendation:{lower:5,upper:7,items:['shirt','light'],itemOptions:{light:'warm'}}});
 assert.equal(variant.recommendation.followed,false);
 const unknownItems=validateRecord({...base,recommendation:{lower:5,upper:7,source:'hacked',items:['nope']}});
 assert.equal(unknownItems.recommendation.items,null);assert.equal(unknownItems.recommendation.followed,null);assert.equal(unknownItems.recommendation.source,null);
 assert.equal(validateRecord({...base,recommendation:{lower:9,upper:5}}).recommendation,null);
});

test('learning temperature prefers observed weather, then outing window, then the forecast hour',()=>{
 assert.equal(recordFeels({weather:{feels:8}}),8);
 assert.equal(recordFeels({weather:{feels:8,window:{meanFeels:10}}}),10);
 assert.equal(recordFeels({weather:{feels:8,window:{meanFeels:10}},observed:{feels:3}}),3);
 const p={cold:0,heat:0};
 // 예보로는 20℃였지만 실제로는 8℃였던 날: 8℃ 추천에 근거로 쓰여야 합니다.
 const record=validateRecord({...base,weather:{...base.weather,temp:21,feels:20},observed:{temp:9,feels:8}});
 assert.equal(warmthTarget(p,[record],8).anchors,1);
 assert.equal(warmthTarget(p,[record],20).anchors,0);
});

test('records that are hard to compare by top warmth get lower weight, not a point shift',()=>{
 assert.equal(comparabilityWeight({}).weight,1);
 assert.equal(comparabilityWeight({swing:'steady',layerChange:'none',bottom:'normal',accessories:[]}).weight,1);
 assert.ok(comparabilityWeight({swing:'warmerLater'}).weight<1);
 assert.ok(comparabilityWeight({layerChange:'removed',bottom:'warm',accessories:['scarf']}).notes.length===2);
 const p={cold:0,heat:0};
 const plain=validateRecord(base),mixed=validateRecord({...base,swing:'colderLater',layerChange:'added'});
 const a=warmthTarget(p,[plain],8),b=warmthTarget(p,[mixed],8);
 assert.ok(b.effectiveAnchors<a.effectiveAnchors);
 assert.equal(b.evidence[0].comparabilityNotes.length,2);
});

test('recommendation stats compare saved recommendations with later feedback',()=>{
 const rec=(date,rating,rangeResult,followed=false)=>({date,rating,context:'outdoor',recommendation:{rangeResult,followed}});
 const stats=recommendationStats([rec('2026-11-01',0,'within',true),rec('2026-11-02',-2,'within'),rec('2026-11-03',0,'above'),rec('2026-11-04',1,'below'),
  {...rec('2026-11-05',0,'within'),context:'indoor'},{date:'2026-11-06',rating:0,context:'outdoor'}]);
 assert.deepEqual(stats,{total:4,within:2,withinComfortable:1,comfortable:2,severe:1,followed:1});
});

function hourlyFor(dates){
 const time=[],temperature_2m=[],apparent_temperature=[],wind_speed_10m=[],cloud_cover=[],shortwave_radiation=[],precipitation=[];
 for(const date of dates)for(let h=0;h<24;h++){time.push(`${date}T${String(h).padStart(2,'0')}:00`);temperature_2m.push(h);apparent_temperature.push(h-2);wind_speed_10m.push(10);cloud_cover.push(50);shortwave_radiation.push(h*10);precipitation.push(h===9?1.2:0);}
 return {time,temperature_2m,apparent_temperature,wind_speed_10m,cloud_cover,shortwave_radiation,precipitation};
}

test('observed weather averages the outing window',()=>{
 const hourly=hourlyFor(['2026-11-10']);
 const single=observationFor(validateRecord(base),hourly,'2026-11-11T00:00:00.000Z');
 assert.equal(single.feels,6);assert.equal(single.temp,8);assert.equal(single.precip,0);
 const windowed=observationFor(validateRecord({...base,weather:{...base.weather,window:{start:8,end:10}}}),hourly);
 assert.equal(windowed.feels,7);assert.equal(windowed.minFeels,6);assert.equal(windowed.maxFeels,8);assert.equal(windowed.precip,1.2);assert.equal(windowed.cloud,50);
 assert.equal(observationFor(validateRecord({...base,date:'2026-11-09'}),hourly),null);
});

test('backfill fills past outdoor records once per city and skips today, indoor and unknown cities',async()=>{
 clearObservationCache();
 const now=new Date('2026-11-20T03:00:00Z');// 한국 시간 12시
 const records=[validateRecord(base),validateRecord({...base,date:'2026-11-12'}),validateRecord({...base,date:'2026-11-20'}),
  validateRecord({...base,date:'2026-11-13',context:'indoor'}),validateRecord({...base,date:'2026-11-14',weather:{...base.weather,city:'뉴욕'}})];
 assert.equal(cityKey('서울'),'seoul');assert.equal(cityKey('뉴욕'),null);
 assert.deepEqual(records.map(r=>needsObservation(r,'2026-11-20')),[true,true,false,false,false]);
 let calls=0;const saved=[];
 const fetcher=async url=>{calls++;assert.match(url,/past_days=92/);return {ok:true,json:async()=>({hourly:hourlyFor(['2026-11-10','2026-11-12'])})};};
 const count=await backfillObservations(records,{save:async r=>saved.push(r),fetcher,now});
 assert.equal(count,2);assert.equal(calls,1);assert.ok(saved.every(r=>r.observed.feels===6));
 await backfillObservations([validateRecord({...base,date:'2026-11-11'})],{save:async()=>{},fetcher,now});
 assert.equal(calls,1,'same-day city data is cached');
 const failing=await backfillObservations([validateRecord({...base,weather:{...base.weather,city:'부산'}})],{save:async()=>assert.fail(),fetcher:async()=>({ok:false}),now});
 assert.equal(failing,0);
});
