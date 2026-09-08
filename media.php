<?php
declare(strict_types=1);
require __DIR__.'/backend/discord.php';
try{
    start_session();if(!in_array($_SERVER['REQUEST_METHOD']??'',['GET','HEAD'],true))throw new FleuryError(405,'Méthode non autorisée.');
    if(!authenticated())throw new FleuryError(401,'Reconnecte-toi au site.');
    if(($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='cross-site')throw new FleuryError(403,'Requête externe refusée.');
    session_write_close();$key=stored_key($_GET['key']??null);$base=private_dir().'/media/'.$key;
    $meta=is_file($base.'.json')?json_decode((string)file_get_contents($base.'.json'),true):null;
    if(!$meta||!is_file($base.'.blob'))throw new FleuryError(404,'Fichier introuvable.');
    $type=preview_type($meta['name']);if(!$type)throw new FleuryError(415,'Aperçu non pris en charge.');
    $size=(int)filesize($base.'.blob');$start=0;$end=$size-1;$range=$_SERVER['HTTP_RANGE']??'';
    if($range!==''){
        if(!preg_match('/^bytes=(\d*)-(\d*)$/D',$range,$m)||($m[1]===''&&$m[2]==='')){header('Content-Range: bytes */'.$size);throw new FleuryError(416,'Plage invalide.');}
        if($m[1]===''){$start=max(0,$size-(int)$m[2]);}else{$start=(int)$m[1];if($m[2]!=='')$end=min($end,(int)$m[2]);}
        if($start>$end||$start>=$size){header('Content-Range: bytes */'.$size);throw new FleuryError(416,'Plage invalide.');}
        http_response_code(206);header("Content-Range: bytes $start-$end/$size");
    }
    header('Content-Type: '.$type);header('Accept-Ranges: bytes');header('Content-Length: '.max(0,$end-$start+1));header('Content-Disposition: inline');
    if(($_SERVER['REQUEST_METHOD']??'')==='HEAD')exit;
    $f=fopen($base.'.blob','rb');fseek($f,$start);$left=$end-$start+1;
    while($left>0&&!feof($f)&&!connection_aborted()){$chunk=fread($f,min(1048576,$left));$left-=strlen($chunk);echo $chunk;flush();}fclose($f);exit;
}catch(FleuryError $e){respond(['error'=>$e->getMessage()],$e->status);}catch(Throwable $e){respond(['error'=>'Aperçu indisponible.'],500);}
