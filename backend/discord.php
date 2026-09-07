<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
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
function attachment(string $token,array $b): array {
    $channel=snowflake($b['channel']??null);$message=snowflake($b['message']??null);$id=snowflake($b['id']??null);
    $m=discord($token,"/channels/$channel/messages/$message");
    foreach($m['attachments']??[] as $a)if(($a['id']??'')===$id&&is_media($a)){media_url($a['url']??null);$a['filename']=clean_name($a['filename']??'media');return $a;}
    throw new FleuryError(404,'Ce média est absent ou a été supprimé.');
}
function media_key(array $b): string {return snowflake($b['channel']??null).'_'.snowflake($b['message']??null).'_'.snowflake($b['id']??null);}
function stored_key(mixed $key): string {
    if(!is_string($key)||!preg_match('/^\d{16,22}_\d{16,22}_\d{16,22}$/D',$key))throw new FleuryError(400,'Fichier invalide.');return $key;
}
function save_chunk(array $a,string $key): array {
    $dir=private_dir();$base=$dir.'/media/'.$key;$expected=(int)$a['size'];
    $lock=fopen($dir.'/storage.lock','c');
    if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))throw new FleuryError(429,'Une sauvegarde est en cours.',2);
    $tmp=null;
    try {
        if(is_file($base.'.blob') && filesize($base.'.blob')===$expected){
            if(!is_file($base.'.json'))atomic_write($base.'.json',json_encode(['name'=>$a['filename'],'size'=>$expected,'savedAt'=>gmdate(DATE_ATOM)],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE));
            return ['saved'=>true,'existing'=>true,'offset'=>$expected,'total'=>$expected];
        }
        foreach(glob($dir.'/media/chunk-*')?:[] as $stale)if(is_file($stale)&&filemtime($stale)<time()-3600)@unlink($stale);
        $offset=is_file($base.'.part')?(int)filesize($base.'.part'):0;
        if($offset>$expected){@unlink($base.'.part');$offset=0;}
        $length=min(4*1024*1024,$expected-$offset);
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
            $ok=curl_exec($c);$status=curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);fclose($out);
            $range='bytes '.$offset.'-'.($offset+$length-1).'/'.$expected;
            if($ok===false||$bytes!==$length||!(($status===206&&($headers['content-range']??'')===$range)||($status===200&&$offset===0&&$length===$expected)))throw new FleuryError(502,'Ce morceau du média n’a pas été reçu en entier. Relance la sauvegarde pour reprendre.');
            $dest=fopen($base.'.part','ab');$source=fopen($tmp,'rb');$copied=stream_copy_to_stream($source,$dest);fclose($source);fclose($dest);
            if($copied!==$length)throw new FleuryError(507,'Écriture interrompue. Libère de la place puis reprends.');
            $offset+=$length;
        } elseif(!is_file($base.'.part')) {atomic_write($base.'.part','');}
        if($offset===$expected){
            if(!@rename($base.'.part',$base.'.blob'))throw new FleuryError(507,'Impossible de terminer la sauvegarde.');
            atomic_write($base.'.json',json_encode(['name'=>$a['filename'],'size'=>$expected,'savedAt'=>gmdate(DATE_ATOM)],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE));
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
