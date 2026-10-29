import {spawn} from 'node:child_process';
import {mkdir,writeFile,mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);const directory=await mkdtemp(join(tmpdir(),'weather-browser-'));
await mkdir(new URL('.qa/',root),{recursive:true});
const local=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'3014',HOST:'127.0.0.1',DATA_DIR:join(directory,'db')},windowsHide:true,stdio:'ignore'});
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9334','--user-data-dir='+join(directory,'browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn){let last;for(let i=0;i<100;i++){try{const v=await fn();if(v)return v;}catch(e){last=e;}await pause(150);}throw last||Error('Browser check timed out');}
try{
 await waitFor(async()=>{const r=await fetch('http://127.0.0.1:3014/');return r.ok;});
 const pages=await waitFor(async()=>{const r=await fetch('http://127.0.0.1:9334/json');const pages=(await r.json()).filter(p=>p.type==='page'&&p.url==='about:blank');return pages.length?pages:null;});
 ws=new WebSocket(pages[0].webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let counter=0;const queue=new Map(),errors=[];
 ws.onmessage=e=>{const b=JSON.parse(e.data);if(b.id){const pending=queue.get(b.id);queue.delete(b.id);b.error?pending.reject(Error(b.error.message)):pending.resolve(b.result);}if(b.method==='Page.javascriptDialogOpening')send('Page.handleJavaScriptDialog',{accept:true});if(b.method==='Runtime.exceptionThrown')errors.push(b.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++counter;queue.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
 await send('Runtime.enable');await send('Page.enable');
 if(process.argv.includes('--icons')){
  const svg=await readFile(new URL('public/favicon.svg',root),'utf8');
  await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  for(const size of [32,180]){
   await send('Emulation.setDeviceMetricsOverride',{width:size,height:size,deviceScaleFactor:1,mobile:false});
   await evaluate(`document.open();document.write(${JSON.stringify('<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style></head><body>'+svg+'</body></html>')});document.close();`);
   const capture=await send('Page.captureScreenshot',{format:'png'});const png=Buffer.from(capture.data,'base64');
   if(size===180)await writeFile(new URL('public/apple-touch-icon.png',root),png);
   else{const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=32;header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);await writeFile(new URL('public/favicon.ico',root),Buffer.concat([header,png]));}
  }
  await send('Emulation.setDefaultBackgroundColorOverride',{});
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:3014/'});
 try{await waitFor(()=>evaluate('!!document.querySelector("#login")'));}catch(e){console.log(await evaluate('document.documentElement.outerHTML.slice(0,2500)'));console.log(errors);throw e;}
 async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL('.qa/'+name+'.png',root),Buffer.from(r.data,'base64'));}
 await screenshot('desktop-welcome');
 await evaluate(`document.querySelector('#login input').value='브라우저테스트';document.querySelector('#login').requestSubmit();`);
 await waitFor(()=>evaluate('!!document.querySelector("#settings")'));
 await evaluate(`document.querySelector('#settings').requestSubmit()`);
 await waitFor(()=>evaluate('!!document.querySelector("#catalog")'));
 assert.equal(await evaluate('document.querySelector("#outfits").hidden'),true);
 assert.equal(await evaluate('!!document.querySelector(".status-provisional")'),true);
 await screenshot('desktop-dashboard');
 await evaluate(`document.querySelector('[data-view="outfits"]').click()`);
 assert.equal(await evaluate('document.querySelector(".overview").hidden'),true);
 const initialSelection=await evaluate(`Array.from(document.querySelectorAll('#catalog input:checked'),c=>({id:c.value,variant:document.querySelector('[data-variant="'+c.value+'"]').value}))`);
 await evaluate(`document.querySelector('#clear-outfit').click()`);
 assert.equal(await evaluate(`document.querySelectorAll('#catalog input:checked').length`),0);
 assert.equal(await evaluate(`document.querySelector('#apply-outfit').disabled`),true);
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('#catalog select'),s=>getComputedStyle(s).backgroundRepeat).every(v=>v==='no-repeat')`),true);
 await evaluate(`document.querySelector('#reset-outfit').click()`);
 const restoredSelection=await evaluate(`Array.from(document.querySelectorAll('#catalog input:checked'),c=>({id:c.value,variant:document.querySelector('[data-variant="'+c.value+'"]').value}))`);
 assert.deepEqual(restoredSelection,initialSelection);
 const result=await evaluate(`(()=>{for(const c of document.querySelectorAll('#catalog input:checked')){c.checked=false;c.dispatchEvent(new Event('change'));}for(const id of ['tee','shirt','wind']){const c=document.querySelector('#catalog input[value="'+id+'"]');c.checked=true;c.dispatchEvent(new Event('change'));}const v=document.querySelector('[data-variant="shirt"]');v.value='flannel';v.dispatchEvent(new Event('change'));return document.querySelector('.combo-score').textContent;})()`);
 assert.match(result,/4\.5/);
 await evaluate(`document.querySelector('#apply-outfit').click();document.querySelector('#feedback input[value="0"]').checked=true;document.querySelector('#feedback').requestSubmit();`);
 await waitFor(()=>evaluate('document.querySelectorAll(".history-row").length===1'));
 const data=await evaluate(`fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'브라우저테스트'})}).then(r=>r.json())`);
 assert.equal(data.records[0].score,4.5);assert.equal(data.records[0].itemOptions.shirt,'flannel');assert.equal(data.records[0].scoreVersion,2);
 assert.equal(await evaluate('document.querySelectorAll(".forecast-table thead th").length'),9);
 await evaluate(`document.querySelector('[data-view="feedback"]').click();document.querySelector('#feedback input[value="1"]').checked=true;document.querySelector('#feedback').requestSubmit()`);
 await waitFor(()=>evaluate('document.querySelector(".history-row .feedback-tag").textContent.includes("조금 더웠어요")'));
 assert.equal(await evaluate('document.querySelectorAll(".history-row").length'),1);
 const updated=await evaluate(`fetch('/api/data?userId=${data.profile.id}').then(r=>r.json())`);
 assert.equal(updated.records.length,1);assert.equal(updated.records[0].rating,1);assert.equal(updated.records[0].id,'day:'+updated.records[0].date);
 await evaluate(`document.querySelector('[data-edit]').click()`);
 assert.equal(await evaluate(`document.querySelector('#feedback input:checked').value`),'1');
 await evaluate(`document.querySelector('[data-view="weather"]').click();document.querySelector('#tomorrow').click()`);
 assert.equal(await evaluate(`document.querySelector('#today').getAttribute('aria-pressed')`),'false');
 await evaluate(`document.querySelector('#today').click();document.querySelector('[data-view="outfits"]').click()`);
 assert.match(await evaluate(`document.querySelector('.combo-score').textContent`),/4\.5/);
 const past=await evaluate(`(async()=>{const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()-86400000));const r=await fetch('/api/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'${data.profile.id}',record:{id:'past-test',date,items:['long'],rating:0,context:'outdoor',weather:{temp:-2,feels:-5,hour:7,city:'과거테스트'}}})});if(!r.ok)throw Error(await r.text());return date;})()`);
 await send('Page.reload');await waitFor(()=>evaluate('document.querySelectorAll(".history-row").length===2'));
 await evaluate(`document.querySelector('[data-view="history"]').click();document.querySelector('[data-edit="${past}"]').click()`);
 assert.equal(await evaluate(`document.querySelector('#feedback [name=hour]').disabled`),true);
 await evaluate(`document.querySelector('#feedback input[value="-1"]').checked=true;document.querySelector('#feedback').requestSubmit()`);
 await waitFor(()=>evaluate('document.querySelector("#notice").textContent.includes("수정했어요")'));
 const afterPast=await evaluate(`fetch('/api/data?userId=${data.profile.id}').then(r=>r.json())`);
 assert.equal(afterPast.records.length,2);const savedPast=afterPast.records.find(r=>r.date===past);assert.equal(savedPast.rating,-1);assert.equal(savedPast.weather.feels,-5);assert.equal(savedPast.weather.hour,7);
 await evaluate(`document.querySelector('#back-today').click();document.querySelector('[data-view="history"]').click();document.querySelector('[data-delete="${past}"]').click()`);
 await waitFor(()=>evaluate('document.querySelectorAll(".history-row").length===1'));
 const deleted=await evaluate(`fetch('/api/data?userId=${data.profile.id}').then(r=>r.json())`);
 assert.equal(deleted.records.length,1);
 await evaluate(`document.querySelector('[data-view="settings"]').click();document.querySelector('[data-preference-tab="routine"]').click();document.querySelector('#settings [name="exposure"]').value='long';document.querySelector('#settings [name="commute"]').value='transit';document.querySelector('[data-preference-tab="sensitivity"]').click();document.querySelector('#settings [name="windSensitivity"]').value='high';document.querySelector('#settings [name="sweat"]').value='high';document.querySelector('[data-preference-tab="style"]').click();document.querySelector('#settings [name="style"]').value='simple';document.querySelector('#settings').requestSubmit()`);
 await waitFor(()=>evaluate('document.querySelector("#notice").textContent.includes("설정을 저장" )'));
 const pref=await evaluate(`fetch('/api/data?userId=${data.profile.id}').then(r=>r.json())`);assert.equal(pref.profile.style,'simple');assert.equal(pref.profile.exposure,'long');assert.equal(pref.profile.commute,'transit');assert.equal(pref.profile.windSensitivity,'high');assert.equal(pref.profile.sweat,'high');
 await screenshot('desktop-settings');
 await evaluate(`document.querySelector('[data-view="weather"]').click()`);
 await evaluate(`document.querySelector('.target-details summary').click()`);
 assert.ok(await evaluate(`document.querySelector('.target-details').textContent.includes('예상 보온 범위')`));
 await evaluate(`(async()=>{const currentDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());const w=await fetch('/api/weather?city=seoul').then(r=>r.json());const index=w.hourly.time.indexOf(currentDate+'T08:00');for(let i=0;i<3;i++){const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()-i*86400000));const response=await fetch('/api/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'${data.profile.id}',record:{id:'neutral-'+i,date,items:['shirt','light'],rating:0,context:'outdoor',activity:'normal',exposure:'long',weather:{temp:w.hourly.temperature_2m[index],feels:w.hourly.apparent_temperature[index],hour:8,city:'브라우저테스트'}}})});if(!response.ok)throw Error(await response.text());}})()`);
 await send('Page.reload');await waitFor(()=>evaluate('!!document.querySelector(".status-personal")'));
 assert.equal(await evaluate('document.querySelector(".range-headline strong").textContent'),'5.5~6.5점');
 assert.equal(await evaluate('document.querySelectorAll(".evidence-card").length'),3);
 await screenshot('desktop-personal-range');
 await evaluate(`document.querySelector('[data-use-date]').click()`);
 assert.equal(await evaluate('document.querySelector("#outfits").hidden'),false);
 assert.match(await evaluate('document.querySelector(".combo-score").textContent'),/^6점$/);
 assert.match(await evaluate('document.querySelector(".target").textContent'),/5\.5~6\.5/);
 await evaluate(`document.querySelector('[data-view="weather"]').click()`);
 for(const [width,height,name] of [[390,844,'mobile-dashboard'],[768,1024,'tablet-dashboard']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
  await evaluate('window.scrollTo(0,0)');await pause(200);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),`horizontal overflow at ${width}`);
  await screenshot(name);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate(`document.querySelector('[data-view="settings"]').click();document.querySelector('[data-preference-tab="sensitivity"]').click()`);await screenshot('mobile-settings');
 await evaluate(`document.querySelector('[data-view="outfits"]').click();document.querySelector('#outfits').scrollIntoView({behavior:'instant'})`);await screenshot('mobile-builder');
 assert.deepEqual(errors,[]);
 console.log('Browser PASS: login, reset/clear recommendation, settings, custom layering, variants, daily update without duplicates, edit preload, deletion, style preferences, main tabs, 3-hour forecast, day-specific drafts; responsive widths 390 / 768 / 1440. Screenshots in .qa/');
}finally{if(ws?.readyState===1)ws.close();browser.kill();local.kill();}
