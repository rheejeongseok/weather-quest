import {buildComfortModel,recordFeels} from './comfort-model.mjs';
export {recordFeels,recommendationStats,comparabilityWeight} from './comfort-model.mjs';
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
 {id:'blazer',name:'블레이저·정장 재킷',score:3.5,slot:'outer',roles:['outer'],icon:'🧥'},
 {id:'leather',name:'가죽 재킷·무스탕',score:3,slot:'outer',roles:['outer'],windproof:true,icon:'🧥'},
 {id:'field',name:'야상·필드 재킷',score:2.5,slot:'outer',roles:['outer'],icon:'🧥'},
 {id:'trench',name:'트렌치·얇은 코트',score:2,slot:'outer',roles:['outer'],icon:'🧥'},
 {id:'coat',name:'울·겨울 코트',score:4,slot:'outer',roles:['outer'],icon:'🧥'},
 {id:'light',name:'경량패딩',score:4,slot:'outer',roles:['middle','outer'],windproof:true,icon:'🧥'},
 {id:'padded',name:'겨울 패딩',score:6,slot:'outer',roles:['outer'],windproof:true,icon:'🧥'},
 {id:'longpad',name:'롱패딩',score:8,slot:'outer',roles:['outer'],windproof:true,icon:'🧥'}
];
export const clothingGroups={inner:'보온 이너',base:'티셔츠·셔츠',middle:'니트·걸치는 옷',outer:'재킷·코트·패딩'};
export const SCORE_VERSION=3;
// 공개 의복 단열 표의 상대 순서를 참고한 앱 추정치. 1점 ≈ 참고 단열량 0.1 clo.
// v3: 공개 표와 비교해 일관되게 낮았던 긴팔·기모 긴팔·맨투맨·트렌치를 조정(docs/WARMTH.md).
// 이 값은 개별 제품 실측치나 전신 착의 단열량이 아닙니다.
const variants={
 thermal:[['thin','얇은 기능성·보온 이너',1.2,'폴리에스터·레이온 등 / 얇음'],['warm','기모·두꺼운 보온 이너',1.8,'기모 안쪽 / 두꺼움']],
 tee:[['standard','일반 반팔',1,'면·혼방 / 보통'],['thin','얇은 기능성 반팔',.7,'얇은 합성섬유 / 얇음']],
 long:[['standard','일반 긴팔',2,'면·혼방 / 보통'],['warm','기모 긴팔',3,'기모 안쪽 / 두꺼움']],
 shirt:[['thin','얇은 여름 셔츠',1.5,'린넨·얇은 면 / 얇음'],['standard','일반 셔츠',2.5,'면·혼방 직물 / 보통'],['flannel','플란넬·기모 셔츠',3,'기모 직물 / 두꺼움']],
 sweat:[['standard','쭈리 맨투맨·후드티',3.2,'면·혼방 / 기모 없음'],['fleece','기모 맨투맨·후드티',3.5,'기모 안쪽 / 두꺼움']],
 knit:[['thin','얇은 니트',2,'면·울·아크릴 혼방 / 얇음'],['standard','보통 니트',2.8,'울·혼방 니트 / 보통'],['turtle','터틀넥 니트',3.1,'울·혼방 니트 / 목까지 덮음'],['thick','두꺼운 니트',3.5,'두툼한 편직 / 두꺼움']],
 cardigan:[['standard','얇은 가디건',2,'면·울·아크릴 혼방 / 얇음'],['thick','두꺼운 가디건',3.5,'두툼한 편직 / 두꺼움']],
 ziphood:[['standard','일반 후드집업',2.8,'면·혼방 / 보통'],['fleece','기모 후드집업',3.5,'기모 안쪽 / 두꺼움']],
 fleece:[['thin','얇은 플리스',2.5,'폴리에스터 파일 / 얇음'],['standard','보통 플리스',3.2,'폴리에스터 파일 / 보통'],['thick','두꺼운 플리스',4,'두꺼운 파일 / 두꺼움']],
 wind:[['standard','홑겹 바람막이',.5,'나일론·폴리에스터 / 충전재 없음'],['lined','안감 있는 바람막이',1.5,'겉감 + 얇은 안감 / 충전재 없음']],
 jacket:[['standard','청자켓·일반 재킷',2.5,'데님·직물 / 보통'],['lined','안감 있는 두꺼운 재킷',3.5,'두꺼운 직물 + 안감']],
 trench:[['standard','트렌치·얇은 코트',3.6,'직물 + 얇은 안감 / 충전재 없음']],
 coat:[['standard','보통 울·겨울 코트',4.5,'울·혼방 직물 / 보통'],['thick','두꺼운 울·겨울 코트',6,'두꺼운 직물 + 안감']],
 light:[['standard','얇은 퀼팅·경량패딩',3.5,'다운·합성 충전재 / 낮은 부피'],['warm','도톰한 경량패딩',4.5,'다운·합성 충전재 / 중간 부피']],
 vest:[['knit','니트 조끼',1.2,'니트 / 소매 없음'],['fleece','플리스 조끼',1.7,'폴리에스터 파일 / 소매 없음'],['padded','패딩 조끼',2.5,'다운·합성 충전재 / 소매 없음']],
 blazer:[['thin','얇은 여름 블레이저',2.5,'린넨·얇은 직물 / 홑겹'],['standard','블레이저·정장 재킷',3.5,'직물 + 안감 / 보통']],
 leather:[['standard','가죽 재킷',3,'가죽·합성피혁 / 안감 / 바람 차단'],['shearling','무스탕',5.5,'양털·보아 안감 / 두꺼움 / 바람 차단']],
 field:[['standard','홑겹 야상',2.5,'면·혼방 능직 / 안감 없음'],['lined','내피 있는 야상',4.5,'겉감 + 퀼팅·보아 내피']],
 longpad:[['standard','롱패딩',8,'다운·합성 충전재 / 무릎 아래 길이'],['heavy','두꺼운 한겨울 롱패딩',9.5,'다운·합성 충전재 / 매우 높은 부피 / 무릎 아래']],
 padded:[['standard','겨울 패딩',6,'다운·합성 충전재 / 높은 부피'],['heavy','두꺼운 한겨울 패딩',7.5,'다운·합성 충전재 / 매우 높은 부피']]
};
clothes.splice(clothes.findIndex(c=>c.id==='wind'),0,{id:'fleece',name:'플리스',slot:'middle',roles:['middle'],icon:'🧥'},{id:'vest',name:'조끼',slot:'middle',roles:['middle','outer'],icon:'🦺'});
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

