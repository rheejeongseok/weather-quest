import {spawn} from 'node:child_process';
import {mkdir,writeFile,mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);const directory=await mkdtemp(join(tmpdir(),'weather-browser-'));
await mkdir(new URL('.qa/',root),{recursive:true});
const local=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,WQ_OBSERVED:'off',PORT:'3014',HOST:'127.0.0.1',DATA_DIR:join(directory,'db')},windowsHide:true,stdio:'ignore'});
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
  const maskable=svg.replace(/<rect width="64" height="64" rx="16"/,'<rect width="64" height="64" rx="0"').replace(/<svg([^>]*)viewBox="0 0 64 64"/,'<svg$1viewBox="-8 -8 80 80" style="background:#2f5d50"');
  for(const size of [32,180,192,512,'maskable']){const px=size==='maskable'?512:size;const source=size==='maskable'?maskable:svg;
   await send('Emulation.setDeviceMetricsOverride',{width:px,height:px,deviceScaleFactor:1,mobile:false});
   await evaluate(`document.open();document.write(${JSON.stringify('<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style></head><body>'+source+'</body></html>')});document.close();`);
   const capture=await send('Page.captureScreenshot',{format:'png'});const png=Buffer.from(capture.data,'base64');
   if(size===180)await writeFile(new URL('public/apple-touch-icon.png',root),png);
   else if(size===192||size===512)await writeFile(new URL(`public/icon-${size}.png`,root),png);
   else if(size==='maskable')await writeFile(new URL('public/icon-maskable.png',root),png);
   else{const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=32;header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);await writeFile(new URL('public/favicon.ico',root),Buffer.concat([header,png]));}
  }
  await send('Emulation.setDefaultBackgroundColorOverride',{});
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:3014/'});
 try{await waitFor(()=>evaluate('!!document.querySelector("#login")'));}catch(e){console.log(await evaluate('document.documentElement.outerHTML.slice(0,2500)'));console.log(errors);throw e;}
 async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL('.qa/'+name+'.png',root),Buffer.from(r.data,'base64'));}
 await waitFor(()=>evaluate('!!document.querySelector(".home .drawer-row")'));await screenshot('desktop-home');
 assert.equal(await evaluate('document.querySelector("#app").hidden'),true,'home first');
 await evaluate("document.querySelector('[data-open=cloth]').click()");
 await screenshot('desktop-welcome');
 await evaluate(`document.querySelector('#login input').value='브라우저테스트';document.querySelector('#login').requestSubmit();`);
 await waitFor(()=>evaluate('!!document.querySelector("#settings")'));
 assert.equal(await evaluate('document.querySelector("[data-step-submit]").hidden'),true,'final button hidden on first step');
 assert.equal(await evaluate('document.querySelector("[data-preference-section=sensitivity]").hidden'),true);
 await evaluate(`document.querySelector('#settings').requestSubmit()`);
 assert.equal(await evaluate('document.querySelector("[data-preference-section=sensitivity]").hidden'),false,'Enter moves to next step instead of saving');
 assert.equal(await evaluate('document.querySelector(".stepper [aria-current=step]").dataset.step'),'sensitivity');
 await screenshot('desktop-onboarding');
 await evaluate(`document.querySelector('[data-step-prev]').click()`);assert.equal(await evaluate('document.querySelector("[data-preference-section=routine]").hidden'),false);
 await evaluate(`document.querySelector('[data-step-next]').click();document.querySelector('#settings [name=cold][value="-1"]').checked=true;document.querySelector('[data-step-next]').click();document.querySelector('#settings [name=avoid][value=trench]').checked=true;document.querySelector('#settings [name=outerType][value=padding]').checked=true`);
 assert.equal(await evaluate('document.querySelector("[data-step-submit]").hidden'),false,'final button on last step');
 await evaluate(`document.querySelector('[data-step-submit]').click()`);
 await waitFor(()=>evaluate('!!document.querySelector("#catalog")'));
 assert.ok(await evaluate('!!document.querySelector(".folded-clothes input[value=trench]")'),'avoided clothes are folded');assert.ok(await evaluate('!!document.querySelector("#catalog input[value=longpad]")&&!!document.querySelector("#catalog input[value=vest]")'),'new garments listed');
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
 assert.equal(data.records[0].score,4.5);assert.equal(data.records[0].itemOptions.shirt,'flannel');assert.equal(data.records[0].scoreVersion,3);
 const firstRec=data.records[0].recommendation;assert.ok(firstRec&&['below','within','above'].includes(firstRec.rangeResult)&&Number.isFinite(firstRec.lower),'recommendation snapshot saved');assert.ok(Number.isFinite(data.records[0].weather.window?.meanFeels),'outing window saved');assert.equal(data.records[0].swing,'steady');assert.equal(data.records[0].layerChange,'none');
 assert.ok(await evaluate('document.querySelector(".accuracy-summary strong").textContent==="1개"'),'accuracy summary shown');
 assert.equal(await evaluate('document.querySelectorAll(".forecast-table thead th").length'),9);
 await evaluate(`document.querySelector('[data-view="feedback"]').click();document.querySelector('#feedback input[value="1"]').checked=true;document.querySelector('#feedback [name=bottom]').value='warm';document.querySelector('#feedback [name=layerChange]').value='removed';document.querySelector('#feedback input[value="scarf"]').checked=true;document.querySelector('#feedback').requestSubmit()`);
 await waitFor(()=>evaluate('document.querySelector(".history-row .feedback-tag").textContent.includes("조금 더웠어요")'));
 assert.equal(await evaluate('document.querySelectorAll(".history-row").length'),1);
 const updated=await evaluate(`fetch('/api/data?userId=${data.profile.id}').then(r=>r.json())`);
 assert.equal(updated.records.length,1);assert.equal(updated.records[0].rating,1);assert.equal(updated.records[0].bottom,'warm');assert.equal(updated.records[0].layerChange,'removed');assert.deepEqual(updated.records[0].accessories,['scarf']);assert.equal(updated.records[0].recommendation.lower,firstRec.lower,'recommendation kept on edit');assert.equal(updated.records[0].id,'day:'+updated.records[0].date);
 await evaluate(`document.querySelector('[data-edit]').click()`);
 assert.equal(await evaluate(`document.querySelector('#feedback input:checked').value`),'1');
 await evaluate(`document.querySelector('[data-view="weather"]').click();document.querySelector('#tomorrow').click()`);
 assert.equal(await evaluate(`document.querySelector('#today').getAttribute('aria-pressed')`),'false');
 await evaluate(`document.querySelector('#today').click();document.querySelector('[data-view="outfits"]').click()`);
 assert.match(await evaluate(`document.querySelector('.combo-score').textContent`),/4\.5/);
 const past=await evaluate(`(async()=>{const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()-86400000));const r=await fetch('/api/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'${data.profile.id}',record:{id:'past-test',date,items:['long'],rating:0,context:'outdoor',weather:{temp:-2,feels:-5,hour:7,city:'과거테스트'}}})});if(!r.ok)throw Error(await r.text());return date;})()`);
 await send('Page.reload');await waitFor(()=>evaluate('document.querySelectorAll(".history-row").length===2'));
 await evaluate(`document.querySelector('[data-view="history"]').click();document.querySelector('[data-edit="${past}"]').click()`);
 assert.equal(await evaluate(`document.querySelector('#feedback [name=hour]').disabled`),true);assert.equal(await evaluate(`document.querySelector('#feedback [name=endHour]').disabled`),true);
 await evaluate(`document.querySelector('#feedback input[value="-1"]').checked=true;document.querySelector('#feedback').requestSubmit()`);
 await waitFor(()=>evaluate('document.querySelector("#notice").textContent.includes("수정했어요")'));
 const afterPast=await evaluate(`fetch('/api/data?userId=${data.profile.id}').then(r=>r.json())`);
 assert.equal(afterPast.records.length,2);const savedPast=afterPast.records.find(r=>r.date===past);assert.equal(savedPast.rating,-1);assert.equal(savedPast.weather.feels,-5);assert.equal(savedPast.weather.hour,7);
 await evaluate(`document.querySelector('#back-today').click();document.querySelector('[data-view="history"]').click();document.querySelector('[data-delete="${past}"]').click()`);
 await waitFor(()=>evaluate('document.querySelectorAll(".history-row").length===1'));
 const deleted=await evaluate(`fetch('/api/data?userId=${data.profile.id}').then(r=>r.json())`);
 assert.equal(deleted.records.length,1);
 await evaluate(`document.querySelector('[data-view="settings"]').click();document.querySelector('[data-preference-tab="routine"]').click();document.querySelector('#settings [name="exposure"]').value='long';document.querySelector('#settings [name="commute"]').value='transit';document.querySelector('[data-preference-tab="sensitivity"]').click();document.querySelector('#settings [name="windSensitivity"][value=high]').checked=true;document.querySelector('#settings [name="sweat"][value=high]').checked=true;document.querySelector('[data-preference-tab="style"]').click();document.querySelector('#settings [name="style"][value=simple]').checked=true;document.querySelector('#settings').requestSubmit()`);
 await waitFor(()=>evaluate('document.querySelector("#notice").textContent.includes("설정을 저장" )'));
 const pref=await evaluate(`fetch('/api/data?userId=${data.profile.id}').then(r=>r.json())`);assert.equal(pref.profile.style,'simple');assert.equal(pref.profile.exposure,'long');assert.equal(pref.profile.commute,'transit');assert.equal(pref.profile.windSensitivity,'high');assert.equal(pref.profile.sweat,'high');assert.equal(pref.profile.cold,-1);assert.deepEqual(pref.profile.avoid,['trench']);assert.equal(pref.profile.outerType,'padding');
 await screenshot('desktop-settings');
 await evaluate(`document.querySelector('[data-view="weather"]').click()`);
 await evaluate(`document.querySelector('.target-details summary').click()`);
 assert.ok(await evaluate(`document.querySelector('.target-details').textContent.includes('예상 보온 범위')`));
 await evaluate(`(async()=>{const currentDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());const w=await fetch('/api/weather?city=seoul').then(r=>r.json());const index=w.hourly.time.indexOf(currentDate+'T08:00');for(let i=0;i<3;i++){const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()-i*86400000));const response=await fetch('/api/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'${data.profile.id}',record:{id:'neutral-'+i,date,items:['shirt','light'],rating:0,context:'outdoor',activity:'normal',exposure:'long',weather:{temp:w.hourly.temperature_2m[index],feels:w.hourly.apparent_temperature[index],hour:8,city:'브라우저테스트'}}})});if(!response.ok)throw Error(await response.text());}})()`);
 await send('Page.reload');await waitFor(()=>evaluate('!!document.querySelector(".status-personal")'));
 assert.equal(await evaluate('document.querySelector(".range-headline strong").textContent'),'5.5~6.5점');
 assert.equal(await evaluate('document.querySelectorAll(".evidence-card").length'),3);
 await screenshot('desktop-personal-range');
 await evaluate(`document.querySelector('[data-app="subway"]').click()`);
 await waitFor(()=>evaluate('!!document.querySelector("#subway-form")'));
 await evaluate(`(()=>{const f=document.querySelector('#subway-form');f.elements.from.value='노원';f.elements.to.value='잠실';f.requestSubmit();})()`);
 await waitFor(()=>evaluate('!!document.querySelector(".route-summary")'));
 assert.match(await evaluate('document.querySelector(".route-summary").textContent'),/환승 1회/);
 assert.equal(await evaluate('document.querySelectorAll(".route-leg").length'),2);
 await screenshot('desktop-subway');
 // 프로필 저장: 동기화 안내에 닉네임이 보이고, 즐겨찾기가 프로필에 저장돼야 합니다
 assert.match(await evaluate('document.querySelector(".sync-note").textContent'),/브라우저테스트/);
 await evaluate("document.querySelector('[data-fav]').click()");
 assert.equal(await evaluate('document.querySelector("[data-fav]").getAttribute("aria-pressed")'),'true');
 await waitFor(async()=>{const r=await fetch('http://127.0.0.1:3014/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'브라우저테스트'})});const b=await r.json();return b.profile.subway?.favorites?.length===1&&b.profile.subway.favorites[0].from==='노원';});
 // 노선도: 역을 마우스로 눌러 팝업에서 '도착'을 고르면 경로가 다시 계산되고 지도에 표시돼야 합니다.
 assert.ok(await evaluate('document.querySelectorAll(".map-line").length>=12'),'map lines drawn');
 const stationPoint=await evaluate(`(()=>{const g=document.querySelector('.map-station[data-station="삼성"]');const r=g.querySelector('circle').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:stationPoint.x,y:stationPoint.y,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:stationPoint.x,y:stationPoint.y,button:'left',clickCount:1});
 await waitFor(()=>evaluate('!document.querySelector("#station-pop").hidden'));
 assert.match(await evaluate('document.querySelector("#station-pop b").textContent'),/삼성/);
 await evaluate(`document.querySelector('#station-pop [data-role="to"]').click()`);
 await waitFor(()=>evaluate('document.querySelector("#subway-form [name=to]").value==="삼성"'));
 assert.ok(await evaluate('document.querySelector("#subway-map").classList.contains("has-route")'),'route highlighted');
 assert.ok(await evaluate('document.querySelectorAll(".map-mark").length===2'),'from/to marks');
 await waitFor(()=>evaluate('/인증키|출발 기준|탈 열차:/.test(document.querySelector("#subway-plan")?.textContent||"")'));
 await evaluate("document.querySelector('#subway-plan').scrollIntoView({block:'center',behavior:'instant'})");await screenshot('desktop-subway-plan');
 await evaluate(`(()=>{const f=document.querySelector('#subway-form');f.elements.via.value='동대문';f.requestSubmit();})()`);
 await waitFor(()=>evaluate('document.querySelector(".route-summary").textContent.includes("동대문 경유")'));
 await screenshot('desktop-subway-map');
 // 초기화: 출발·경유·도착과 경로가 지워져야 합니다(이후 확인을 위해 다시 찾음)
 await evaluate(`document.querySelector('[data-reset]').click()`);
 assert.equal(await evaluate('document.querySelector("#subway-form [name=from]").value+document.querySelector("#subway-form [name=to]").value'),'');
 assert.equal(await evaluate('!!document.querySelector(".route-summary")'),false);
 await evaluate(`(()=>{const f=document.querySelector('#subway-form');f.elements.from.value='노원';f.elements.to.value='잠실';f.requestSubmit();})()`);
 await waitFor(()=>evaluate('!!document.querySelector(".route-summary")'));
 await evaluate(`document.querySelector('input[name=when][value=set]').click()`);
 assert.equal(await evaluate('document.querySelector("input[name=time]").hidden'),false);
 await evaluate(`document.querySelector('[data-app="cloth"]').click()`);
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
 await evaluate(`document.querySelector('[data-view="feedback"]').click()`);assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'horizontal overflow in feedback');await evaluate(`document.querySelector('#notice').hidden=true;document.querySelector('#feedback .field-pair').scrollIntoView({behavior:'instant'})`);await pause(150);await screenshot('mobile-feedback');
 await evaluate(`document.querySelector('[data-view="history"]').click()`);await screenshot('mobile-history');
 await evaluate(`document.querySelector('[data-app="subway"]').click()`);await waitFor(()=>evaluate('!!document.querySelector(".route-summary")'));assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'horizontal overflow in subway');await screenshot('mobile-subway');
 // 모바일 경로 탐색: 입력칸이 노선도 위, 초기화 후 지도에서 두 역을 누르면 출발·도착이 차례로 채워짐
 assert.ok(await evaluate('document.querySelector(".subway-picks").getBoundingClientRect().top<document.querySelector("#subway-map-wrap").getBoundingClientRect().top'),'picks above map');
 await evaluate("document.querySelector('[data-reset]').click()");
 await waitFor(()=>evaluate('!document.querySelector("#map-hint").hidden'));
 await evaluate("document.querySelector('#subway-map-wrap').scrollIntoView({block:'end',behavior:'instant'})");await pause(300);
 const picks=await evaluate(`(()=>{const out=[];for(const g of document.querySelectorAll('.map-station.transfer')){const r=g.querySelector('circle').getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const hit=document.elementFromPoint(x,y);if(hit&&hit.closest('.map-station')===g&&!out.some(o=>Math.hypot(o.x-x,o.y-y)<40))out.push({name:g.dataset.station,x,y});if(out.length===2)break;}return out;})()`);
 assert.equal(picks.length,2,'two tappable stations');
 for(const p of picks){await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await pause(200);}
 await waitFor(()=>evaluate(`document.querySelector('#subway-form [name=from]').value===${JSON.stringify(picks[0].name)}&&document.querySelector('#subway-form [name=to]').value===${JSON.stringify(picks[1].name)}`));
 await waitFor(()=>evaluate('!!document.querySelector(".route-summary")'));
 assert.equal(await evaluate('document.querySelector("#map-hint").hidden'),true);
 await evaluate('window.scrollTo(0,0)');await pause(200);await screenshot('mobile-subway-picked');
 assert.ok(await evaluate('document.documentElement.scrollHeight<=window.innerHeight+2'),'mobile map mode fits one screen');
 await evaluate("document.querySelector('[data-sheet-toggle]').click()");await pause(200);await screenshot('mobile-subway-sheet-closed');
 await evaluate("document.querySelector('[data-sheet-toggle]').click()");
 await evaluate("document.querySelector('[data-m-mode=search]').click()");await pause(200);
 assert.equal(await evaluate('getComputedStyle(document.querySelector(\"#subway-map-wrap\")).display'),'none');await screenshot('mobile-subway-search');
 await evaluate("document.querySelector('[data-m-mode=map]').click()");
 // 경유를 켜면 지도에서 누르는 순서가 출발 → 경유 → 도착
 await evaluate("document.querySelector('[data-reset]').click()");await evaluate("document.querySelector('[data-add-via]').click()");await pause(500);
 assert.equal(await evaluate('document.querySelector(".pick-via").hidden'),false);
 const three=await evaluate(`(()=>{const out=[];for(const g of document.querySelectorAll('.map-station.transfer')){const r=g.querySelector('circle:not(.hit)').getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const hit=document.elementFromPoint(x,y);if(hit&&hit.closest('.map-station')===g&&!out.some(o=>Math.hypot(o.x-x,o.y-y)<40))out.push({name:g.dataset.station,x,y});if(out.length===3)break;}return out;})()`);
 assert.equal(three.length,3,'three tappable stations');
 for(const p of three){await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await pause(200);}
 await waitFor(()=>evaluate(`['from','via','to'].map(r=>document.querySelector('#subway-form [name='+r+']').value).join('|')===${JSON.stringify(three.map(p=>p.name).join('|'))}`));
 await evaluate("document.querySelector('[data-sheet-toggle]').click()");await pause(200);await screenshot('mobile-subway-via');
 await evaluate(`document.querySelector('#subway-nav [data-subway-view="live"]').click()`);await waitFor(()=>evaluate('!!document.querySelector(".live-strip, .subway-live-empty, #live-body .error")'));
 assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'horizontal overflow in live tab');
 if(await evaluate('!!document.querySelector(".live-train")')){await evaluate(`document.querySelector('.live-train').click()`);await waitFor(()=>evaluate('!!document.querySelector(".live-detail dl")'));}
 await screenshot('mobile-subway-train');
 if(await evaluate("!!document.querySelector('.live-stop[data-stop]')")){await evaluate("document.querySelector('.live-stop[data-stop]').click()");await waitFor(()=>evaluate('!!document.querySelector(".live-detail .detail-block")'));await pause(1500);await screenshot('mobile-subway-station');  await evaluate("document.querySelector('[data-detail-close]').click()");await screenshot('mobile-subway-live');}
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".live-lines")).display'),'none','mobile hides line chips');await evaluate("document.querySelector('.line-fab').click()");assert.equal(await evaluate('document.querySelector("#line-sheet").hidden'),false);assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".line-fab")).backgroundColor'),'rgb(0, 0, 0)','open line button stays light');await screenshot('mobile-subway-fab');await evaluate("document.querySelector('#line-sheet [data-live-line=\"2\"]').click()");await waitFor(()=>evaluate('document.querySelector(".line-fab b").textContent==="2"'));await waitFor(()=>evaluate('!!document.querySelector(".live-strip, .subway-live-empty")'));
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await pause(300);await screenshot('desktop-subway-live');
 await evaluate(`document.querySelector('#subway-nav [data-subway-view="route"]').click()`);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(200);
 assert.equal(await evaluate('getComputedStyle(document.querySelector(\"#menu-toggle\")).display'),'grid','hamburger on mobile');
 await evaluate("document.querySelector('#menu-toggle').click()");assert.equal(await evaluate('document.querySelector(\"#mobile-menu\").hidden'),false);await pause(300);
 assert.match(await evaluate('document.querySelector(\"#menu-nickname\").textContent'),/브라우저테스트/);await screenshot('mobile-menu');
 await evaluate("document.querySelector('[data-menu-app=cloth]').click()");assert.equal(await evaluate('document.querySelector(\"#mobile-menu\").hidden'),true);assert.equal(await evaluate('document.querySelector(\"#app\").hidden'),false);
 await evaluate("document.querySelector('.brand').click()");await waitFor(()=>evaluate('document.querySelectorAll(\".brief-card\").length===3'));await waitFor(()=>evaluate('!/찾고 있어요/.test(document.querySelector(\"#brief-plan\")?.textContent||\"x\")'));await pause(300);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(300);await evaluate('window.scrollTo(0,document.querySelector(".home-section").offsetTop-70)');await screenshot('mobile-home-brief');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await pause(300);await evaluate('window.scrollTo(0,0)');await screenshot('desktop-home-brief');
 const chipStyle=await evaluate('(()=>{const c=document.querySelector(".drawer-recent .chip");if(!c)return null;const st=getComputedStyle(c);return st.backgroundColor+"|"+st.color+"|"+c.textContent.trim();})()');console.log('home chip',chipStyle);assert.ok(chipStyle&&!chipStyle.startsWith('rgb(17, 17, 17)'),'home route chip is light');await evaluate('document.querySelector(".drawer-recent").scrollIntoView({block:"center",behavior:"instant"})');await screenshot('desktop-home-chips');
 assert.deepEqual(errors,[]);
 console.log('Browser PASS: login, reset/clear recommendation, settings, custom layering, variants, daily update without duplicates, edit preload, deletion, style preferences, main tabs, 3-hour forecast, day-specific drafts; responsive widths 390 / 768 / 1440. Screenshots in .qa/');
}finally{if(ws?.readyState===1)ws.close();browser.kill();local.kill();}
