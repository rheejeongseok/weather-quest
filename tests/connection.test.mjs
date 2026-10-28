import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseStore} from '../store.mjs';
test('project URL rejects dashboard links and keys reject embedded line breaks',()=>{
 assert.throws(()=>createSupabaseStore({url:'https://supabase.com/dashboard/project/test',key:'test'}),/대시보드/);
 assert.throws(()=>createSupabaseStore({url:'example.supabase.co',key:'test'}),/Project URL/);
 assert.throws(()=>createSupabaseStore({url:'https://example.supabase.co',key:'sb_secret_test\nsecond'}),/줄바꿈/);
});
test('network errors explain DNS failures without disclosing credentials',async()=>{
 const store=createSupabaseStore({url:'https://example.supabase.co',key:'sb_secret_private_value',fetcher:async()=>{throw Object.assign(Error('fetch failed'),{cause:{code:'ENOTFOUND'}});}});
 await assert.rejects(store.user('id'),e=>e.message.includes('DNS')&&!e.message.includes('private_value'));
});
test('authentication failure and missing schema have distinct messages',async()=>{
 for(const [status,pattern] of [[401,/키 인증 실패/],[403,/접근 권한/],[404,/schema.sql/]]){
  const store=createSupabaseStore({url:'https://example.supabase.co',key:'test',fetcher:async()=>new Response('{}',{status})});await assert.rejects(store.user('id'),pattern);
 }
});