export const outfitStyles={simple:'적게 · 1~2겹',balanced:'보통 · 상의와 겉옷',layered:'여러 겹 · 중간옷까지'};
export const activityAdjustment=activity=>activity==='active'?-1:activity==='still'?1:0;
export const preferenceChoices={
 exposure:{short:'10분 이내 · 잠깐 외출',medium:'10~30분 · 보통 외출',long:'30분 이상 · 오래 야외에 있어요'},
 commute:{mixed:'상황마다 달라요',walk:'도보·자전거 위주',transit:'대중교통 위주',car:'자동차 위주'},
 windSensitivity:{veryLow:'바람이 불어도 거의 신경 쓰이지 않아요',low:'바람에 비교적 괜찮아요',normal:'보통이에요',high:'바람이 불면 추워요',veryHigh:'약한 바람에도 많이 추워요'},
 sweat:{low:'땀이 거의 나지 않아요',normal:'보통이에요',high:'걸으면 땀이 나는 편이에요',veryHigh:'조금만 움직여도 땀이 많이 나요'},
 coldSpot:{none:'특별히 없어요',hands:'손·발이 먼저 차가워져요',neck:'목·어깨가 먼저 시려요',body:'몸통이 먼저 추워요'},
 swingSensitivity:{low:'일교차는 크게 신경 쓰지 않아요',normal:'보통이에요',high:'아침저녁 기온 차이에 민감해요'},
 inner:{any:'상관없어요',avoid:'이너는 잘 입지 않아요',like:'추운 날엔 이너를 챙겨 입어요'},
 outerType:{any:'상관없어요',light:'가벼운 겉옷 · 가디건·바람막이·재킷',coat:'코트 · 트렌치·울 코트',padding:'패딩 · 경량·겨울 패딩'},
 topType:{any:'상관없어요',tee:'티셔츠 · 반팔·긴팔',shirt:'셔츠',knit:'니트',casual:'맨투맨·후드'}
};
const preferenceDefaults={exposure:'medium',commute:'mixed',windSensitivity:'normal',sweat:'normal',coldSpot:'none',swingSensitivity:'normal',inner:'any',outerType:'any',topType:'any'};
// 추위·더위 체감 5단계(표시 순서를 지키기 위해 배열). 기존 0~2 저장값은 같은 의미를 유지합니다(0 비슷, 1 조금, 2 많이).
export const sensitivityChoices={
 cold:[[-2,'주변보다 훨씬 늦게 입어요'],[-1,'조금 늦게 입는 편이에요'],[0,'주변과 비슷해요'],[1,'조금 일찍 입는 편이에요'],[2,'훨씬 일찍 입어요']],
 heat:[[-2,'더위를 거의 타지 않아요'],[-1,'덜 타는 편이에요'],[0,'보통이에요'],[1,'쉽게 더워지는 편이에요'],[2,'매우 쉽게 더워져요']]
};
export const outerTypeItems={light:['cardigan','ziphood','wind','jacket','blazer','leather','field'],coat:['trench','coat'],padding:['light','padded','longpad']};
export const topTypeItems={tee:['tee','long'],shirt:['shirt'],knit:['knit'],casual:['sweat','ziphood']};
export const windThresholds={veryLow:30,low:25,normal:20,high:12,veryHigh:8};
// 착용 상황 선택지. 점수로 환산하지 않고 비교 가능성(가중치)과 이후 분석에만 사용합니다.
export const recordChoices={
 swing:{steady:'내내 비슷했어요',colderLater:'밖에서 점점 추워졌어요',warmerLater:'밖에서 점점 더워졌어요'},
 bottom:{light:'얇은 하의',normal:'보통 하의',warm:'기모·두꺼운 하의'},
 accessories:{scarf:'목도리·넥워머',gloves:'장갑',hat:'모자'},
 layerChange:{none:'그대로 입었어요',removed:'밖에서 더워서 벗었어요',added:'밖에서 추워서 더 입었어요'}
};
export function preferenceSettings(input={}){return Object.fromEntries(Object.entries(preferenceChoices).map(([key,choices])=>[key,Object.hasOwn(choices,input[key])?input[key]:preferenceDefaults[key]]));}
export function exposureAdjustment(exposure,temp){const factor=clamp((20-temp)/15,0,1);const adjustment=exposure==='short' ? -.4 : exposure==='long' ? .4 : 0;return Math.round(adjustment*factor*10)/10;}
// 설정의 추위·더위 민감도. 한 단계 1점(≈0.1 clo), 최대 ±2점씩. 추위는 추운 날, 더위는 더운 날에 전부 반영하고
// 반대 계절에도 절반은 반영합니다(더위를 타는 사람은 겨울에도 덜 껴입는 경향). 기록이 쌓이면 기록이 우선합니다.
export function sensitivityPrior(profile,temp=null){
 const cold=clamp(Number(profile.cold)||0,-2,2),heat=clamp(Number(profile.heat)||0,-2,2);
 if(!Number.isFinite(temp))return clamp(cold-heat,-4,4);
 const coldFactor=.5+.5*clamp((20-temp)/12,0,1),heatFactor=.5+.5*clamp((temp-8)/12,0,1);
 return clamp(cold*coldFactor-heat*heatFactor,-4,4);
}
export function comfortNotes(profile,weather){const notes=[];const feels=Number.isFinite(weather.feels)?weather.feels:null;
 if(profile.commute==='transit')notes.push('대중교통과 실내에서는 더울 수 있어요. 벗기 쉬운 겉옷을 활용해 보세요.');
 if(profile.commute==='car')notes.push('자동차 이동 위주라도 실제 야외에 머무는 시간에 맞춰 준비해 주세요.');
 if(profile.sweat==='high'||profile.sweat==='veryHigh')notes.push('땀이 나기 쉬운 편이에요. 통기성과 벗어서 조절하기 쉬운 조합을 고려해 주세요.');
 if((profile.windSensitivity==='high'||profile.windSensitivity==='veryHigh')&&weather.wind>=windThresholds[profile.windSensitivity])notes.push('바람에 민감한 편이고 바람도 있어요. 방풍 겉옷을 우선 고려했어요.');
 if(feels!==null&&profile.coldSpot==='hands'&&feels<=5)notes.push('손·발이 먼저 차가워지는 편이에요. 장갑이나 두꺼운 양말을 챙겨 보세요.');
 if(feels!==null&&profile.coldSpot==='neck'&&feels<=8)notes.push('목·어깨가 먼저 시린 편이에요. 목도리나 넥워머를 챙겨 보세요.');
 if(feels!==null&&profile.coldSpot==='body'&&feels<=10)notes.push('몸통이 먼저 추운 편이에요. 같은 보온이라면 이너를 더한 조합을 우선했어요.');
 if(profile.swingSensitivity==='high'&&Number.isFinite(weather.swing)&&weather.swing>=8)notes.push(`오늘은 일교차가 ${Math.round(weather.swing)}℃예요. 벗고 입기 쉬운 겉옷을 챙기세요.`);
 return notes;}
