# Fleury — version Hostinger Premium

Le dépôt se déploie maintenant directement en **PHP 8.2 ou supérieur**, sur l’hébergement web Premium Hostinger. Il n’y a aucune compilation JavaScript, aucune dépendance Composer et aucun processus Node à lancer pour cette version.

## Déploiement sur letaulard.com

1. Dans Hostinger, vérifier **PHP 8.2 ou supérieur** et l’extension **cURL**.
2. Relancer le déploiement Git du dépôt `DamsPTC/Fleury`, branche `main`, dans le dossier du domaine (`public_html`). Les fichiers `index.php`, `api.php`, `download.php`, `.htaccess` et le dossier `assets` doivent être directement à la racine du site. Les fichiers cachés doivent être déployés également.
3. Ouvrir `https://letaulard.com/`. Le fichier `.htaccess` utilise `index.php` comme page d’accueil. Si le cache Hostinger conserve le 403 précédent, purger le cache du domaine.
4. À la première visite, ouvrir le **gestionnaire de fichiers Hostinger** (accès à tous les fichiers), remonter au dossier contenant `public_html`, puis ouvrir **`fleury-private/setup-code.txt`**. Copier son contenu dans le formulaire du site et choisir un mot de passe de 12 à 72 octets (maximum bcrypt). Ce n’est ni le mot de passe ni le jeton Discord.
5. Une fois entré dans le site, saisir le jeton Discord, sélectionner le serveur et le salon, puis rechercher les médias.

Le code d’installation est généré sur l’hébergement, jamais sur GitHub et jamais affiché au visiteur. Il est supprimé lorsque le mot de passe a été créé. Une personne qui ne possède pas l’accès au gestionnaire de fichiers ne peut pas initialiser l’espace à votre place.

Si PHP ne peut pas créer `fleury-private`, le site affiche une instruction : créer ce dossier manuellement **à côté de** `public_html`, avec les droits d’écriture du compte d’hébergement. Ne jamais le placer à l’intérieur de `public_html`. Un dossier personnalisé peut être défini via la variable serveur `FLEURY_DATA_DIR` ; l’application refuse tout emplacement dans la racine publique.

## Fonctionnalités

- La sauvegarde affiche le fichier effectivement en cours. Les interruptions temporaires déclenchent jusqu’à trois essais par morceau, avec des morceaux réduits à 1 Mio puis 512 Kio. Un fichier restant en échec est inscrit dans une liste et le parcours continue ; le bouton « Réessayer uniquement les échecs » permet de le reprendre. Les erreurs globales de session, d’espace disque ou de limitation prolongée arrêtent le parcours. Le compteur distingue les sauvegardes réussies des fichiers traités. La liste des échecs reste dans la page jusqu’au rechargement.
- Le diagnostic des morceaux indique le statut HTTP, le numéro d’erreur cURL, la position et le nombre d’octets reçus, sans révéler le jeton ou l’URL signée. Les réponses partielles plus courtes sont acceptées uniquement si leur plage et leur longueur sont cohérentes. Aucun morceau invalide n’est ajouté au fichier.


- Les liens signés reçus pendant l’inventaire sont conservés dans `fleury-private/attachment-cache`, séparés par une empreinte de session à sens unique (jamais le jeton lui-même). Le téléchargement utilise directement ces liens. Les liens expirés ou les entrées de plus d’une heure sont renouvelés via l’historique du salon, avec vérification exacte du message et de la pièce jointe, sans requête de lecture individuelle d’un message. Le dossier de cache peut être vidé sans supprimer les médias sauvegardés. Les inventaires lancés avant cette correction restent utilisables : les liens manquants sont récupérés à la demande.

