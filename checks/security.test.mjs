import test from 'node:test';
import assert from 'node:assert/strict';
import {snowflake,mediaURL,isMedia,cleanName,discord} from '../lib/discord.ts';
import {crc32,zip} from '../lib/zip.ts';
import {writeFile} from 'node:fs/promises';
test('only Discord attachment hosts may be fetched',()=>{
 assert.equal(mediaURL('https://cdn.discordapp.com/attachments/123/456/image.png?ex=123'),'https://cdn.discordapp.com/attachments/123/456/image.png?ex=123');
 for(const s of ['http://cdn.discordapp.com/attachments/a','https://evil.test/attachments/a','https://cdn.discordapp.com.evil.test/attachments/a','https://cdn.discordapp.com@evil.test/attachments/a','https://cdn.discordapp.com:8443/attachments/a','https://cdn.discordapp.com/../api/users','http://127.0.0.1/attachments/a']) assert.throws(()=>mediaURL(s));
});
test('path identifiers and file names are constrained',()=>{
 assert.equal(snowflake('123456789012345678'),'123456789012345678');
 for(const s of ['../users/@me','123?x=1',null,'','123456789012345678/../'])assert.throws(()=>snowflake(s));
 assert.equal(cleanName('../file\r\n.jpg'),'.._file__.jpg');
 assert.ok(isMedia({filename:'clip.MOV'}));assert.ok(isMedia({content_type:'image/png'}));assert.ok(!isMedia({filename:'index.html'}));
});
test('429 delay returned without leaking upstream data',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({retry_after:2.3,secret:'never-forward'}),{status:429});
 try{await assert.rejects(()=>discord('fake-test-token','/users/@me'),e=>e.status===429&&e.retryAfter===2.3&&!e.message.includes('never-forward'));}finally{globalThis.fetch=old;}
});
test('ZIP CRC and Unicode archive',async()=>{
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
 const b=zip([{name:'été.txt',data:new TextEncoder().encode('Bonjour Fleury')},{name:'vide.txt',data:new Uint8Array()}]);
 await writeFile('/tmp/fleury-test.zip',new Uint8Array(await b.arrayBuffer()));
});
