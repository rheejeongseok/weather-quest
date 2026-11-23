// These intervals are comparison guides, not statistical confidence intervals.
// Clothing scores stay fixed; observations learn the user's comfortable range.

// 학습 기준 체감온도: 지난 날짜의 관측 재분석값 > 외출 시간대 예보 평균 > 기록 시각 예보.
export function recordFeels(r){
 if(Number.isFinite(r?.observed?.feels))return r.observed.feels;
 if(Number.isFinite(r?.weather?.window?.meanFeels))return r.weather.window.meanFeels;
 return r?.weather?.feels;
}
// 상의 점수만으로 비교하기 어려운 기록의 비중. 점수 보정이 아닌 초기 설계값입니다.
export function comparabilityWeight(r){
 let weight=1;const notes=[];
 if(r.swing==='colderLater'||r.swing==='warmerLater'){weight*=.5;notes.push('밖에 있는 동안 체감이 바뀌었어요');}
 if(r.layerChange==='removed'||r.layerChange==='added'){weight*=.6;notes.push(r.layerChange==='removed'?'밖에서 옷을 벗었어요':'밖에서 옷을 더 입었어요');}
 if((r.bottom&&r.bottom!=='normal')||r.accessories?.length){weight*=.75;notes.push('하의·소품이 보온에 영향을 줬을 수 있어요');}
 return {weight,notes};
}
// 기록 당시 저장한 추천과 실제 착용감 비교. 학습에 쓴 기록 재평가가 아니라 이후 외출 결과입니다.
export function recommendationStats(records){
 const list=records.filter(r=>!r.deleted&&r.context==='outdoor'&&r.recommendation&&Number.isInteger(r.rating));
 const within=list.filter(r=>r.recommendation.rangeResult==='within');
 return {total:list.length,within:within.length,withinComfortable:within.filter(r=>r.rating===0).length,
  comfortable:list.filter(r=>r.rating===0).length,severe:list.filter(r=>Math.abs(r.rating)===2).length,followed:list.filter(r=>r.recommendation.followed).length};
}
export function buildComfortModel(profile,records,temp,tools){
 const {scoreFor,activityAdjustment,exposureAdjustment,sensitivityPrior,outfit,scoreVersion}=tools;
 const limit=n=>Math.max(.5,Math.min(30,n));
 const round=n=>Math.round(n*10)/10;
 const down=n=>Math.floor((n+1e-8)*2)/2;
 const up=n=>Math.ceil((n-1e-8)*2)/2;
 const base=scoreFor(temp),activity=activityAdjustment(profile.activity),exposure=exposureAdjustment(profile.exposure,temp),prior=sensitivityPrior(profile,temp);
 const latest=new Map();
 records.forEach((r,i)=>{const key=r.date||r.id||String(i),old=latest.get(key);const canonical=r.id===`day:${r.date}`,oldCanonical=old?.id===`day:${old?.date}`;
  if(!old||(canonical&&!oldCanonical)||(canonical===oldCanonical&&String(r.updatedAt||'').localeCompare(String(old.updatedAt||''))>=0))latest.set(key,r);
 });
 const recordScore=r=>{try{const s=r.scoreVersion===scoreVersion?r.score:outfit(r.items,r.itemOptions||{}).score;return Number.isFinite(s)&&s>0&&s<=30?s:null;}catch{return null;}};
 // 빠른 추정: 기록마다 '기본 기준보다 몇 점 더(덜) 입는 사람인지'를 구해 다른 기온에도 옮겨 씁니다.
 // 추움·더움은 이 추정에서만 한 단계 1점으로 환산하고, 설정값(prior)은 기록 1개만큼의 비중으로 섞습니다.
 // 기온이 멀수록 비중을 줄이고 15℃ 넘게 차이 나면 쓰지 않습니다. 모두 초기 설계값입니다.
 const RATING_STEP=1,RATING_WEIGHT=[1,.7,.5],TRANSFER_SIGMA=8,TRANSFER_LIMIT=15,PRIOR_WEIGHT=1;
 let globalWeight=0,globalSum=0,globalSamples=0;
 for(const r of latest.values()){
  const feels=recordFeels(r);
  if(r.deleted||r.context!=='outdoor'||!Number.isFinite(feels)||!Number.isInteger(r.rating)||Math.abs(r.rating)>2||Math.abs(feels-temp)>TRANSFER_LIMIT)continue;
  const score=recordScore(r);if(score===null)continue;
  const implied=score-r.rating*RATING_STEP;
  const offset=implied-(scoreFor(feels)+activityAdjustment(r.activity)+exposureAdjustment(r.exposure,feels));
  const w=RATING_WEIGHT[Math.abs(r.rating)]*comparabilityWeight(r).weight*Math.exp(-.5*((feels-temp)/TRANSFER_SIGMA)**2);
  globalWeight+=w;globalSum+=w*offset;globalSamples++;
 }
 const personalOffset=(prior*PRIOR_WEIGHT+globalSum)/(PRIOR_WEIGHT+globalWeight);
 const initial=Math.max(1,Math.min(globalSamples?30:12,base+personalOffset+activity+exposure));
 const estimateSpread=globalSamples?1-.5*Math.min(1,globalWeight/4):1;
 const observations=[];
 for(const r of latest.values()){
  const feels=recordFeels(r);
  if(r.deleted||r.context!=='outdoor'||!Number.isFinite(feels)||!Number.isInteger(r.rating)||Math.abs(r.rating)>2||Math.abs(feels-temp)>5)continue;
  let score;try{score=r.scoreVersion===scoreVersion?r.score:outfit(r.items,r.itemOptions||{}).score;}catch{continue;}
  if(!Number.isFinite(score)||score<=0||score>30)continue;
  const temperatureDistance=Math.abs(feels-temp);
  const comparability=comparabilityWeight(r);
  const activityKnown=['normal','active','still'].includes(r.activity);
  const exposureKnown=['short','medium','long'].includes(r.exposure);
  const activityMatch=(r.activity||'normal')===(profile.activity||'normal');
  const exposureMatch=(r.exposure||'medium')===(profile.exposure||'medium');
  const weight=Math.exp(-.5*(temperatureDistance/3)**2)*(activityKnown?(activityMatch?1:.5):.8)*(exposureKnown?(exposureMatch?1:.65):.85)*comparability.weight;
  // 기록 당시 기온·활동·야외 시간의 기본 보정을 빼고 지금 조건의 보정을 더해 같은 기준으로 비교합니다.
  const adjusted=limit(score+(base-scoreFor(feels))+activity-activityAdjustment(r.activity)+exposure-exposureAdjustment(r.exposure,feels));
  observations.push({record:r,score,adjusted,weight,feels,observed:Number.isFinite(r.observed?.feels),temperatureDistance,comparabilityNotes:comparability.notes,conditionMatch:activityKnown&&exposureKnown&&activityMatch&&exposureMatch});
 }
 const neutral=observations.filter(o=>o.record.rating===0),cold=observations.filter(o=>o.record.rating<0),hot=observations.filter(o=>o.record.rating>0);
 const quantile=(list,q)=>{const sorted=[...list].sort((a,b)=>a.adjusted-b.adjusted);const sum=sorted.reduce((n,o)=>n+o.weight,0);let weight=0;for(const o of sorted){weight+=o.weight;if(weight>=sum*q)return o.adjusted;}return sorted.at(-1)?.adjusted;};
 const anchorWeight=neutral.reduce((n,o)=>n+o.weight,0),strength=Math.min(1,anchorWeight/2);
 let center=initial,lower=initial-estimateSpread,upper=initial+estimateSpread,source=globalSamples?'estimated':'provisional',conflict=false;
 if(neutral.length){
  const median=quantile(neutral,.5),q1=quantile(neutral,.25),q3=quantile(neutral,.75);
  center=initial*(1-strength)+median*strength;
  const uncertainty=(1-strength)*.5;
  lower=Math.min(center-.5-uncertainty,q1);upper=Math.max(center+.5+uncertainty,q3);
  source=strength>=1?'personal':'learning';
 }
 // Cold/hot votes supply directional limits, not an assumed exact point delta.
 const coldScore=cold.length?quantile(cold,.5):null,hotScore=hot.length?quantile(hot,.5):null;
 const lowerLimit=coldScore===null?null:up(coldScore+.01),upperLimit=hotScore===null?null:down(hotScore-.01);
 const medianNeutral=neutral.length?quantile(neutral,.5):null;
 conflict=(lowerLimit!==null&&upperLimit!==null&&lowerLimit>=upperLimit)||
  (medianNeutral!==null&&((coldScore!==null&&coldScore>=medianNeutral-.05)||(hotScore!==null&&hotScore<=medianNeutral+.05)));
 if(!conflict){
  if(lowerLimit!==null){lower=Math.max(lower,lowerLimit);upper=Math.max(upper,lower+(neutral.length ? .5 : 1));}
  if(upperLimit!==null){upper=Math.min(upper,upperLimit);lower=Math.min(lower,upper-(neutral.length ? .5 : 1));}
  // A narrow intersection is not enough to justify a precise comfortable point.
  if(lowerLimit!==null&&upperLimit!==null){lower=Math.max(lower,lowerLimit);upper=Math.min(upper,upperLimit);}
  center=Math.max(lower,Math.min(upper,center));
  if(!neutral.length&&observations.length)source='directional';
 }else source='conflicting';
 lower=limit(down(lower));upper=limit(up(upper));if(upper<lower)upper=lower;
 center=round(Math.max(lower,Math.min(upper,center)));
 const sourceLabels={provisional:'임시 기준',estimated:'기록으로 추정',learning:'기록을 알아가는 중',personal:'개인 기록 기준',directional:'착용감 방향만 참고',conflicting:'기록이 엇갈려요'};
 const ordered=[...observations].sort((a,b)=>(a.record.rating===0?0:1)-(b.record.rating===0?0:1)||b.weight-a.weight||String(b.record.date).localeCompare(String(a.record.date)));
 return {base:round(base),prior:round(prior),activity,exposure,target:center,offset:round(center-base-activity-exposure),
  range:{lower,upper},source,sourceLabel:sourceLabels[source],conflict,samples:observations.length,anchors:neutral.length,
  effectiveAnchors:round(anchorWeight),initial:round(initial),personalOffset:round(personalOffset),globalSamples,evidence:ordered.slice(0,3),comfortable:neutral.map(o=>o.record)};
}
