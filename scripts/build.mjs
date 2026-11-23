// 배포용 정적 파일: public/ 전체 + 브라우저와 함께 쓰는 서버 모듈(core/static.mjs)
import {cp,mkdir,copyFile,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SHARED_MODULES} from '../core/static.mjs';
const root=new URL('../',import.meta.url);
await rm(new URL('dist/',root),{recursive:true,force:true});
await mkdir(new URL('dist/',root),{recursive:true});
await cp(new URL('public/',root),new URL('dist/',root),{recursive:true});
for(const [url,source] of Object.entries(SHARED_MODULES)){const target=new URL('dist'+url,root);await mkdir(dirname(fileURLToPath(target)),{recursive:true});await copyFile(new URL(source,root),target);}
console.log('Static assets ready in dist/');