- Jeton Discord dans `sessionStorage` pour l’onglet courant, effacé lors de la déconnexion Discord ou du verrouillage du site. Il transite en HTTPS via un en-tête vers PHP puis vers Discord, mais n’est stocké ni dans la session PHP, ni dans les fichiers, ni dans les journaux applicatifs.
- Pagination de tous les serveurs et de l’historique du salon, attente après les réponses Discord 429, pause et reprise dans l’onglet courant.
- ZIP navigateur sans compression par lots d’environ 32 Mio. Enregistrer le lot prêt avant de préparer le suivant.
- Médias supérieurs à 32 Mio : préparation sur le stockage privé du site, puis téléchargement natif du navigateur (aucun Blob géant en mémoire sur iPhone). Ces médias restent ensuite dans les sauvegardes.
- Sauvegarde locale sur Hostinger, par morceaux de 4 Mio, avec contrôle de la réponse HTTP Range et de la longueur reçue, reprise des fichiers partiels et détection des doublons. Un morceau interrompu n’est pas publié comme fichier terminé.
- Téléchargement des sauvegardes par une route PHP authentifiée, sans jeton Discord, sans adresse publique des fichiers, et sans chargement intégral dans la mémoire de PHP.
- Pièces jointes image, vidéo et audio uniquement. Les liens externes et médias supprimés ne sont pas récupérables. Les fils et publications de forums se sélectionnent séparément avec leur identifiant.

## Accès et stockage

Le site possède un unique accès privé protégé par le mot de passe créé lors de l’installation. Le mot de passe est haché avec `password_hash`; le cookie de session est HttpOnly/Secure/SameSite=Strict. Les opérations utilisent un jeton CSRF. Les sessions expirent après 12 heures. Une limitation de tentatives protège le formulaire de connexion.

`fleury-private` contient les sessions, le hachage du mot de passe et les médias. Ce dossier est hors de la racine publique et ne fait pas partie du dépôt : un redéploiement du code ne doit pas l’effacer. Sauvegarder ce dossier via Hostinger. Pour réinitialiser le mot de passe, supprimer **uniquement `auth.json` et les fichiers du sous-dossier `sessions`** depuis le gestionnaire Hostinger puis rouvrir le site pour obtenir un nouveau code d’installation. Ne pas supprimer `media`.

Le stockage est plafonné par défaut à **10 Gio** pour éviter de remplir tout l’hébergement. La variable serveur optionnelle `FLEURY_STORAGE_LIMIT_BYTES` permet de changer cette limite. Les fichiers partiels comptent dans le quota. Les fichiers `.part` abandonnés peuvent être supprimés depuis le gestionnaire Hostinger si une sauvegarde n’est plus souhaitée. L’application vérifie aussi l’espace disque disponible. Elle ne peut pas garantir qu’une limite de quota imposée séparément par Hostinger sera connue avant une erreur d’écriture.

Garder la page ouverte pendant les opérations. iOS peut suspendre un onglet en arrière-plan. Un rechargement recommence l’inventaire ; les fichiers terminés et les morceaux sauvegardés sur le serveur sont conservés. La durée et les limites de l’hébergeur s’appliquent, et Discord peut refuser certains téléchargements par morceaux ou les sessions de comptes personnels.

Discord interdit l’automatisation des comptes personnels et peut fermer le compte. Aucun CAPTCHA ni restriction d’accès n’est contourné. Aucun jeton ne doit être envoyé dans une conversation ou ajouté au dépôt.

## Vérification et structure

- Entrées PHP : `index.php`, `api.php`, `download.php`.
- Backend : `backend/bootstrap.php` et `backend/discord.php`.
- Interface sans compilation : `assets/app.js`, `assets/zip.js`, `assets/style.css`.
- `hostinger-checks/integration.mjs` teste le vrai PHP 8.2 via le runtime optionnel `@php-wasm/node` / `@php-wasm/universal` : affichage, installation protégée, mot de passe haché, sessions, CSRF, bibliothèque privée, téléchargement, chemins invalides, hôtes CDN et déconnexion. Le runtime de test n’est pas une dépendance de production. `FLEURY_PHP_WASM_ROOT` peut désigner le `node_modules` où il est installé.
- Vérification PHP standard : `php -l index.php`, idem pour les autres fichiers PHP. Vérification JavaScript : `node --check assets/app.js`.
- Les échanges réels avec Discord nécessitent le jeton personnel saisi sur le site. Les tests ne prétendent pas valider un compte Discord réel ni la configuration Apache/LiteSpeed de Hostinger.

Les sources React/Vinext précédentes (`app`, `worker`, `.openai`, etc.) restent disponibles pour l’instance Sites déjà publiée. **Elles ne sont pas exécutées par la version Hostinger** ; aucune donnée du stockage Sites n’est automatiquement transférée vers Hostinger. Les règles `.htaccess` bloquent leur consultation HTTP. Ne pas utiliser `npm run build` pour le déploiement PHP décrit ici.
