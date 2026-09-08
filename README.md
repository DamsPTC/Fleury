# Discord Media Extractor Mobile

*Mobile-friendly, self-hosted Discord media extractor and downloader. Archive channel images, videos and audio; browse private previews and download ZIP batches. PHP, with no Node.js server required.*

**Archivez les pièces jointes de vos salons Discord sur votre hébergement, puis consultez et téléchargez vos médias depuis votre navigateur.**

Discord Media Extractor Mobile est une application web auto-hébergée en PHP, avec une interface en français adaptée au mobile. Elle permet de parcourir les salons accessibles à votre compte et de conserver leurs photos, vidéos et fichiers audio dans une bibliothèque privée.

Le code peut être publié sur GitHub ; chaque installation reste un espace personnel protégé par un mot de passe. Cette version ne propose pas de comptes utilisateurs séparés ni d’isolation entre plusieurs personnes utilisant une même installation.

## Fonctionnalités

- Sélection du serveur et du salon ; saisie d’un identifiant pour les fils ou salons absents de la liste.
- Parcours paginé de l’historique et inventaire des pièces jointes.
- Sauvegarde sur l’hébergement par morceaux, reprise des fichiers incomplets et détection des fichiers déjà sauvegardés.
- Adaptation à la taille réelle annoncée par le CDN, avec vérification de la position et de la longueur de chaque morceau.
- Compteurs distincts pour les réussites et les échecs, nouvelles tentatives et bouton pour réessayer uniquement les fichiers échoués.
- Bibliothèque avec origine serveur/salon, recherche, filtres et tri par date de sauvegarde, nom ou taille.
- Aperçus des images et lecteurs vidéo/audio pour les formats pris en charge par le navigateur.
- Pagination de 24, 48 ou 96 médias, navigation précédent/suivant et accès direct à une page.
- Sélection de médias sur plusieurs pages ou préparation de tous les résultats filtrés.
- Téléchargement des sauvegardes en ZIP sans compression, par lots de **100 fichiers et 1 Gio maximum**. Les fichiers plus gros sont proposés séparément.
- Téléchargement depuis Discord en lots navigateur d’environ **32 Mio** ; les fichiers plus volumineux passent d’abord par le stockage privé du site.

## Prérequis

- Un hébergement avec **PHP 8.2 ou supérieur**, les sessions PHP, les extensions **cURL** et **Hash**, et des connexions HTTPS sortantes vers Discord et son CDN.
- Un domaine ou sous-domaine disposant d’un certificat **HTTPS** valide.
- Un serveur **Apache ou LiteSpeed** autorisant les règles `.htaccess` fournies, notamment `mod_rewrite` et les restrictions d’accès.
- Un dossier inscriptible par PHP **hors de la racine publique** pour les médias, la configuration et les sessions.
- Un navigateur récent avec JavaScript activé.

La version PHP ne nécessite ni Composer, ni compilation JavaScript, ni processus Node.js, ni extension `ZipArchive` en production. Elle peut être installée sur un hébergement mutualisé compatible, notamment Hostinger. Avec Nginx ou un serveur ignorant `.htaccess`, les restrictions d’accès doivent être transposées dans la configuration du serveur avant la mise en ligne.

## Installation

1. Créez votre copie du dépôt avec **Fork**, ou téléchargez son contenu.
2. Dans votre panneau d’hébergement, activez PHP 8.2 ou supérieur, cURL et HTTPS.
3. Déployez les fichiers suivants à la racine publique du domaine, souvent appelée `public_html`. Conservez leur arborescence et incluez les fichiers cachés :
   - `index.php`, `api.php`, `download.php`, `media.php` ;
   - les dossiers `backend/` et `assets/`, avec leur contenu ;
   - `.htaccess` et `.user.ini`.
4. Ouvrez **`https://votre-domaine.example/`**. À la première visite, l’application crée par défaut le dossier `fleury-private` à côté de la racine publique.
5. Depuis le gestionnaire de fichiers de votre hébergeur, ouvrez **`fleury-private/setup-code.txt`**. Copiez le code dans le formulaire d’installation, puis choisissez un mot de passe propre au site, de 12 à 72 octets. Ce mot de passe est distinct de celui de Discord.
6. Entrez dans votre espace privé, puis configurez la connexion Discord si vous souhaitez importer des médias.

Le code d’installation est généré sur l’hébergement et supprimé une fois l’accès créé. Il n’est ni inclus dans le dépôt ni affiché aux visiteurs.

