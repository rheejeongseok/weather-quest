import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyRecords} from '../../apps/cloth/record.mjs';
import {threeHourly,dayRange,sky} from '../../apps/cloth/forecast.mjs';
test('legacy duplicate dates display the latest entry and canonical updates take precedence',()=>{
 const a={id:'old-a',date:'2026-10-28',rating:-1,updatedAt:'2026-10-28T01:00:00Z'};const b={...a,id:'old-b',rating:0,updatedAt:'2026-10-28T02:00:00Z'};
 assert.deepEqual(dailyRecords([a,b]),[b]);const c={...a,id:'day:2026-10-28',rating:1};assert.deepEqual(dailyRecords([a,b,c]),[c]);
});
test('three-hour forecasts use only the selected Korean local date and retain zero values',()=>{
 const time=Array.from({length:48},(_,i)=>`2026-10-${i<24?'28':'29'}T${String(i%24).padStart(2,'0')}:00`);
 const h={time,temperature_2m:time.map((_,i)=>i),apparent_temperature:time.map(()=>0),precipitation_probability:time.map(()=>0),wind_speed_10m:time.map(()=>0),weather_code:time.map(()=>0),is_day:time.map(()=>1)};
 const forecast=threeHourly({hourly:h},'2026-10-29');assert.equal(forecast.length,8);assert.deepEqual(forecast.map(p=>p.hour),[0,3,6,9,12,15,18,21]);assert.equal(forecast[0].temp,24);assert.equal(forecast[0].feels,0);
 assert.deepEqual(dayRange({hourly:h},'2026-10-28'),{min:0,max:23,precip:null});assert.equal(sky(0,0).text,'맑음');assert.equal(sky(71).text,'눈');assert.equal(sky(95).text,'뇌우');
});
test('precipitation is summed per three-hour slot and per day without crossing dates',()=>{
 const time=Array.from({length:48},(_,i)=>`2026-10-${i<24?'28':'29'}T${String(i%24).padStart(2,'0')}:00`);
 const precipitation=time.map((_,i)=>i===9?1.2:i===10?.5:i===23?2:i===24?3:0);
 const h={time,temperature_2m:time.map(()=>10),apparent_temperature:time.map(()=>8),precipitation_probability:time.map(()=>0),precipitation,wind_speed_10m:time.map(()=>0),weather_code:time.map(()=>0),is_day:time.map(()=>1)};
 const day28=threeHourly({hourly:h},'2026-10-28');
 assert.equal(day28.find(p=>p.hour===9).precip,1.7);
 assert.equal(day28.find(p=>p.hour===21).precip,2,'21시 칸은 다음 날 0시 비를 포함하지 않음');
 assert.equal(day28.find(p=>p.hour===0).precip,0);
 assert.equal(dayRange({hourly:h},'2026-10-28').precip,3.7);
 assert.equal(dayRange({hourly:h,daily:{time:['2026-10-29'],temperature_2m_min:[5],temperature_2m_max:[12],precipitation_sum:[4.4]}},'2026-10-29').precip,4.4);
 const {precipitation:_,...noPrecip}=h;
 assert.equal(threeHourly({hourly:noPrecip},'2026-10-28')[0].precip,null);
});
