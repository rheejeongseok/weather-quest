import {buildComfortModel} from './comfort-model.mjs';
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
export const SCORE_VERSION=2;
// 공개 의복 단열 표의 상대 순서를 참고한 앱 추정치. 1점 ≈ 참고 단열량 0.1 clo.
// 이 값은 개별 제품 실측치나 전신 착의 단열량이 아닙니다.
const variants={
 thermal:[['thin','얇은 기능성·보온 이너',1.2,'폴리에스터·레이온 등 / 얇음'],['warm','기모·두꺼운 보온 이너',1.8,'기모 안쪽 / 두꺼움']],
 tee:[['standard','일반 반팔',1,'면·혼방 / 보통'],['thin','얇은 기능성 반팔',.7,'얇은 합성섬유 / 얇음']],
 long:[['standard','일반 긴팔',1.5,'면·혼방 / 보통'],['warm','기모 긴팔',2.2,'기모 안쪽 / 두꺼움']],
 shirt:[['thin','얇은 여름 셔츠',1.5,'린넨·얇은 면 / 얇음'],['standard','일반 셔츠',2.5,'면·혼방 직물 / 보통'],['flannel','플란넬·기모 셔츠',3,'기모 직물 / 두꺼움']],
 sweat:[['standard','쭈리 맨투맨·후드티',2.8,'면·혼방 / 기모 없음'],['fleece','기모 맨투맨·후드티',3.5,'기모 안쪽 / 두꺼움']],
 knit:[['thin','얇은 니트',2,'면·울·아크릴 혼방 / 얇음'],['standard','보통 니트',2.8,'울·혼방 니트 / 보통'],['thick','두꺼운 니트',3.5,'두툼한 편직 / 두꺼움']],
 cardigan:[['standard','얇은 가디건',2,'면·울·아크릴 혼방 / 얇음'],['thick','두꺼운 가디건',3.5,'두툼한 편직 / 두꺼움']],
 ziphood:[['standard','일반 후드집업',2.8,'면·혼방 / 보통'],['fleece','기모 후드집업',3.5,'기모 안쪽 / 두꺼움']],
 fleece:[['thin','얇은 플리스',2.5,'폴리에스터 파일 / 얇음'],['standard','보통 플리스',3.2,'폴리에스터 파일 / 보통'],['thick','두꺼운 플리스',4,'두꺼운 파일 / 두꺼움']],
 wind:[['standard','홑겹 바람막이',.5,'나일론·폴리에스터 / 충전재 없음'],['lined','안감 있는 바람막이',1.5,'겉감 + 얇은 안감 / 충전재 없음']],
 jacket:[['standard','청자켓·일반 재킷',2.5,'데님·직물 / 보통'],['lined','안감 있는 두꺼운 재킷',3.5,'두꺼운 직물 + 안감']],
 trench:[['standard','트렌치·얇은 코트',3,'직물 + 얇은 안감 / 충전재 없음']],
 coat:[['standard','보통 울·겨울 코트',4.5,'울·혼방 직물 / 보통'],['thick','두꺼운 울·겨울 코트',6,'두꺼운 직물 + 안감']],
 light:[['standard','얇은 퀼팅·경량패딩',3.5,'다운·합성 충전재 / 낮은 부피'],['warm','도톰한 경량패딩',4.5,'다운·합성 충전재 / 중간 부피']],
 padded:[['standard','겨울 패딩',6,'다운·합성 충전재 / 높은 부피'],['heavy','두꺼운 한겨울 패딩',7.5,'다운·합성 충전재 / 매우 높은 부피']]
};
clothes.splice(clothes.findIndex(c=>c.id==='wind'),0,{id:'fleece',name:'플리스',slot:'middle',roles:['middle'],icon:'🧥'});
for(const c of clothes){c.variants=variants[c.id].map(([id,name,score,material])=>({id,name,score,material}));const v=c.variants.find(v=>v.id==='standard')||c.variants[0];c.defaultVariant=v.id;c.score=v.score;}
export function outfit(ids,itemOptions={}){
 const items=selectedClothes(ids).map(c=>{const variantId=itemOptions[c.id]??c.defaultVariant;const v=c.variants.find(v=>v.id===variantId);if(!v)throw Error('옷의 소재·두께 선택을 확인해 주세요.');return {...c,variantId:v.id,variantName:v.name,material:v.material,score:v.score};});
 return {items,score:Math.round(items.reduce((n,c)=>n+c.score,0)*10)/10};
}
export function compareOutfit(ids,itemOptions,target,wind=0){
 const result=outfit(ids,itemOptions);const range=typeof target==='number'?{lower:target-.6,upper:target+.6}:target;
 const diff=Math.round((result.score<range.lower?result.score-range.lower:result.score>range.upper?result.score-range.upper:0)*10)/10;
 return {...result,diff,inRange:diff===0,message:diff===0?'예상 보온 범위와 비슷한 조합이에요.':diff<0?`예상 범위보다 ${Math.abs(diff)}점 가벼워요. 중간옷이나 겉옷을 더해 보세요.`:`예상 범위보다 ${diff}점 따뜻해요. 활동 중에는 더울 수 있어요.`,windWarning:wind>=20&&!result.items.some(c=>c.windproof)?'바람이 강해요. 보온 점수와 별개로 바람을 막는 겉옷을 고려해 주세요.':''};
}
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

