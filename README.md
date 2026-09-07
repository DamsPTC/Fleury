# Fleury — Médias Discord

Application privée en français pour sélectionner un serveur et un salon, parcourir son historique et récupérer ses pièces jointes image, vidéo et audio.

## Fonctionnement

- Le jeton personnel Discord est saisi dans un champ masqué et conservé dans `sessionStorage` pour l'onglet courant. Il n'est jamais inclus dans les URL, les fichiers source, les cookies ou les journaux applicatifs. Déconnexion = effacement du jeton. Le navigateur peut restaurer une session après fermeture : utiliser Déconnecter pour un effacement explicite.
- Il transite en HTTPS vers le serveur via `x-discord-token`, puis est transmis exclusivement à l'API Discord. Le serveur ne le persiste pas. Ce n'est pas un flux OAuth officiel.
- Historique par pages de 100 messages, pagination des serveurs, gestion des réponses 429 avec attente et reprise, bouton Pause, reprise dans l'onglet tant que la page n'est pas rechargée.
- ZIP sans compression d'environ 32 Mio par lot, téléchargement explicite adapté à Safari. Les médias plus volumineux sont proposés individuellement. Les téléchargements navigateur utilisent des Blob : pour les très grosses vidéos et téléphones à mémoire limitée, privilégier la sauvegarde sur le site. Le lot précédent doit être enregistré avant de préparer le suivant.
- Sauvegarde en streaming dans un bucket R2 privé. Clé déterministe par utilisateur/salon/message/pièce jointe pour ignorer les doublons. Téléchargement ultérieur indépendant du jeton Discord.
- Les fichiers de threads/publications de forums nécessitent de saisir l'identifiant de chaque fil ; pas d'inclusion implicite des sous-fils. Les liens externes, aperçus intégrés sans pièce jointe et contenus supprimés sont exclus.
- Aucune simulation ou donnée de démonstration. Les erreurs d'accès à Discord sont montrées à l'utilisateur. Discord peut refuser une connexion personnelle même avec un jeton valide.

## Hébergement

Ce dépôt contient l'application Vinext/React avec un serveur Cloudflare Workers et un bucket R2, intégrée à Sites. GitHub héberge le code ; GitHub Pages ne peut pas exécuter ce serveur.

`npm ci` puis `npm run build` avec Node 22.13 ou supérieur. Le fichier `.openai/hosting.json` déclare `BUCKET` et l'identité du site. Le pipeline fourni génère le Worker et les actifs statiques. Déployer avec la compétence Sites ; aucun secret Discord n'est à configurer sur l'hébergement.

L'instance Sites est privée, réservée à son propriétaire. Les routes API exigent l'identité `oai-authenticated-user-id` validée et injectée par le dispatcher Sites. Ne pas héberger ce code tel quel sur un serveur public acceptant ce champ depuis les clients : un hébergement externe doit implémenter une authentification serveur vérifiée, supprimer les en-têtes d'identité entrants et connecter un stockage privé. Les fichiers ne sont jamais servis par des URLs publiques R2.

## Limites et sécurité

Discord interdit l'automatisation des comptes personnels et peut fermer le compte. L'application n'automatise ni challenge, ni CAPTCHA et ne contourne aucun droit d'accès. Utiliser uniquement pour les médias que l'on est autorisé à conserver.

Le jeton de session donne accès au compte Discord. Ne jamais le coller dans une conversation, un dépôt ou un site tiers non fiable. `sessionStorage` reste accessible au JavaScript de la page : ce n'est pas un coffre-fort chiffré. Aucune télémétrie ou script tiers n'est ajouté. Une politique CSP restreint les ressources à la même origine.

Les transferts s'exécutent pendant que l'onglet est ouvert ; la mise en veille sur iOS peut les suspendre. Les fichiers déjà sauvegardés restent présents, mais un rechargement recommence l'inventaire. Aucun travail asynchrone ne conserve le jeton sur le serveur.

Le stockage consomme le quota de l'hébergement ; des échecs sont affichés sans annoncer une sauvegarde réussie. L'inventaire complet utilise la mémoire du navigateur. Les historiques exceptionnellement grands et les fichiers individuels très volumineux sont soumis aux capacités du navigateur et de l'hébergeur.

## Validation

Compilation de production et tests ciblés des restrictions d'URL/identifiants et des archives ZIP. Les transferts Discord réels nécessitent la session personnelle de l'utilisateur et ne sont pas validés avec un compte de test. Aucun jeton réel n'est nécessaire à la compilation.
