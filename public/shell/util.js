// My Doc 공통 화면 도구: 글자 이스케이프, 한국 날짜, 숫자 표시, 알림, API 호출
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const day=(offset=0)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()+offset*86400000));
export const num=n=>Number(n).toFixed(1).replace(/\.0$/,'');
export function notify(text){const el=document.querySelector('#notice');el.textContent=text;el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.hidden=true,5500);}
export async function api(path,data){const r=await fetch(path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const text=await r.text();let b;try{b=JSON.parse(text);}catch{throw Error(`서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요. (${r.status})`);}if(!r.ok)throw Error(b.error||'서버 연결을 확인해 주세요.');return b;}
