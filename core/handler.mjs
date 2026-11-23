// My Doc 서버 라우터: 서랍(apps/*)마다 API를 맡기고, 그 밖의 요청은 public/ 정적 파일로 응답합니다.
// 새 서랍은 apps/<이름>/routes.mjs 에서 handle(ctx)를 내보내고 아래 apps 목록에 추가하면 됩니다.
import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve,sep,extname} from 'node:path';
import {json,body,storage} from './http.mjs';
import {SHARED_MODULES} from './static.mjs';
import {handle as cloth} from '../apps/cloth/routes.mjs';
import {handle as subway} from '../apps/subway/routes.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir=join(root,'public');
const apps=[subway,cloth];
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png'};

// 정적 파일: public/ 안의 알려진 형식만, 그리고 브라우저와 함께 쓰는 서버 모듈(SHARED_MODULES)
function staticFile(pathname){
 if(SHARED_MODULES[pathname])return join(root,SHARED_MODULES[pathname]);
 let rel;try{rel=decodeURIComponent(pathname);}catch{return null;}
 if(rel==='/')rel='/index.html';
 const file=resolve(publicDir,'.'+rel);
 if(!file.startsWith(publicDir+sep)||!TYPES[extname(file)])return null;
 try{return statSync(file).isFile()?file:null;}catch{return null;}
}

export default async function handler(req,res){try{const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/handler'&&u.searchParams.has('route'))u.pathname='/api/'+u.searchParams.get('route');
 if(u.pathname.startsWith('/api/')){
  const ctx={req,res,u,db:storage,body:()=>body(req),send:(status,data)=>json(res,status,data)};
  for(const app of apps)if(await app(ctx)!==false)return;
  return json(res,404,{error:'API를 찾을 수 없습니다.'});
 }
 const file=staticFile(u.pathname);
 if(!file){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'Content-Type':TYPES[extname(file)],'X-Content-Type-Options':'nosniff'});res.end(readFileSync(file));
 }catch(e){json(res,400,{error:e.message||'요청을 처리하지 못했어요.'});}}
