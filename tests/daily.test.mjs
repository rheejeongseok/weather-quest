import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyRecords} from '../record.mjs';
import {threeHourly,dayRange,sky} from '../forecast.mjs';
test('legacy duplicate dates display the latest entry and canonical updates take precedence',()=>{
 const a={id:'old-a',date:'2026-10-28',rating:-1,updatedAt:'2026-10-28T01:00:00Z'};const b={...a,id:'old-b',rating:0,updatedAt:'2026-10-28T02:00:00Z'};
 assert.deepEqual(dailyRecords([a,b]),[b]);const c={...a,id:'day:2026-10-28',rating:1};assert.deepEqual(dailyRecords([a,b,c]),[c]);
});
test('three-hour forecasts use only the selected Korean local date and retain zero values',()=>{
 const time=Array.from({length:48},(_,i)=>`2026-10-${i<24?'28':'29'}T${String(i%24).padStart(2,'0')}:00`);
 const h={time,temperature_2m:time.map((_,i)=>i),apparent_temperature:time.map(()=>0),precipitation_probability:time.map(()=>0),wind_speed_10m:time.map(()=>0),weather_code:time.map(()=>0),is_day:time.map(()=>1)};
 const forecast=threeHourly({hourly:h},'2026-10-29');assert.equal(forecast.length,8);assert.deepEqual(forecast.map(p=>p.hour),[0,3,6,9,12,15,18,21]);assert.equal(forecast[0].temp,24);assert.equal(forecast[0].feels,0);
 assert.deepEqual(dayRange({hourly:h},'2026-10-28'),{min:0,max:23});assert.equal(sky(0,0).text,'맑음');assert.equal(sky(71).text,'눈');assert.equal(sky(95).text,'뇌우');
});
