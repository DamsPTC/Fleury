<?php
declare(strict_types=1);
function source_catalog(): array {
    $p=private_dir().'/sources.json';return is_file($p)?(json_decode((string)file_get_contents($p),true)?:[]):[];
}
function remember_sources(array $guilds=[],array $channels=[],string $guild=''): void {
    $lock=fopen(private_dir().'/sources.lock','c');if(!$lock||!flock($lock,LOCK_EX))throw new FleuryError(503,'Catalogue indisponible.');
    try{$data=source_catalog();foreach($guilds as $g)$data['guilds'][(string)$g['id']]=(string)$g['name'];
        foreach($channels as $c)$data['channels'][(string)$c['id']]=['channelId'=>(string)$c['id'],'channelName'=>(string)$c['name'],'guildId'=>(string)($c['guild_id']??$guild)];
        atomic_write(private_dir().'/sources.json',json_encode($data,JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE));
    }finally{flock($lock,LOCK_UN);fclose($lock);}
}
function source_for(string $key,?array $catalog=null): array {
    $catalog??=source_catalog();$id=explode('_',$key)[0];$source=$catalog['channels'][$id]??['channelId'=>$id,'channelName'=>'','guildId'=>''];
    $source['guildName']=$catalog['guilds'][$source['guildId']]??'';return $source;
}
function saved_metadata(string $key,array $a,int $size): array {
    return array_merge(['name'=>$a['filename'],'size'=>$size,'type'=>$a['content_type']??'','savedAt'=>gmdate(DATE_ATOM)],source_for($key));
}
function library_items(): array {
    $all=[];$dir=private_dir().'/media';$catalog=source_catalog();
    foreach(new DirectoryIterator($dir) as $f){
        if(!$f->isFile()||$f->getExtension()!=='json')continue;$key=$f->getBasename('.json');
        if(!preg_match('/^\d{16,22}_\d{16,22}_\d{16,22}$/D',$key)||!is_file($dir.'/'.$key.'.blob'))continue;
        $meta=json_decode((string)file_get_contents($f->getPathname()),true);if(!is_array($meta))continue;
        $source=source_for($key,$catalog);foreach($source as $k=>$v)if($v!==''||empty($meta[$k]))$meta[$k]=$v;
        $meta['key']=$key;$meta['size']=(int)filesize($dir.'/'.$key.'.blob');$meta['previewType']=preview_type((string)$meta['name']);$all[]=$meta;
    }return $all;
}
function library_page(array $b,bool $allResults=false): array {
    $all=library_items();$guilds=[];$channels=[];
    foreach($all as $m){$g=$m['guildId']?:'unknown';$guilds[$g]=['id'=>$g,'name'=>$m['guildName']?:($g==='unknown'?'Serveur non renseigné':$g)];
        if(empty($b['guild'])||$b['guild']===$g)$channels[$m['channelId']]=['id'=>$m['channelId'],'name'=>$m['channelName']?:'Salon '.$m['channelId']];}
    $q=strtolower(trim((string)($b['query']??'')));
    $filtered=array_values(array_filter($all,static function($m)use($b,$q){return (empty($b['guild'])||($m['guildId']?:'unknown')===$b['guild'])&&(empty($b['channel'])||$m['channelId']===$b['channel'])&&($q===''||str_contains(strtolower($m['name'].' '.$m['guildName'].' '.$m['channelName']),$q));}));
    $sort=$b['sort']??'newest';usort($filtered,static function($a,$b)use($sort){$v=match($sort){'oldest'=>strcmp($a['savedAt'],$b['savedAt']),'name'=>strnatcasecmp($a['name'],$b['name']),'size'=>$b['size']<=>$a['size'],default=>strcmp($b['savedAt'],$a['savedAt'])};return $v?:strcmp($a['key'],$b['key']);});
    if($allResults)return $filtered;
    $limit=in_array((int)($b['limit']??24),[24,48,96],true)?(int)($b['limit']??24):24;$total=count($filtered);$pages=max(1,(int)ceil($total/$limit));$page=min($pages,max(1,(int)($b['page']??1)));
    return ['items'=>array_slice($filtered,($page-1)*$limit,$limit),'page'=>$page,'pages'=>$pages,'total'=>$total,'allTotal'=>count($all),'guilds'=>array_values($guilds),'channels'=>array_values($channels),'cursor'=>null];
}
function preview_type(string $name): string {
    return match(strtolower(pathinfo($name,PATHINFO_EXTENSION))){'jpg','jpeg'=>'image/jpeg','png'=>'image/png','gif'=>'image/gif','webp'=>'image/webp','avif'=>'image/avif','mp4','m4v'=>'video/mp4','mov'=>'video/quicktime','webm'=>'video/webm','mp3'=>'audio/mpeg','m4a'=>'audio/mp4','ogg'=>'audio/ogg','wav'=>'audio/wav',default=>''};
}

function library_batches(array $b): array {
    $all=library_page($b,true);$batches=[];$keys=[];$bytes=0;
    foreach($all as $m){
        if($keys&&(count($keys)>=100||$bytes+$m['size']>1073741824)){$batches[]=['keys'=>$keys,'size'=>$bytes];$keys=[];$bytes=0;}
        if($m['size']>1073741824){$batches[]=['key'=>$m['key'],'name'=>$m['name'],'size'=>$m['size']];continue;}
        $keys[]=$m['key'];$bytes+=$m['size'];
    }
    if($keys)$batches[]=['keys'=>$keys,'size'=>$bytes];return ['batches'=>$batches,'total'=>count($all)];
}
