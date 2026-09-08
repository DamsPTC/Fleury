<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/library.php';
function snowflake(mixed $s): string {
    if (!is_string($s) || !preg_match('/^\d{16,22}$/D',$s)) throw new FleuryError(400,'Identifiant Discord invalide.');
    return $s;
}
function media_url(mixed $s): string {
    if (!is_string($s)) throw new FleuryError(400,'Adresse de média invalide.');
    $u=parse_url($s);
    if (!$u || ($u['scheme']??'')!=='https' || !in_array(strtolower($u['host']??''),['cdn.discordapp.com','media.discordapp.net'],true) || isset($u['port']) || isset($u['user']) || isset($u['pass']) || !str_starts_with($u['path']??'','/attachments/') || preg_match('/[\x00-\x20\\\\]/',$s)) throw new FleuryError(400,'Adresse de média refusée.');
    foreach(explode('/', rawurldecode($u['path']??'')) as $segment)if(in_array($segment,['.','..'],true))throw new FleuryError(400,'Chemin de média refusé.');
    return $s;
}
function clean_name(string $s): string { return substr(preg_replace('/[\x00-\x1f\x7f\/\\\\<>:"|?*]/','_',$s),0,180) ?: 'media'; }
function is_media(array $a): bool {
    return (bool)preg_match('/^(image|video|audio)\//',$a['content_type']??'') || (bool)preg_match('/\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|tiff?|mp4|mov|webm|mkv|avi|m4v|mp3|wav|ogg|m4a|flac|aac)$/i',$a['filename']??'');
}
function curl_handle(string $url) {
    if (!function_exists('curl_init')) throw new FleuryError(503,'Active l’extension PHP cURL dans Hostinger.');
    $c=curl_init($url);
    curl_setopt_array($c,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>25,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_USERAGENT=>'Fleury/2.0']);
    return $c;
}
function discord(string $token,string $path): array {
    $c=curl_handle('https://discord.com/api/v10'.$path);$body='';
    curl_setopt($c,CURLOPT_HTTPHEADER,['Authorization: '.$token,'Accept: application/json']);
    curl_setopt($c,CURLOPT_WRITEFUNCTION,static function($c,$chunk)use(&$body){if(strlen($body)+strlen($chunk)>8*1024*1024)return 0;$body.=$chunk;return strlen($chunk);});
    $ok=curl_exec($c);$status=curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
    if($ok===false)throw new FleuryError(502,'Impossible de joindre Discord. Réessaie dans un instant.');
    $data=json_decode($body,true);unset($body);
    if($status===429)throw new FleuryError(429,'Discord demande une pause. Reprise automatique.',min(3600,max(1,(float)($data['retry_after']??5))));
    if($status<200||$status>=300)throw new FleuryError(in_array($status,[401,403,404],true)?$status:502,$status===401?'Jeton Discord refusé ou expiré.':($status===403?'Discord refuse cet accès. Vérifie tes droits sur ce salon.':($status===404?'Salon, message ou média introuvable.':'Discord est momentanément indisponible.')));
    if(!is_array($data))throw new FleuryError(502,'Réponse Discord illisible.');
    return $data;
}
function attachment_cache_path(string $token,string $channel,string $message): string {
    $dir=private_dir().'/attachment-cache';
    if(!is_dir($dir)&&!@mkdir($dir,0700)&&!is_dir($dir))throw new FleuryError(503,'Le cache privé des médias est indisponible.');
    // One-way session fingerprint scopes metadata; the token itself is never written.
    return $dir.'/'.hash('sha256',$token."\0".$channel."\0".$message).'.json';
}
function remember_attachments(string $token,string $channel,array $message): void {
    $id=snowflake($message['id']??null);$attachments=[];
    foreach($message['attachments']??[] as $a)if(is_media($a)){
        $attachments[]=['id'=>snowflake($a['id']??null),'filename'=>clean_name($a['filename']??'media'),
            'content_type'=>$a['content_type']??'', 'size'=>(int)($a['size']??0),'url'=>media_url($a['url']??null)];
    }
    if($attachments)atomic_write(attachment_cache_path($token,$channel,$id),json_encode(['savedAt'=>time(),'attachments'=>$attachments],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE));
}
function fresh_attachment(array $record,string $id): ?array {
    if((int)($record['savedAt']??0)<time()-3600)return null;
    foreach($record['attachments']??[] as $a)if(($a['id']??'')===$id){
        $url=media_url($a['url']??null);parse_str(parse_url($url,PHP_URL_QUERY)?:'', $query);
        if(isset($query['ex'])&&(!is_string($query['ex'])||!ctype_xdigit($query['ex'])||hexdec($query['ex'])<=time()+90))return null;
        return $a;
    }
    return null;
}
function attachment(string $token,array $b): array {
    $channel=snowflake($b['channel']??null);$message=snowflake($b['message']??null);$id=snowflake($b['id']??null);
    $path=attachment_cache_path($token,$channel,$message);
    if(is_file($path)){
        $record=json_decode((string)file_get_contents($path),true);
        if(is_array($record)&&($a=fresh_attachment($record,$id))!==null)return $a;
    }
    // Renew through the same history API used by the successful inventory, never
    // the individual-message endpoint. Require an exact message/attachment match.
    $messages=discord($token,"/channels/$channel/messages?around=$message&limit=3");
    foreach($messages as $m)if(($m['id']??'')===$message){
        remember_attachments($token,$channel,$m);
        foreach($m['attachments']??[] as $a)if(($a['id']??'')===$id&&is_media($a)){
            media_url($a['url']??null);$a['filename']=clean_name($a['filename']??'media');return $a;
        }
    }
    throw new FleuryError(404,'Média introuvable dans l’historique accessible. Relance la recherche du salon.');
}
function media_key(array $b): string {return snowflake($b['channel']??null).'_'.snowflake($b['message']??null).'_'.snowflake($b['id']??null);}
function stored_key(mixed $key): string {
    if(!is_string($key)||!preg_match('/^\d{16,22}_\d{16,22}_\d{16,22}$/D',$key))throw new FleuryError(400,'Fichier invalide.');return $key;
}
function valid_chunk(int $status,int $bytes,int $offset,int $length,int $total,string $range): bool {
    if($bytes<=0||$bytes>$length)return false;
    if($status===200)return $offset===0&&$bytes===$total;
    if($status!==206||!preg_match('/^bytes\s+(\d+)-(\d+)\/(\d+)$/iD',trim($range),$r))return false;
    return (int)$r[1]===$offset&&(int)$r[2]===$offset+$bytes-1&&(int)$r[3]===$total;
}
function cdn_total(int $status,int $bytes,int $offset,int $length,int $expected,string $range): ?int {
    if($status===206 && preg_match('/^bytes\s+(\d+)-(\d+)\/(\d+)$/iD',trim($range),$m)) {
        $total=(int)$m[3];
        if($total<=0 || (int)$m[2]>=$total || ($offset>0&&$total!==$expected))return null;
        return valid_chunk($status,$bytes,$offset,$length,$total,$range)?$total:null;
    }
    return valid_chunk($status,$bytes,$offset,$length,$expected,$range)?$expected:null;
}
function save_chunk(array $a,string $key,int $chunkBytes=4194304): array {
    $dir=private_dir();$base=$dir.'/media/'.$key;$expected=(int)$a['size'];
    $lock=fopen($dir.'/storage.lock','c');
    if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))throw new FleuryError(429,'Une sauvegarde est en cours.',2);
    $tmp=null;
    try {
        $transfer=is_file($base.'.transfer')?json_decode((string)file_get_contents($base.'.transfer'),true):null;
        if(is_array($transfer)&&(is_file($base.'.part')||is_file($base.'.blob')))$expected=(int)$transfer['total'];
        if(is_file($base.'.blob') && filesize($base.'.blob')===(is_file($base.'.json')?(int)(json_decode((string)file_get_contents($base.'.json'),true)['size']??-1):$expected)){
            if(!is_file($base.'.json'))atomic_write($base.'.json',json_encode(saved_metadata($key,$a,$expected),JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE));
            $expected=(int)filesize($base.'.blob');return ['saved'=>true,'existing'=>true,'offset'=>$expected,'total'=>$expected];
        }
        foreach(glob($dir.'/media/chunk-*')?:[] as $stale)if(is_file($stale)&&filemtime($stale)<time()-3600)@unlink($stale);
        $offset=is_file($base.'.part')?(int)filesize($base.'.part'):0;
        if($offset>$expected){@unlink($base.'.part');$offset=0;}
        $chunkBytes=in_array($chunkBytes,[4194304,1048576,524288],true)?$chunkBytes:4194304;
        $length=min($chunkBytes,$expected-$offset);
        $cap=(int)(getenv('FLEURY_STORAGE_LIMIT_BYTES')?:10737418240);
        $used=0;foreach(new DirectoryIterator($dir.'/media') as $f)if($f->isFile())$used+=$f->getSize();
        $free=@disk_free_space($dir);
        if($used+$length+4096>$cap || ($free!==false&&$free<$length+32*1024*1024))throw new FleuryError(507,'Espace de sauvegarde insuffisant. Libère de la place dans Hostinger.');
        if($length>0){
            $tmp=tempnam($dir.'/media','chunk-');$out=fopen($tmp,'wb');$bytes=0;$headers=[];
            $c=curl_handle(media_url($a['url']));
            curl_setopt($c,CURLOPT_RANGE,$offset.'-'.($offset+$length-1));
            curl_setopt($c,CURLOPT_HEADERFUNCTION,static function($c,$line)use(&$headers){if(str_starts_with($line,'HTTP/'))$headers=[];if(str_contains($line,':')){[$k,$v]=explode(':',$line,2);$headers[strtolower(trim($k))]=trim($v);}return strlen($line);});
            curl_setopt($c,CURLOPT_WRITEFUNCTION,static function($c,$chunk)use($out,&$bytes,$length){$n=strlen($chunk);if($bytes+$n>$length)return 0;$written=fwrite($out,$chunk);$bytes+=$written;return $written;});
            $ok=curl_exec($c);$status=curl_getinfo($c,CURLINFO_RESPONSE_CODE);$errno=curl_errno($c);curl_close($c);fclose($out);
            // The CDN representation can differ in size from Discord's attachment metadata.
            // Adopt its total only at byte zero; resumed chunks must match the pinned total.
            $range=$headers['content-range']??'';
            $total=cdn_total($status,$bytes,$offset,$length,$expected,$range);
            if($total!==null && $offset===0 && $total!==$expected){
                if($used+$total+4096>$cap || ($free!==false&&$free<$total+32*1024*1024))throw new FleuryError(507,'Espace insuffisant pour la taille réelle du média.');
                $expected=$total;
            }
            if($ok===false||$total===null||!valid_chunk($status,$bytes,$offset,$length,$expected,$range))throw new FleuryError(502,'Transfert incomplet ou plage invalide : HTTP '.$status.', cURL '.$errno.', début '.$offset.', reçu '.$bytes.' / demandé '.$length.' octets ; Content-Range : '.substr(preg_replace('/[^a-zA-Z0-9 \/\-*]/', '', $headers['content-range']??'absent'),0,100).'.');
            atomic_write($base.'.transfer',json_encode(['total'=>$expected],JSON_THROW_ON_ERROR));
            $dest=fopen($base.'.part','ab');$source=fopen($tmp,'rb');$copied=stream_copy_to_stream($source,$dest);fclose($source);fclose($dest);
            if($copied!==$bytes)throw new FleuryError(507,'Écriture interrompue. Libère de la place puis reprends.');
            $offset+=$bytes;
        } elseif(!is_file($base.'.part')) {atomic_write($base.'.part','');}
        if($offset===$expected){
            if(!@rename($base.'.part',$base.'.blob'))throw new FleuryError(507,'Impossible de terminer la sauvegarde.');
            atomic_write($base.'.json',json_encode(saved_metadata($key,$a,$expected),JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE));
            @unlink($base.'.transfer');
            return ['saved'=>true,'existing'=>false,'offset'=>$offset,'total'=>$expected];
        }
        return ['saved'=>false,'offset'=>$offset,'total'=>$expected];
    } finally {if($tmp)@unlink($tmp);flock($lock,LOCK_UN);fclose($lock);}
}
function serve_file(string $path,string $name): never {
    if(!is_file($path))throw new FleuryError(404,'Fichier introuvable.');
    header('Content-Type: application/octet-stream');header('Content-Length: '.filesize($path));header("Content-Disposition: attachment; filename*=UTF-8''".rawurlencode(clean_name($name)));
    $f=fopen($path,'rb');while(!feof($f)&&!connection_aborted()){echo fread($f,1024*1024);flush();}fclose($f);exit;
}