Si PHP ne peut pas créer le dossier privé, créez-le manuellement **à côté de `public_html`**, avec les droits d’écriture nécessaires pour PHP. Ne le placez pas dans le dossier public. Pour un autre emplacement, utilisez `FLEURY_DATA_DIR` ci-dessous.

### Déploiement Git depuis Hostinger

Dans le panneau de votre hébergement, configurez le déploiement depuis **votre dépôt et votre branche**, vers le dossier public de votre domaine. Les fichiers PHP doivent arriver directement à cette racine, sans dossier intermédiaire. Aucune commande de compilation n’est nécessaire.

Après une mise à jour, relancez le déploiement et rechargez la page. Le dossier privé doit être conservé : il contient vos données et reste indépendant du code déployé.

## Utilisation

### Importer des médias

1. Connectez-vous à votre installation avec le mot de passe du site.
2. Dans l’onglet **Depuis Discord**, saisissez votre jeton personnel. Une aide Safari/Web Inspector est accessible à côté du champ.
3. Sélectionnez un serveur et un salon, ou renseignez l’identifiant d’un salon ou fil accessible à votre compte.
4. Lancez **Rechercher tous les médias**, puis choisissez la sauvegarde sur l’hébergement ou le téléchargement sur votre appareil.
5. Gardez l’onglet ouvert pendant les transferts. Utilisez **Pause**, puis la reprise ou les nouvelles tentatives si nécessaire.

La connexion actuelle utilise un jeton de compte personnel ; ce n’est pas une connexion OAuth2 ni un compte bot. [Discord interdit l’automatisation des comptes personnels et indique qu’elle peut entraîner la fermeture du compte](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots). Le projet n’est pas affilié à Discord. Utilisez uniquement des médias auxquels vous avez accès et que vous êtes autorisé à conserver.

### Consulter et télécharger les sauvegardes

Ouvrez **Sur le site**. La bibliothèque reste disponible sans connexion Discord, tant que votre session sur le site est valide.

Filtrez par serveur ou salon, recherchez un nom, puis choisissez le tri et le nombre de médias par page. Les noms des anciennes sauvegardes sont complétés à partir du catalogue : chargez vos listes de serveurs et salons dans l’onglet Discord, puis actualisez la bibliothèque. Sans ces informations, l’identifiant du salon reste affiché.

Pour télécharger plusieurs médias, sélectionnez-les puis choisissez **Lots de la sélection**, ou utilisez **Lots de tous les résultats** pour prendre l’ensemble des résultats filtrés, y compris les autres pages. Un bouton est proposé pour chaque ZIP ; enregistrez chaque lot depuis votre navigateur. La sélection reste dans la page jusqu’à son rechargement.

## Configuration et stockage

Le projet portait auparavant le nom **Fleury**. Les identifiants techniques `fleury-private`, `FLEURY_DATA_DIR` et `FLEURY_STORAGE_LIMIT_BYTES` restent compatibles avec les installations existantes : le changement de nom ne nécessite pas de déplacer vos sauvegardes.


Ces réglages sont des **variables d’environnement du serveur PHP**. Le code ne charge pas automatiquement de fichier `.env`.

| Variable | Valeur par défaut | Rôle |
| --- | --- | --- |
| `FLEURY_DATA_DIR` | Dossier `fleury-private` à côté de la racine publique | Emplacement privé de la configuration, des sessions et des médias. Tout emplacement dans la racine publique est refusé. |
| `FLEURY_STORAGE_LIMIT_BYTES` | `10737418240` — 10 Gio | Plafond applicatif du dossier des médias, fichiers partiels compris. |

Le dossier privé contient notamment :

- `auth.json` : le hachage du mot de passe du site ;
- `sessions/` et `limits/` : les sessions et la limitation des tentatives de connexion ;
- `media/` : les fichiers sauvegardés, leurs métadonnées et les transferts incomplets ;
- `sources.json` : le catalogue des serveurs et salons ;
- `attachment-cache/` : les liens temporaires des pièces jointes, séparés par une empreinte dérivée de la session Discord.

Sauvegardez ce dossier privé avec les outils de votre hébergeur. Ne l’ajoutez jamais à Git et ne le rendez pas accessible par HTTP. Les fichiers `.blob` et leurs métadonnées `.json` doivent être conservés ensemble.

Pour réinitialiser le mot de passe, supprimez **uniquement `auth.json` et les fichiers de `sessions/`** depuis le gestionnaire de fichiers, puis rouvrez le site pour suivre à nouveau l’installation. Conservez `media/` et `sources.json`.

## Confidentialité et accès

