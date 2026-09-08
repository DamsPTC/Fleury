<?php
declare(strict_types=1);
require __DIR__.'/backend/bootstrap.php';
$error='';$fatal=false;$setup=false;$logged=false;$csrf='';
try {
    start_session();setup_key();
    if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
        try{site_login((string)($_POST['password']??''),(string)($_POST['setup_code']??''));header('Location: ./',true,303);exit;}
        catch(FleuryError $e){$error=$e->getMessage();http_response_code($e->status);}
    }
    $setup=auth_config()===null;$logged=authenticated();$csrf=$_SESSION['csrf'];session_write_close();
}catch(Throwable $e){http_response_code(503);$fatal=true;$error=$e instanceof FleuryError?$e->getMessage():'Le serveur PHP ne peut pas initialiser le site. Utilise PHP 8.2 ou supérieur et vérifie les droits du dossier parent de public_html.';}
?><!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="csrf-token" content="<?=html($csrf)?>"><title>Discord Media Extractor Mobile — Archives privées</title><meta name="description" content="Extracteur de médias Discord pour mobile : photos, vidéos, audios, aperçus privés et téléchargements ZIP par lots sur votre hébergement."><link rel="icon" href="assets/favicon.svg?v=6"><link rel="stylesheet" href="assets/style.css?v=6"><script type="module" src="assets/app.js?v=6"></script></head>
<body><header class="topbar"><a class="brand" href="./"><span class="brand-icon" aria-hidden="true">DM</span><span class="brand-copy">Discord Media<span class="brand-subtitle">Extractor Mobile</span></span></a><span class="private">Espace privé</span></header>
<?php if(!$logged): ?>
<main class="workspace gate"><p class="eyebrow">TES MÉDIAS DISCORD SUR TON HÉBERGEMENT</p><h1><?=$setup?'Bienvenue chez toi.':'Ton espace privé.'?></h1><section class="panel connection">
<?php if($fatal): ?><h2>Configuration à terminer</h2><p class="error"><?=html($error)?></p>
<?php else: ?><h2><?=$setup?'Créer mon accès':'Ouvrir mes sauvegardes'?></h2>
<?php if($setup): ?><p>Dans le gestionnaire de fichiers Hostinger, ouvre <strong>fleury-private</strong>, à côté de <strong>public_html</strong>, puis copie le contenu de <strong>setup-code.txt</strong>.</p><p class="muted">Ce code prouve que tu gères l’hébergement. Il est supprimé après la création de ton accès.</p><?php endif; ?>
<form method="post" action="./"><input type="hidden" name="csrf" value="<?=html($csrf)?>">
<?php if($setup): ?><label for="setup-code">Code d’installation Hostinger</label><input id="setup-code" name="setup_code" type="password" autocomplete="off" required><?php endif; ?>
<label for="site-password"><?=$setup?'Choisis ton mot de passe du site':'Mot de passe du site'?></label><input id="site-password" name="password" type="password" autocomplete="<?=$setup?'new-password':'current-password'?>" <?=$setup?'minlength="12"':''?> maxlength="72" required><p class="muted">Ce mot de passe est distinct de ton mot de passe Discord.</p><button class="button primary" type="submit"><?=$setup?'Créer mon accès privé':'Ouvrir mes archives'?></button></form>
<?php if($error): ?><p class="error" role="alert"><?=html($error)?></p><?php endif; ?><?php endif; ?></section></main>
<?php else: ?>
<main id="workspace" class="workspace"><div class="heading"><div><p class="eyebrow">TES MÉDIAS, AU MÊME ENDROIT</p><h1>Du salon à tes fichiers.</h1><p class="intro">Photos, vidéos et audios, sur ton appareil ou ton hébergement.</p></div><button id="lock-site" class="button secondary">Verrouiller le site</button></div>
<div class="layout"><aside class="connection panel"><div class="section-number">01 <span>COMPTE DISCORD</span></div><h2 id="connection-title">Lier ton compte</h2><form id="connect-form"><label for="token">Ton jeton Discord</label><button id="open-token-help" class="text-button" type="button" aria-haspopup="dialog" aria-controls="token-help">Comment trouver mon jeton sur iPhone ?</button><input id="token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Colle ton jeton ici"><button id="connect" class="button primary" type="submit">Connecter / reprendre ma session</button></form><div id="account" hidden><strong id="account-name"></strong><p class="muted">Session de cet onglet</p><button id="disconnect" class="button secondary">Déconnecter et effacer le jeton</button></div><div class="session-note"><p>Le jeton reste dans la session de cet onglet. Il transite en HTTPS par le serveur sans être enregistré. La déconnexion l’efface.</p></div><p class="risk">Discord interdit l’automatisation des comptes personnels et peut fermer le compte.</p></aside>