export const outfitStyles={simple:'간단하게 · 적은 겹',balanced:'균형 있게 · 기본 조합',layered:'여러 겹으로 · 레이어드'};
export const activityAdjustment=activity=>activity==='active'?-1:activity==='still'?1:0;
export const preferenceChoices={exposure:{short:'10분 이내 · 잠깐 외출',medium:'10~30분 · 보통 외출',long:'30분 이상 · 오래 야외에 있어요'},commute:{mixed:'상황마다 달라요',walk:'도보·자전거 위주',transit:'대중교통 위주',car:'자동차 위주'},windSensitivity:{low:'바람에도 비교적 괜찮아요',normal:'보통이에요',high:'바람이 불면 특히 추워요'},sweat:{low:'땀이 적은 편이에요',normal:'보통이에요',high:'조금만 움직여도 땀이 나요'}};
export function preferenceSettings(input={}){return Object.fromEntries(Object.entries(preferenceChoices).map(([key,choices])=>[key,Object.hasOwn(choices,input[key])?input[key]:{exposure:'medium',commute:'mixed',windSensitivity:'normal',sweat:'normal'}[key]]));}
export function exposureAdjustment(exposure,temp){const factor=clamp((20-temp)/15,0,1);const adjustment=exposure==='short' ? -.4 : exposure==='long' ? .4 : 0;return Math.round(adjustment*factor*10)/10;}
export function sensitivityPrior(profile,temp=null){
 const cold=(Number(profile.cold)||0)*.5,heat=(Number(profile.heat)||0)*.5;
 if(!Number.isFinite(temp))return clamp(cold-heat,-2,2);
 return clamp(cold*clamp((22-temp)/12,0,1)-heat*clamp((temp-14)/12,0,1),-2,2);
}
export function comfortNotes(profile,weather){const notes=[];if(profile.commute==='transit')notes.push('대중교통과 실내에서는 더울 수 있어요. 벗기 쉬운 겉옷을 활용해 보세요.');if(profile.commute==='car')notes.push('자동차 이동 위주라도 실제 야외에 머무는 시간에 맞춰 준비해 주세요.');if(profile.sweat==='high')notes.push('땀이 나기 쉬운 편이에요. 통기성과 벗어서 조절하기 쉬운 조합을 고려해 주세요.');if(profile.windSensitivity==='high'&&weather.wind>=12)notes.push('바람에 민감한 편이고 바람도 있어요. 방풍 겉옷을 우선 고려했어요.');return notes;}
export function warmthTarget(profile,records,temp){return buildComfortModel(profile,records,temp,{scoreFor,activityAdjustment,exposureAdjustment,sensitivityPrior,outfit,scoreVersion:SCORE_VERSION});}
export function correction(profile,records,temp=null){const temperatures=records.filter(r=>!r.deleted&&r.context==='outdoor'&&Number.isFinite(r.weather?.feels)).map(r=>r.weather.feels);const reference=Number.isFinite(temp)?temp:temperatures.length?temperatures.reduce((a,b)=>a+b,0)/temperatures.length:20;return warmthTarget(profile,records,reference).offset;}

let candidates;
function outfitCandidates(){
 if(candidates)return candidates;candidates=[];
 const forRole=role=>clothes.filter(c=>c.roles.includes(role)).flatMap(c=>c.variants.map(v=>({...c,score:v.score,variantId:v.id,variantName:v.name,material:v.material})));
 for(const inner of [null,...forRole('inner')])for(const base of forRole('base'))for(const middle of [null,...forRole('middle')])for(const outer of [null,...forRole('outer')]){
  const items=[inner,base,middle,outer].filter(Boolean);if(new Set(items.map(c=>c.id)).size!==items.length)continue;
  candidates.push({items,base,inner,outer,score:Math.round(items.reduce((n,c)=>n+c.score,0)*10)/10});
 }return candidates;
}
export function recommend(temp,offset,activity='normal',wind=0,style='balanced',options={}){
 const model=options.model;const target=model?.target??clamp(scoreFor(temp)+offset+activityAdjustment(activity),1,12);const range=model?.range??{lower:target-.6,upper:target+.6};
 const preferred=style==='simple'?(target<2?1:2):style==='layered'?(target>=5?3:target>=2?2:1):(target>=6?3:target>=2?2:1);
 let best=null;
 const known=[];
 for(const r of model?.comfortable||[]){try{const result=outfit(r.items,r.itemOptions);const items=result.items;known.push({items,score:result.score,inner:items.find(c=>c.slot==='inner'),base:items.find(c=>c.roles.includes('base')),outer:[...items].reverse().find(c=>c.roles.includes('outer')),known:true});}catch{/* Old or unsupported clothing entries are not recommendation candidates. */}}
 for(const c of [...outfitCandidates(),...known]){
  const error=Math.abs(c.score-target);const distance=Math.max(range.lower-c.score,0,c.score-range.upper);
  const shape=Math.abs(c.items.length-preferred)*(style==='balanced' ? .25 : .55);
  const windThreshold=options.windSensitivity==='high'?12:options.windSensitivity==='low'?25:20;
  const windPenalty=wind>=windThreshold&&!c.outer?.windproof ? 2 : 0;
  const innerPenalty=style==='simple'&&c.inner ? .6 : 0;
  const shellPenalty=c.outer&&!c.outer.windproof&&temp<5 ? .08 : 0;
  const familiarBonus=c.known&&distance===0 ? .18 : 0;
  const cost=distance*5+error*.12+shape+windPenalty+innerPenalty+shellPenalty-familiarBonus;
  if(!best||cost<best.cost)best={items:c.items,score:c.score,target:Math.round(target*10)/10,cost,style,range,fromRecord:!!c.known};
 }return best;
}