Le jeton Discord reste dans `sessionStorage` pour l’onglet courant, ou en mémoire si ce stockage est indisponible. Il est effacé par la déconnexion Discord ou le verrouillage du site. Il transite en HTTPS par le serveur PHP vers Discord : utilisez une installation que vous contrôlez et dont vous avez vérifié le code. L’application ne l’enregistre pas dans ses fichiers, ses sessions PHP ou ses journaux applicatifs ; vérifiez aussi les éventuels outils de journalisation ajoutés par votre hébergeur.

Le mot de passe du site est haché. Les sessions utilisent un cookie HttpOnly, Secure et SameSite=Strict et expirent après 12 heures. Les opérations sont protégées par un jeton CSRF. Les aperçus et téléchargements des sauvegardes passent par des routes authentifiées ; les fichiers privés n’ont pas d’adresse publique directe.

## Limites et dépannage

- **Erreur 403 à l’ouverture du site** : vérifiez la présence de `index.php` et `.htaccess` directement à la racine publique, les droits d’accès, puis le cache éventuel de l’hébergeur.
- **Session expirée ou téléchargement refusé** : reconnectez-vous au site et rechargez la bibliothèque avant de réessayer.
- **Échecs de transfert** : consultez la liste des fichiers échoués, puis utilisez les nouvelles tentatives. Le diagnostic indique le statut HTTP, l’erreur cURL et les plages reçues, sans afficher le jeton ou l’URL signée.
- **Espace insuffisant** : vérifiez à la fois le plafond applicatif et le quota réel de l’hébergeur. Les quotas externes ne sont pas toujours détectables avant une erreur d’écriture.
- **Aperçu absent** : les codecs et formats lisibles dépendent du navigateur. Le téléchargement du fichier reste possible même sans aperçu.
- **Onglet fermé ou suspendu** : l’inventaire et la sélection ne sont pas persistants. Relancez l’inventaire après rechargement ; les sauvegardes et morceaux déjà écrits sur le serveur sont conservés. iOS peut suspendre les transferts en arrière-plan.
- **Média manquant** : seules les pièces jointes image, vidéo et audio sont inventoriées. Les liens externes, messages supprimés et salons inaccessibles ne sont pas récupérés. Les fils et publications de forums se parcourent séparément.

Les limites de durée, de bande passante et d’espace de votre hébergement s’appliquent aussi aux ZIP et aux gros fichiers. Les transferts peuvent également être interrompus ou refusés par Discord.

## Développement

| Emplacement | Rôle |
| --- | --- |
| `index.php` | Installation, connexion privée et interface |
| `api.php` | Inventaire Discord, sauvegardes et bibliothèque |
| `download.php`, `media.php` | Téléchargements privés et aperçus avec plages HTTP |
| `backend/bootstrap.php` | Configuration, sessions et contrôles d’accès |
| `backend/discord.php` | Accès Discord, cache des liens et transferts par morceaux |
| `backend/library.php`, `backend/archive.php` | Catalogue, filtres, pagination et ZIP en flux |
| `assets/` | Interface JavaScript et styles, sans compilation |
| `hostinger-checks/` | Vérifications de l’application PHP et de la file de sauvegarde |

Les sources React/Vinext historiques présentes dans le dépôt ne sont pas utilisées par l’installation PHP décrite ici. Ne lancez pas `npm run build` pour ce déploiement. Les éventuelles données d’une ancienne installation ne sont pas migrées automatiquement.

### Vérifications locales

```sh
php -l index.php
php -l api.php
php -l download.php
php -l media.php
node --check assets/app.js
node --test hostinger-checks/queue.test.mjs
```

Vérifiez également la syntaxe des fichiers PHP de `backend/` lorsque vous les modifiez.

Le test `hostinger-checks/integration.mjs` utilise les dépendances de développement optionnelles `@php-wasm/node` et `@php-wasm/universal`. Une fois celles-ci installées dans un environnement de test séparé, indiquez le chemin absolu de son dossier `node_modules` :

```sh
FLEURY_PHP_WASM_ROOT=/chemin/vers/node_modules node hostinger-checks/integration.mjs
```

Ces dépendances ne sont pas nécessaires sur l’hébergement. Les tests couvrent les sessions, les contrôles d’accès, les aperçus avec plages HTTP, les ZIP, les filtres, la pagination et la correction de taille avec reprise de transfert. Ils utilisent des données factices et ne valident ni un compte Discord réel ni la configuration de votre hébergeur.

### Signaler un problème

Ouvrez une issue avec les étapes de reproduction, le message d’erreur, la version PHP et le navigateur utilisé. Retirez tout jeton, cookie, code d’installation, URL signée ou média privé des captures et des journaux joints.
