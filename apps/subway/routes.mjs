// 지하철 API: 다음 열차, 탈 열차 계획, 역 실시간 도착, 실시간 위치, 프로필별 저장(wq_subway_saved)
import {profilePart} from '../../core/profile.mjs';
import {departures,positions,plan,arrivals,sanitizeSubwaySaved} from './subway-api.mjs';
const TABLE='wq_subway_saved';
// 프로필에 지하철 저장분(subway)을 붙임. 새 테이블이 비어 있으면 예전 wq_profiles.data.subway에서 옮겨 옵니다.
profilePart(async(db,id,legacy)=>{
 let saved=await db.appGet(TABLE,id);
 if(!saved){const old=(await legacy()).subway;if(old){saved=sanitizeSubwaySaved(old);await db.appSet(TABLE,id,saved);}}
 return saved?{subway:saved}:{};
});
const station=u=>{const s=u.searchParams.get('station');if(!s||s.length>30)throw Error('역 이름을 확인해 주세요.');return s;};

export async function handle({req,u,db:storage,body,send}){
 const path=u.pathname;if(!path.startsWith('/api/subway/'))return false;
 if(path==='/api/subway/departures')return send(200,await departures(station(u)));
 if(path==='/api/subway/plan'){const q=k=>(u.searchParams.get(k)||'').slice(0,30);return send(200,await plan({from:q('from'),via:q('via'),to:q('to'),mode:q('mode')==='fewest'?'fewest':'fastest',time:q('time')}));}
 if(path==='/api/subway/arrivals')return send(200,await arrivals(station(u)));
 if(path==='/api/subway/positions')return send(200,await positions(u.searchParams.get('line')));
 if(path==='/api/subway/save'&&req.method==='POST'){const db=await storage(),b=await body();const {id}=await db.user(b.userId);const subway=sanitizeSubwaySaved(b.subway);await db.appSet(TABLE,id,subway);return send(200,{subway});}
 return false;
}
