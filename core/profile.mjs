// 프로필(닉네임) = My Doc 공통 계정. 각 서랍은 자기 테이블에서 자기 몫을 붙여 화면에 보낼 프로필을 완성합니다.
// 서랍 모듈이 profilePart(fn)로 등록하고, fn(db, id, legacy)는 프로필에 합칠 객체를 돌려줍니다.
// legacy는 예전 방식(wq_profiles.data)에 저장된 값으로, 새 테이블이 비어 있을 때 옮겨 오는 데 씁니다.
const parts=[];
export function profilePart(fn){parts.push(fn);}
export async function composeProfile(db,id){
 const base=await db.user(id);let legacy=null;
 const getLegacy=async()=>legacy??=await db.legacyData(id);
 const out={...base};
 for(const part of parts)Object.assign(out,await part(db,id,getLegacy));
 return out;
}
