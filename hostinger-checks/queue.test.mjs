import test from 'node:test';
import assert from 'node:assert/strict';
import {saveQueue} from '../assets/save-queue.js';
test('file failure does not block later files or count as success',async()=>{
 const saved=[],failed=[];let cursor=0;
 await saveQueue({items:[1,2,3],save:async x=>{if(x===2)throw new Error('bad range');},onSuccess:x=>saved.push(x),onFailure:x=>failed.push(x),onAdvance:i=>cursor=i});
 assert.deepEqual(saved,[1,3]);assert.deepEqual(failed,[2]);assert.equal(cursor,3);
 await saveQueue({items:failed,save:async()=>{},onSuccess:x=>saved.push(x),onFailure:()=>assert.fail(),onAdvance:()=>{}});
 assert.deepEqual(saved,[1,3,2]);
});
test('pause and global errors keep failing file pending',async()=>{
 for(const error of [new DOMException('pause','AbortError'),Object.assign(new Error('disk'),{status:507}),Object.assign(new Error('login'),{status:401})]){
 let cursor=0;const saved=[];
 await assert.rejects(saveQueue({items:[1,2,3],save:async x=>{if(x===2)throw error;},onSuccess:x=>saved.push(x),onFailure:()=>assert.fail(),onAdvance:i=>cursor=i}));
 assert.deepEqual(saved,[1]);assert.equal(cursor,1);
 }
});
