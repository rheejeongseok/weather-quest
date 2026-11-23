// 공통 서버 도구: JSON 응답, 요청 본문, DB 저장소(한 번만 연결)
import {createStore} from './store.mjs';
let storePromise;
export function storage(){return storePromise??=createStore().catch(e=>{storePromise=null;throw e;});}
export const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
export async function body(req){if(req.body && typeof req.body === 'object')return req.body;if(typeof req.body === 'string')return JSON.parse(req.body);let s='';for await(const c of req){s+=c;if(Buffer.byteLength(s)>2_000_000)throw Error('파일이 너무 큽니다.');}return JSON.parse(s||'{}');}
