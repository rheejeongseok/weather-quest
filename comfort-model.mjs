// These intervals are comparison guides, not statistical confidence intervals.
// Clothing scores stay fixed; observations learn the user's comfortable range.
export function buildComfortModel(profile,records,temp,tools){
 const {scoreFor,activityAdjustment,exposureAdjustment,sensitivityPrior,outfit,scoreVersion}=tools;
 const limit=n=>Math.max(.5,Math.min(30,n));
 const round=n=>Math.round(n*10)/10;
 const down=n=>Math.floor((n+1e-8)*2)/2;
 const up=n=>Math.ceil((n-1e-8)*2)/2;
 const base=scoreFor(temp),activity=activityAdjustment(profile.activity),exposure=exposureAdjustment(profile.exposure,temp),prior=sensitivityPrior(profile,temp);
 const initial=Math.max(1,Math.min(12,base+prior+activity+exposure));
 const latest=new Map();
 records.forEach((r,i)=>{const key=r.date||r.id||String(i),old=latest.get(key);const canonical=r.id===`day:${r.date}`,oldCanonical=old?.id===`day:${old?.date}`;
  if(!old||(canonical&&!oldCanonical)||(canonical===oldCanonical&&String(r.updatedAt||'').localeCompare(String(old.updatedAt||''))>=0))latest.set(key,r);
 });
 const observations=[];
 for(const r of latest.values()){
  if(r.deleted||r.context!=='outdoor'||!Number.isFinite(r.weather?.feels)||!Number.isInteger(r.rating)||Math.abs(r.rating)>2||Math.abs(r.weather.feels-temp)>5)continue;
  let score;try{score=r.scoreVersion===scoreVersion?r.score:outfit(r.items).score;}catch{continue;}
  if(!Number.isFinite(score)||score<=0||score>30)continue;
  const temperatureDistance=Math.abs(r.weather.feels-temp);
  const activityKnown=['normal','active','still'].includes(r.activity);
  const exposureKnown=['short','medium','long'].includes(r.exposure);
  const activityMatch=(r.activity||'normal')===(profile.activity||'normal');
  const exposureMatch=(r.exposure||'medium')===(profile.exposure||'medium');
  const weight=Math.exp(-.5*(temperatureDistance/3)**2)*(activityKnown?(activityMatch?1:.5):.8)*(exposureKnown?(exposureMatch?1:.65):.85);
  const adjusted=limit(score+activity-activityAdjustment(r.activity)+exposure-exposureAdjustment(r.exposure,r.weather.feels));
  observations.push({record:r,score,adjusted,weight,temperatureDistance,conditionMatch:activityKnown&&exposureKnown&&activityMatch&&exposureMatch});
 }
 const neutral=observations.filter(o=>o.record.rating===0),cold=observations.filter(o=>o.record.rating<0),hot=observations.filter(o=>o.record.rating>0);
 const quantile=(list,q)=>{const sorted=[...list].sort((a,b)=>a.adjusted-b.adjusted);const sum=sorted.reduce((n,o)=>n+o.weight,0);let weight=0;for(const o of sorted){weight+=o.weight;if(weight>=sum*q)return o.adjusted;}return sorted.at(-1)?.adjusted;};
 const anchorWeight=neutral.reduce((n,o)=>n+o.weight,0),strength=Math.min(1,anchorWeight/2);
 let center=initial,lower=initial-1,upper=initial+1,source='provisional',conflict=false;
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
 const sourceLabels={provisional:'임시 기준',learning:'기록을 알아가는 중',personal:'개인 기록 기준',directional:'착용감 방향만 참고',conflicting:'기록이 엇갈려요'};
 const ordered=[...observations].sort((a,b)=>(a.record.rating===0?0:1)-(b.record.rating===0?0:1)||b.weight-a.weight||String(b.record.date).localeCompare(String(a.record.date)));
 return {base:round(base),prior:round(prior),activity,exposure,target:center,offset:round(center-base-activity-exposure),
  range:{lower,upper},source,sourceLabel:sourceLabels[source],conflict,samples:observations.length,anchors:neutral.length,
  effectiveAnchors:round(anchorWeight),initial:round(initial),evidence:ordered.slice(0,3),comfortable:neutral.map(o=>o.record)};
}