export function warmthTarget(profile,records,temp){return buildComfortModel(profile,records,temp,{scoreFor,activityAdjustment,exposureAdjustment,sensitivityPrior,outfit,scoreVersion:SCORE_VERSION});}
export function correction(profile,records,temp=null){const temperatures=records.filter(r=>!r.deleted&&r.context==='outdoor'&&Number.isFinite(recordFeels(r))).map(recordFeels);const reference=Number.isFinite(temp)?temp:temperatures.length?temperatures.reduce((a,b)=>a+b,0)/temperatures.length:20;return warmthTarget(profile,records,reference).offset;}

let candidates;
function outfitCandidates(){
 if(candidates)return candidates;candidates=[];
 const forRole=role=>clothes.filter(c=>c.roles.includes(role)).flatMap(c=>c.variants.map(v=>({...c,score:v.score,variantId:v.id,variantName:v.name,material:v.material})));
 for(const inner of [null,...forRole('inner')])for(const base of forRole('base'))for(const middle of [null,...forRole('middle')])for(const outer of [null,...forRole('outer')]){
  const items=[inner,base,middle,outer].filter(Boolean);if(new Set(items.map(c=>c.id)).size!==items.length)continue;
  candidates.push({items,base,inner,outer,score:Math.round(items.reduce((n,c)=>n+c.score,0)*10)/10});
 }return candidates;
}
// 옷별로 흔히 입는 체감온도 범위(℃). 같은 보온 점수의 조합 중 자연스러운 것을 고르기 위한 앱 가정이며
// 필요한 보온량에는 영향을 주지 않습니다. 키는 '옷' 또는 '옷:선택지'.
export const seasonBands={
 thermal:[-30,10],tee:[12,40],long:[0,24],'long:warm':[-15,14],'shirt:thin':[15,35],shirt:[5,26],'shirt:flannel':[-10,16],
 sweat:[-5,18],'sweat:fleece':[-15,12],'knit:thin':[6,20],knit:[-10,15],'knit:turtle':[-15,12],'knit:thick':[-20,10],
 cardigan:[8,22],'cardigan:thick':[0,16],ziphood:[5,20],'ziphood:fleece':[-3,15],'fleece:thin':[5,18],fleece:[-5,14],'fleece:thick':[-15,10],
 'vest:knit':[8,20],'vest:fleece':[0,15],'vest:padded':[-5,12],wind:[10,25],'wind:lined':[3,18],jacket:[8,22],'jacket:lined':[2,16],
 'blazer:thin':[15,30],blazer:[8,22],leather:[3,18],'leather:shearling':[-20,5],field:[8,20],'field:lined':[-3,12],trench:[7,20],
 coat:[-5,12],'coat:thick':[-20,5],light:[3,15],'light:warm':[-3,10],padded:[-15,5],'padded:heavy':[-30,-2],longpad:[-30,0],'longpad:heavy':[-30,-6]
};
function seasonPenalty(items,temp){let total=0;for(const c of items){const band=seasonBands[c.id+':'+c.variantId]||seasonBands[c.id];if(!band)continue;const d=temp<band[0]?band[0]-temp:temp>band[1]?temp-band[1]:0;total+=Math.min(d,10)*.06;}return total;}
export function recommend(temp,offset,activity='normal',wind=0,style='balanced',options={}){
 const model=options.model;const target=model?.target??clamp(scoreFor(temp)+offset+activityAdjustment(activity),1,12);const range=model?.range??{lower:target-.6,upper:target+.6};
 const preferred=style==='simple'?(target<2?1:2):style==='layered'?(target>=5?3:target>=2?2:1):(target>=6?3:target>=2?2:1);
 let best=null;
 const known=[];
 for(const r of model?.comfortable||[]){try{const result=outfit(r.items,r.itemOptions);const items=result.items;known.push({items,score:result.score,inner:items.find(c=>c.slot==='inner'),base:items.find(c=>c.roles.includes('base')),outer:[...items].reverse().find(c=>c.roles.includes('outer')),known:true});}catch{/* Old or unsupported clothing entries are not recommendation candidates. */}}
 const avoid=new Set(Array.isArray(options.avoid)?options.avoid:[]);
 const pool=[...outfitCandidates(),...known];const allowed=pool.filter(c=>!c.items.some(i=>avoid.has(i.id)));
 for(const c of allowed.length?allowed:pool){
  const error=Math.abs(c.score-target);const distance=Math.max(range.lower-c.score,0,c.score-range.upper);
  const shape=Math.abs(c.items.length-preferred)*(style==='balanced' ? .25 : .55);
  const windThreshold=windThresholds[options.windSensitivity]??20;
  const windPenalty=wind>=windThreshold&&!c.outer?.windproof ? 2 : 0;
  const innerPenalty=(style==='simple'&&c.inner ? .6 : 0)+(options.inner==='avoid'&&c.inner ? .6 : 0)+(options.inner==='like'&&!c.inner&&target>=5 ? .3 : 0)+(options.coldSpot==='body'&&!c.inner&&target>=6 ? .1 : 0);
  const outerPenalty=options.outerType&&options.outerType!=='any'&&c.outer ? (outerTypeItems[options.outerType]?.includes(c.outer.id) ? -.2 : .25) : 0;
  const topPenalty=options.topType&&options.topType!=='any' ? (c.items.some(i=>topTypeItems[options.topType]?.includes(i.id)) ? -.2 : .2) : 0;
  const shellPenalty=c.outer&&!c.outer.windproof&&temp<5 ? .08 : 0;
  const familiarBonus=c.known&&distance===0 ? .18 : 0;
  // 실제로 입고 적당했던 조합은 일반적인 계절 가정보다 개인 기록을 우선합니다.
  const season=c.known?0:seasonPenalty(c.items,temp);
  const cost=distance*5+error*.12+shape+windPenalty+innerPenalty+outerPenalty+topPenalty+shellPenalty+season-familiarBonus;
  if(!best||cost<best.cost)best={items:c.items,score:c.score,target:Math.round(target*10)/10,cost,style,range,fromRecord:!!c.known};
 }return best;
}
