<?php
declare(strict_types=1);
require __DIR__.'/backend/discord.php';
try {
    start_session();
    if($_SERVER['REQUEST_METHOD']!=='POST')throw new FleuryError(405,'Méthode non autorisée.');
    if(!authenticated())throw new FleuryError(401,'Reconnecte-toi au site avec ton mot de passe.');
    csrf_check();
    $raw=file_get_contents('php://input',false,null,0,8193);
    if(strlen($raw)>8192)throw new FleuryError(413,'Requête trop volumineuse.');
    $b=json_decode($raw,true);unset($raw);
    if(!is_array($b))throw new FleuryError(400,'Requête invalide.');
    $action=$b['action']??'';
    if($action==='logout'){$_SESSION=[];session_destroy();setcookie('fleury_site','',['expires'=>time()-3600,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Strict']);respond(['ok'=>true]);}
    // Release PHP's session lock before network transfers. The Discord token is never stored in $_SESSION.
    session_write_close();
    if($action==='library_batches')respond(library_batches($b));
    if($action==='library')respond(library_page($b));
    if($action==='stored'){
        $key=stored_key($b['key']??null);$base=private_dir().'/media/'.$key;
        $meta=is_file($base.'.json')?json_decode((string)file_get_contents($base.'.json'),true):null;
        if(!$meta)throw new FleuryError(404,'Fichier introuvable.');serve_file($base.'.blob',$meta['name']);
    }
    $token=trim($_SERVER['HTTP_X_DISCORD_TOKEN']??'');
    if(strlen($token)<20||strlen($token)>4096||preg_match('/[\r\n]/',$token))throw new FleuryError(400,'Renseigne ton jeton Discord.');
    if($action==='me'){$u=discord($token,'/users/@me');respond(['id'=>$u['id'],'name'=>($u['global_name']??'')?:$u['username']]);}
    if($action==='guilds'){$after=empty($b['after'])?'':'&after='.snowflake($b['after']);$g=discord($token,'/users/@me/guilds?limit=200'.$after);remember_sources($g);respond(['items'=>array_map(static fn($g)=>['id'=>$g['id'],'name'=>$g['name']],$g),'after'=>count($g)===200?$g[count($g)-1]['id']:null]);}
    if($action==='channels'){$guild=snowflake($b['guild']??null);$c=discord($token,"/guilds/$guild/channels");remember_sources([],$c,$guild);$c=array_values(array_filter($c,static fn($c)=>in_array($c['type'],[0,5,10,11,12],true)));usort($c,static fn($a,$b)=>($a['position']??0)<=>($b['position']??0));respond(['items'=>array_map(static fn($c)=>['id'=>$c['id'],'name'=>$c['name']],$c)]);}
    if($action==='messages'){
        $channel=snowflake($b['channel']??null);if(empty(source_catalog()['channels'][$channel])){$info=discord($token,'/channels/'.$channel);remember_sources([],[$info]);}$before=empty($b['before'])?'':'&before='.snowflake($b['before']);$m=discord($token,"/channels/$channel/messages?limit=100$before");$items=[];
        foreach($m as $msg){
            remember_attachments($token,$channel,$msg);
            foreach($msg['attachments']??[] as $a)if(is_media($a))$items[]=['id'=>$a['id'],'message'=>$msg['id'],'channel'=>$channel,'name'=>clean_name($a['filename']??'media'),'size'=>$a['size'],'type'=>$a['content_type']??'','date'=>$msg['timestamp']];
        }
        respond(['count'=>count($m),'before'=>count($m)?$m[count($m)-1]['id']:null,'done'=>count($m)<100,'items'=>$items]);
    }
    if($action==='save'){$a=attachment($token,$b);respond(save_chunk($a,media_key($b),(int)($b['chunkBytes']??4194304)));}
    if($action==='file'){
        $a=attachment($token,$b);$c=curl_handle(media_url($a['url']));
        // No disk persistence for browser downloads. A bounded buffer holds at most a ZIP-sized media.
        if((int)$a['size']>32*1024*1024)throw new FleuryError(413,'Sauvegarde d’abord ce gros fichier sur le site, puis télécharge-le depuis tes sauvegardes.');
        $out=fopen('php://temp/maxmemory:33554432','w+b');$received=0;$responseLength=null;$overflow=false;
        curl_setopt($c,CURLOPT_HEADERFUNCTION,static function($c,$line)use(&$responseLength){if(str_starts_with($line,'HTTP/'))$responseLength=null;if(stripos($line,'content-length:')===0)$responseLength=(int)trim(substr($line,15));return strlen($line);});
        curl_setopt($c,CURLOPT_WRITEFUNCTION,static function($c,$chunk)use($out,&$received,&$overflow){if($received+strlen($chunk)>33554432){$overflow=true;return 0;}$n=fwrite($out,$chunk);$received+=$n;return $n;});
        $ok=curl_exec($c);$status=curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
        if($overflow){fclose($out);throw new FleuryError(413,'Le fichier réel dépasse 32 Mo. Préparation sur le site nécessaire.');}
        if($ok===false||$status!==200||($responseLength!==null&&$received!==$responseLength)){fclose($out);throw new FleuryError(502,'Le média n’a pas été reçu en entier. Réessaie.');}
        header('Content-Type: application/octet-stream');header('Content-Length: '.$received);header("Content-Disposition: attachment; filename*=UTF-8''".rawurlencode($a['filename']));rewind($out);fpassthru($out);fclose($out);exit;
    }
    throw new FleuryError(400,'Action inconnue.');
}catch(FleuryError $e){respond(['error'=>$e->getMessage(),'retryAfter'=>$e->retryAfter],$e->status);}
catch(Throwable $e){respond(['error'=>'Opération interrompue. Vérifie les extensions PHP et l’espace disque dans Hostinger, puis réessaie.'],500);}
