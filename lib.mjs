export const clothes = [
 {id:'tee',name:'반팔 티셔츠',score:1,slot:'base'}, {id:'long',name:'긴팔 티셔츠',score:2,slot:'base'},
 {id:'shirt',name:'셔츠',score:2,slot:'base'}, {id:'knit',name:'니트',score:3,slot:'middle'},
 {id:'cardigan',name:'가디건',score:2,slot:'middle'}, {id:'wind',name:'바람막이',score:1,slot:'outer'},
 {id:'light',name:'경량패딩',score:4,slot:'outer'}, {id:'padded',name:'겨울 패딩',score:6,slot:'outer'}
];
export const cities = {seoul:{name:'서울',lat:37.57,lon:126.98},busan:{name:'부산',lat:35.18,lon:129.08},incheon:{name:'인천',lat:37.46,lon:126.71},daegu:{name:'대구',lat:35.87,lon:128.60},daejeon:{name:'대전',lat:36.35,lon:127.38},gwangju:{name:'광주',lat:35.16,lon:126.85},jeju:{name:'제주',lat:33.50,lon:126.53}};
export function normalizeNickname(value){const s=String(value??'').normalize('NFKC').trim();if(s.length<1||s.length>24||/[\x00-\x1f]/.test(s))throw Error('닉네임은 1~24자로 입력해 주세요.');return s;}
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function scoreFor(temp){return clamp(1+(26-temp)*0.3,1,12);}
export function correction(profile,records){let v=clamp((profile.cold-profile.heat)*0.5,-2,2);for(const r of [...records].filter(r=>r.context==='outdoor').sort((a,b)=>a.date.localeCompare(b.date)||a.updatedAt.localeCompare(b.updatedAt))){v=clamp(v*.8+(r.score-r.rating-scoreFor(r.weather.feels))*.2,-4,4);}return Math.round(v*10)/10;}
export function recommend(temp,offset,activity='normal',wind=0){const target=clamp(scoreFor(temp)+offset+(activity==='active'?-1:activity==='still'?1:0),1,12);let best=null;for(const base of clothes.filter(c=>c.slot==='base'))for(const mid of [null,...clothes.filter(c=>c.slot==='middle')])for(const outer of [null,...clothes.filter(c=>c.slot==='outer')]){const items=[base,mid,outer].filter(Boolean);const score=items.reduce((n,c)=>n+c.score,0);const cost=Math.abs(score-target)+(wind>=20&&!outer?.id?.match(/wind|light|padded/)?1:0)+items.length*.03;if(!best||cost<best.cost)best={items,score,target:Math.round(target*10)/10,cost};}return best;}
