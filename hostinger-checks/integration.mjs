// Optional test runtime: @php-wasm/node + @php-wasm/universal. No production dependency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtime=process.env.FLEURY_PHP_WASM_ROOT;
const {loadNodeRuntime}=await import(runtime?path.join(runtime,'@php-wasm/node/index.js'):'@php-wasm/node');
const {PHP}=await import(runtime?path.join(runtime,'@php-wasm/universal/index.js'):'@php-wasm/universal');
const php=new PHP(await loadNodeRuntime('8.2', {emscriptenOptions:{processId:process.pid}}));
php.mkdir('/site/public_html/backend');
for(const file of ['index.php','api.php','download.php','backend/bootstrap.php','backend/discord.php'])php.writeFile('/site/public_html/'+file,fs.readFileSync(path.join(root,file)));
let cookie='';
const server={DOCUMENT_ROOT:'/site/public_html',HTTPS:'on',SERVER_PORT:'443',REMOTE_ADDR:'192.0.2.1',HTTP_HOST:'fleury.test'};
async function req(file,options={}){
 if(typeof options.body==='string')options={...options,body:new TextEncoder().encode(options.body)};
 const r=await php.run({scriptPath:'/site/public_html/'+file,relativeUri:'/'+file,protocol:'https',...options,headers:{Host:'fleury.test',Cookie:cookie,...options.headers},$_SERVER:{...server,...options.$_SERVER}});
 const set=r.headers['set-cookie'];if(set?.length)cookie=set[set.length-1].split(';')[0];
 assert.equal(r.errors,'',`Unexpected PHP warning/error: ${r.errors}`);
 return r;
}
const csrfOf=r=>r.text.match(/name="csrf-token" content="([a-f0-9]+)"/)?.[1];
let r=await req('index.php');assert.equal(r.httpStatusCode,200);assert.match(r.text,/Créer mon accès/);
let csrf=csrfOf(r);assert.ok(csrf);
const setupCode=php.readFileAsText('/site/fleury-private/setup-code.txt').trim();
assert.ok(setupCode.length===48);assert.ok(!r.text.includes(setupCode));
r=await req('api.php',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:'library'})});assert.equal(r.httpStatusCode,401);
r=await req('index.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,password:'test-password-long',setup_code:'wrong'}).toString()});assert.equal(r.httpStatusCode,403);
assert.equal(php.fileExists('/site/fleury-private/auth.json'),false);
r=await req('index.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,password:'test-password-long',setup_code:setupCode}).toString()});assert.equal(r.httpStatusCode,303);
assert.equal(php.fileExists('/site/fleury-private/setup-code.txt'),false);
assert.ok(!php.readFileAsText('/site/fleury-private/auth.json').includes('test-password-long'));
r=await req('index.php');assert.equal(r.httpStatusCode,200);assert.match(r.text,/id="workspace"/);csrf=csrfOf(r);
r=await req('api.php',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'wrong'},body:'{"action":"library"}'});assert.equal(r.httpStatusCode,403);
r=await req('api.php',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{"action":"library"}'});assert.equal(r.httpStatusCode,200);assert.deepEqual(JSON.parse(r.text).items,[]);
const key='123456789012345678_223456789012345678_323456789012345678';
php.writeFile('/site/fleury-private/media/'+key+'.blob','example media bytes');php.writeFile('/site/fleury-private/media/'+key+'.json',JSON.stringify({name:'image.png',size:19,savedAt:'2026-09-07'}));
r=await req('download.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,key}).toString()});assert.equal(r.httpStatusCode,200);assert.equal(r.text,'example media bytes');
r=await req('download.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,key:'../auth'}).toString()});assert.equal(r.httpStatusCode,400);
const security=await php.run({code:`<?php require '/site/public_html/backend/discord.php';
$bad=['http://cdn.discordapp.com/attachments/a','https://evil.test/attachments/a','https://cdn.discordapp.com.evil.test/attachments/a','https://cdn.discordapp.com:8443/attachments/a','https://user@cdn.discordapp.com/attachments/a','https://cdn.discordapp.com/api/users'];
foreach($bad as $u){try{media_url($u);echo 'FAILED';}catch(FleuryError $e){}}
try{snowflake('../123');echo 'FAILED';}catch(FleuryError $e){}
echo 'OK';`});assert.equal(security.text,'OK');
r=await req('api.php',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{"action":"logout"}'});assert.equal(r.httpStatusCode,200);
r=await req('download.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,key}).toString()});assert.equal(r.httpStatusCode,401);
// Mock only the Discord transport in the isolated test filesystem, never in production.
php.writeFile('/site/public_html/backend/discord-fixture.php',fs.readFileSync(path.join(root,'backend/discord.php'),'utf8').replace('function discord(string $token,string $path): array {','function unused_test_transport(string $token,string $path): array {'));
const cacheTest=await php.run({$_SERVER:server,code:`<?php
function discord(string $token,string $path): array {$GLOBALS['calls'][]=$path;return $GLOBALS['fixture'];}
require '/site/public_html/backend/discord-fixture.php';
$token='fake-session-token-for-tests-only';
$b=['channel'=>'123456789012345678','message'=>'223456789012345678','id'=>'323456789012345678'];
$a=['id'=>$b['id'],'filename'=>'image.png','size'=>100,'content_type'=>'image/png','url'=>'https://cdn.discordapp.com/attachments/'.$b['channel'].'/'.$b['id'].'/image.png?ex='.dechex(time()+600).'&hm=test'];
$m=['id'=>$b['message'],'attachments'=>[$a]];$GLOBALS['calls']=[];$GLOBALS['fixture']=[$m];
remember_attachments($token,$b['channel'],$m);
if(attachment($token,$b)['url']!==$a['url']||count($GLOBALS['calls'])!==0)throw new Exception('Cache miss');
$path=attachment_cache_path($token,$b['channel'],$b['message']);
if(str_contains(file_get_contents($path),$token))throw new Exception('Persisted credential');
$record=json_decode(file_get_contents($path),true);$record['attachments'][0]['url']='https://cdn.discordapp.com/attachments/a/b/image.png?ex=1';atomic_write($path,json_encode($record));
if(attachment($token,$b)['url']!==$a['url']||count($GLOBALS['calls'])!==1)throw new Exception('Refresh failed');
if($GLOBALS['calls'][0]!=='/channels/'.$b['channel'].'/messages?around='.$b['message'].'&limit=3')throw new Exception('Wrong endpoint');
attachment('different-session-token',$b);if(count($GLOBALS['calls'])!==2)throw new Exception('Session cache leak');
$b['message']='423456789012345678';try{attachment($token,$b);throw new Exception('Wrong message accepted');}catch(FleuryError $e){if($e->status!==404)throw $e;}
echo 'PASS';`});
assert.equal(cacheTest.errors,'');assert.equal(cacheTest.text,'PASS');
console.log('PASS: PHP auth, CSRF, private downloads, CDN restrictions, cached attachment links, expired-link renewal, session isolation and exact-message matching.');
php.exit();
