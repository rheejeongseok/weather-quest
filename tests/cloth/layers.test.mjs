import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedClothes,clothes,recommend} from '../lib.mjs';
test('actual outfits support layered shirts and light down under a coat',()=>{
 for(const ids of [['tee','shirt','wind'],['long','ziphood','jacket'],['thermal','long','knit','light','coat'],['tee','cardigan','trench']])assert.equal(selectedClothes(ids).length,ids.length);
});
test('reject duplicate or unknown items without restricting clothing groups',()=>{
 for(const ids of [[],['tee','tee'],['unknown'],clothes.slice(0,6).map(c=>c.id)])assert.throws(()=>selectedClothes(ids));
});
test('existing item IDs and warmth values remain compatible with saved records',()=>{
 assert.equal(selectedClothes(['shirt','light']).reduce((n,c)=>n+c.score,0),6);
});
test('strong wind recommendations choose a windproof outer garment',()=>{
 for(const t of [0,10,20])assert.equal(recommend(t,0,'normal',30).items.at(-1).windproof,true);
});