<dialog id="token-help" aria-labelledby="token-help-title">
<div class="help-heading"><h2 id="token-help-title">Trouver mon jeton sur iPhone</h2><button id="close-token-help" class="button secondary" type="button" autofocus>Fermer</button></div>
<ol>
<li>Installe <a href="https://apps.apple.com/fr/app/web-inspector/id1584825745" target="_blank" rel="noopener noreferrer">Web Inspector, par And a Dinosaur</a>, puis active l’extension dans Réglages → Apps → Safari → Extensions (ou Réglages → Safari selon ta version d’iOS).</li>
<li>Dans Safari, ouvre <a href="https://discord.com/app" target="_blank" rel="noopener noreferrer">Discord Web</a>, demande la version pour ordinateur depuis le menu de la page, puis connecte-toi à ton compte.</li>
<li>Dans ce même onglet Discord, ouvre Web Inspector depuis le menu des extensions de Safari et autorise son accès à discord.com. Choisis <strong>Console</strong>. Si l’inspecteur ne s’ouvre pas, recharge la page.</li>
<li>Copie le code ci-dessous, colle-le dans la console de l’onglet Discord, puis exécute-le.</li>
<li>Copie le jeton affiché, reviens sur Discord Media Extractor Mobile et colle-le dans le champ « Ton jeton Discord ».</li>
</ol>
<p>Ce code lit la session de ton propre compte. Le jeton donne accès à ton compte : garde-le privé. Le bouton ci-dessous copie seulement le code.</p>
<label for="token-help-code">Code à exécuter dans l’onglet Discord</label>
<textarea id="token-help-code" readonly spellcheck="false" rows="12">(() =&gt; {
  const cadre = document.createElement(&quot;iframe&quot;);
  cadre.hidden = true;
  document.body.appendChild(cadre);

  try {
    const valeur = cadre.contentWindow.localStorage.getItem(&quot;token&quot;);

    if (!valeur) {
      console.log(&quot;Jeton absent du stockage local.&quot;);
      return;
    }

    let jeton = valeur;
    try { jeton = JSON.parse(valeur); } catch {}

    console.log(jeton);
  } catch {
    console.log(&quot;Lecture du stockage bloquée par le navigateur.&quot;);
  } finally {
    cadre.remove();
  }
})();</textarea>
<button id="copy-token-code" class="button primary" type="button">Copier le code</button><p id="token-copy-status" role="status" aria-live="polite"></p>
<p class="muted">« Jeton absent » ou « Lecture bloquée » ? Vérifie que la console est ouverte sur Discord Web et que tu y es connecté. Cette méthode dépend du stockage utilisé par Discord et peut ne pas fonctionner.</p>
</dialog>
<section class="main-panel panel"><div class="tab-bar" role="tablist" aria-label="Source des médias"><button id="discord-tab" role="tab" aria-selected="true" aria-controls="discord-panel">Depuis Discord</button><button id="saved-tab" role="tab" aria-selected="false" aria-controls="saved-panel" tabindex="-1">Sur le site</button></div>
<div id="discord-panel" role="tabpanel" aria-labelledby="discord-tab"><div class="section-number">02 <span>SOURCE DES MÉDIAS</span></div><h2>Choisis où chercher.</h2><div class="selectors"><div><label for="guild">Serveur</label><select id="guild" disabled><option value="">Choisir un serveur</option></select></div><div><label for="channel">Salon</label><select id="channel" disabled><option value="">Choisir un salon</option></select></div></div><details class="manual"><summary>Un fil ou un salon manque dans la liste ?</summary><p>Colle son identifiant Discord. Chaque fil ou publication de forum se parcourt séparément.</p><div class="manual-row"><input id="manual" inputmode="numeric" aria-label="Identifiant du salon ou fil" placeholder="Identifiant du salon ou fil" disabled><button id="use-manual" class="button secondary" disabled>Utiliser</button></div><p id="manual-choice"></p></details>
<button id="scan" class="button primary scan" disabled>Rechercher tous les médias</button><div class="metrics"><div><strong id="media-count">0</strong><span>médias trouvés</span></div><div><strong id="media-size">0 ko</strong><span>volume estimé</span></div><div><strong id="message-count">0</strong><span>messages parcourus</span></div></div>
<div class="section-number">03 <span>DESTINATION</span></div><div class="destinations"><article><h3>Sur mon appareil</h3><p>ZIP par lots de 32 Mo. Les fichiers plus gros sont d’abord sauvegardés sur le site puis téléchargés individuellement.</p><button id="prepare" class="button secondary" disabled>Préparer le téléchargement</button><small id="prepared-count">0/0 médias préparés</small></article><article><h3>Sur mon hébergement</h3><p>Sauvegarde privée, par morceaux. Reprise des fichiers incomplets et détection des doublons.</p><button id="save" class="button secondary" disabled>Sauvegarder tous les médias</button><small id="saved-count">0/0 médias sauvegardés</small></article></div>
<section id="failures" hidden><h3>Fichiers à réessayer</h3><button id="retry-failed" class="button secondary" hidden>Réessayer uniquement les échecs</button><div id="failure-rows"></div></section>
<div id="inventory" class="media-list"><h3>Médias trouvés</h3><p id="empty" class="muted">Connecte ton compte et sélectionne un salon.</p><div id="media-rows"></div><button id="more-media" class="text-button" hidden>Afficher davantage</button></div></div>
<div id="saved-panel" role="tabpanel" aria-labelledby="saved-tab" hidden><div class="section-number">MES FICHIERS <span>STOCKAGE PRIVÉ</span></div><h2>Conservés chez toi.</h2><p class="muted">Les sauvegardes restent disponibles après la déconnexion de Discord.</p><button id="load-library" class="button secondary">Charger les sauvegardes</button>
<form id="library-filters" class="library-filters">
<div><label for="library-guild">Serveur d’origine</label><select id="library-guild"><option value="">Tous les serveurs</option></select></div>
<div><label for="library-channel">Salon d’origine</label><select id="library-channel"><option value="">Tous les salons</option></select></div>
<div><label for="library-query">Rechercher un média</label><input id="library-query" type="search" placeholder="Nom du fichier, serveur ou salon"></div>
<div><label for="library-sort">Trier par</label><select id="library-sort"><option value="newest">Sauvegardes récentes</option><option value="oldest">Sauvegardes anciennes</option><option value="name">Nom du fichier</option><option value="size">Taille décroissante</option></select></div>
<div><label for="library-limit">Médias par page</label><select id="library-limit"><option>24</option><option>48</option><option>96</option></select></div><button class="button secondary" type="submit">Appliquer les filtres</button>
</form>
<p id="library-summary" role="status"></p><p class="muted">Les anciennes sauvegardes affichent leur identifiant de salon. Charge les serveurs et salons dans l’onglet Discord pour compléter leurs noms, puis actualise ici.</p>
<div class="library-actions"><button id="select-page" class="button secondary">Sélectionner cette page</button><button id="clear-selection" class="text-button">Effacer la sélection</button><button id="download-selection" class="button primary" disabled>Lots de la sélection (0)</button><button id="download-filtered" class="button secondary">Lots de tous les résultats</button></div>
<p class="muted">ZIP de 100 fichiers / 1 Go maximum par lot. Un fichier plus gros se télécharge séparément. Les aperçus vidéo et audio dépendent des formats lus par Safari.</p><div id="library-batches" aria-live="polite"></div>
<div id="library-rows" class="library-grid"></div>
<nav class="library-pagination" aria-label="Pages des sauvegardes"><button id="previous-library" class="button secondary" disabled>Précédente</button><label for="library-page">Page</label><input id="library-page" type="number" min="1" value="1" inputmode="numeric"><span id="library-pages">/ 1</span><button id="go-library" class="button secondary">Aller</button><button id="more-library" class="button secondary" hidden>Suivante</button></nav></div></section></div>
<section id="status" class="status panel" aria-live="polite" hidden><div id="activity" class="status-heading" hidden><span id="activity-label"></span><button id="pause" class="button secondary compact">Pause</button></div><progress id="progress" max="100" aria-label="Progression du transfert" hidden></progress><p id="message"></p><p id="error" class="error" role="alert"></p><div id="download-ready"></div></section>
<footer><span>Ton espace, tes sauvegardes.</span><p>Garde cette page ouverte pendant les transferts. Un rechargement recommence l’inventaire, mais conserve les fichiers déjà sauvegardés. Pièces jointes uniquement ; liens externes et messages supprimés exclus.</p></footer></main>
<?php endif; ?></body></html>
