export const clothes = [
 {id:'thermal',name:'발열·보온 이너',score:1,slot:'inner',roles:['inner'],icon:'👕'},
 {id:'tee',name:'반팔 티셔츠',score:1,slot:'base',roles:['base'],icon:'👕'},
 {id:'long',name:'긴팔 티셔츠',score:2,slot:'base',roles:['base'],icon:'👕'},
 {id:'shirt',name:'셔츠',score:2,slot:'base',roles:['base','middle'],icon:'👔'},
 {id:'sweat',name:'맨투맨·후드티',score:3,slot:'base',roles:['base','middle'],icon:'👕'},
 {id:'knit',name:'니트',score:3,slot:'middle',roles:['base','middle'],icon:'🧶'},
 {id:'cardigan',name:'가디건',score:2,slot:'middle',roles:['middle','outer'],icon:'🧶'},
 {id:'ziphood',name:'후드집업',score:3,slot:'middle',roles:['middle','outer'],icon:'🧥'},
 {id:'wind',name:'바람막이',score:1,slot:'outer',roles:['outer'],windproof:true,icon:'🧥'},
 {id:'jacket',name:'청자켓·일반 재킷',score:2,slot:'outer',roles:['outer'],icon:'🧥'},
 {id:'trench',name:'트렌치·얇은 코트',score:2,slot:'outer',roles:['outer'],icon:'🧥'},
 {id:'coat',name:'울·겨울 코트',score:4,slot:'outer',roles:['outer'],icon:'🧥'},
 {id:'light',name:'경량패딩',score:4,slot:'outer',roles:['middle','outer'],windproof:true,icon:'🧥'},
 {id:'padded',name:'겨울 패딩',score:6,slot:'outer',roles:['outer'],windproof:true,icon:'🧥'}
];
export const clothingGroups={inner:'보온 이너',base:'티셔츠·셔츠',middle:'니트·걸치는 옷',outer:'재킷·코트·패딩'};
// 실제 착용은 고정된 슬롯으로 제한하지 않습니다. 셔츠 두 장 등 동일 종류의 중복만 구분할 수 없습니다.
export function selectedClothes(ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>5)throw Error('실제로 입은 상의를 1~5벌 선택해 주세요.');
 const items=ids.map(id=>clothes.find(c=>c.id===id));
 if(items.some(c=>!c))throw Error('목록에 있는 옷을 선택해 주세요.');
 if(new Set(ids).size!==ids.length)throw Error('같은 옷 항목이 중복됐어요. 한 번씩 선택해 주세요.');
 return items;
}
export const cities = {seoul:{name:'서울',lat:37.57,lon:126.98},busan:{name:'부산',lat:35.18,lon:129.08},incheon:{name:'인천',lat:37.46,lon:126.71},daegu:{name:'대구',lat:35.87,lon:128.60},daejeon:{name:'대전',lat:36.35,lon:127.38},gwangju:{name:'광주',lat:35.16,lon:126.85},jeju:{name:'제주',lat:33.50,lon:126.53}};
export function normalizeNickname(value){const s=String(value??'').normalize('NFKC').trim();if(s.length<1||s.length>24||/[\x00-\x1f]/.test(s))throw Error('닉네임은 1~24자로 입력해 주세요.');return s;}
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function scoreFor(temp){return clamp(1+(26-temp)*0.3,1,12);}
export function correction(profile,records){let v=clamp((profile.cold-profile.heat)*0.5,-2,2);for(const r of [...records].filter(r=>r.context==='outdoor').sort((a,b)=>a.date.localeCompare(b.date)||a.updatedAt.localeCompare(b.updatedAt))){v=clamp(v*.8+(r.score-r.rating-scoreFor(r.weather.feels))*.2,-4,4);}return Math.round(v*10)/10;}
export function recommend(temp,offset,activity='normal',wind=0){
 const target=clamp(scoreFor(temp)+offset+(activity==='active'?-1:activity==='still'?1:0),1,12);let best=null;
 const forRole=role=>clothes.filter(c=>c.roles.includes(role));
 for(const inner of [null,...forRole('inner')])for(const base of forRole('base'))for(const mid of [null,...forRole('middle')])for(const outer of [null,...forRole('outer')]){
  const items=[inner,base,mid,outer].filter(Boolean);
  if(new Set(items.map(c=>c.id)).size!==items.length)continue;
  const score=items.reduce((n,c)=>n+c.score,0);
  const cost=Math.abs(score-target)+(wind>=20&&!outer?.windproof?1:0)+items.length*.03;
  if(!best||cost<best.cost)best={items,score,target:Math.round(target*10)/10,cost};
 }return best;
}
