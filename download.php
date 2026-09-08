<?php
declare(strict_types=1);
require __DIR__.'/backend/discord.php';
require __DIR__.'/backend/archive.php';
try {
    start_session();
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')throw new FleuryError(405,'Méthode non autorisée.');
    if(!authenticated())throw new FleuryError(401,'Reconnecte-toi au site.');
    csrf_check(true);session_write_close();
    if(isset($_POST['keys'])){if(!is_string($_POST['keys'])||strlen($_POST['keys'])>8192)throw new FleuryError(400,'Lot invalide.');serve_archive(json_decode($_POST['keys'],true));}
    $key=stored_key($_POST['key']??null);$base=private_dir().'/media/'.$key;
    $meta=is_file($base.'.json')?json_decode((string)file_get_contents($base.'.json'),true):null;
    if(!$meta)throw new FleuryError(404,'Fichier introuvable.');
    serve_file($base.'.blob',$meta['name']);
}catch(FleuryError $e){respond(['error'=>$e->getMessage()],$e->status);}
catch(Throwable $e){respond(['error'=>'Téléchargement indisponible.'],500);}
