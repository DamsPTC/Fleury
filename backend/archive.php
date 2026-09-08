<?php
declare(strict_types=1);
// ZIP STORE with data descriptors: bounded memory, no ZipArchive extension or temp ZIP.
function serve_archive(mixed $keys): never {
    if(!is_array($keys)||!count($keys)||count($keys)>100)throw new FleuryError(400,'Choisis entre 1 et 100 fichiers par lot.');
    $keys=array_values(array_unique($keys));$files=[];$size=0;$length=22;
    foreach($keys as $key){
        $key=stored_key($key);$base=private_dir().'/media/'.$key;
        $m=is_file($base.'.json')?json_decode((string)file_get_contents($base.'.json'),true):null;
        if(!$m||!is_file($base.'.blob')||!is_readable($base.'.blob'))throw new FleuryError(404,'Un fichier du lot est introuvable. Recharge les sauvegardes.');
        $n=(int)filesize($base.'.blob');$size+=$n;if($size>1073741824)throw new FleuryError(413,'Ce lot dépasse 1 Go. Réduis la sélection ou utilise les lots automatiques.');
        $name=explode('_',$key)[2].'-'.clean_name($m['name']);$files[]=['path'=>$base.'.blob','size'=>$n,'name'=>$name];$length+=30+strlen($name)+$n+16+46+strlen($name);
    }
    @set_time_limit(0);header('Content-Type: application/zip');header('Content-Length: '.$length);header('Content-Disposition: attachment; filename="discord-media-'.gmdate('Ymd-His').'.zip"');
    $central='';$offset=0;
    foreach($files as $file){
        $name=$file['name'];$n=$file['size'];$flags=0x0808;
        echo pack('VvvvvvVVVvv',0x04034b50,20,$flags,0,0,33,0,0,0,strlen($name),0).$name;
        $f=fopen($file['path'],'rb');$hash=hash_init('crc32b');$left=$n;
        while($left>0){if(connection_aborted()){fclose($f);exit;}$chunk=fread($f,min(1048576,$left));if($chunk===false||$chunk===''){fclose($f);exit;}hash_update($hash,$chunk);$left-=strlen($chunk);echo $chunk;flush();}fclose($f);
        $crc=(int)hexdec(hash_final($hash));echo pack('VVVV',0x08074b50,$crc,$n,$n);
        $central.=pack('VvvvvvvVVVvvvvvVV',0x02014b50,20,20,$flags,0,0,33,$crc,$n,$n,strlen($name),0,0,0,0,0,$offset).$name;
        $offset+=30+strlen($name)+$n+16;
    }
    echo $central.pack('VvvvvVVv',0x06054b50,0,0,count($files),count($files),strlen($central),$offset,0);exit;
}
