import {cp,mkdir,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('dist/',root),{recursive:true});
await cp(new URL('public/',root),new URL('dist/',root),{recursive:true});
await copyFile(new URL('lib.mjs',root),new URL('dist/lib.mjs',root));
console.log('Static assets ready in dist/');
