# Sécurité V1

## Frontières

L’application est locale et utilise les droits du compte OS. Elle ne démarre aucun panneau web, API publique, tunnel ou WebSocket réseau. L’IPC vérifie renderer, frame principale et URL exacte ; les entrées sont validées par Zod. Les commandes Java passent par `spawn` avec un tableau d’arguments et `shell:false`.

Les commandes RCON libres sont un pouvoir d’administration du serveur. L’UI ne peut pas injecter un shell. Les actions d’arrêt et de suspension des sauvegardes sont réservées aux services sérialisés. Les tâches persistantes servent le même compte local et ne sont pas une interface pour visiteurs distants.

## Fichiers et archives

Les chemins absolus, `..`, octets nuls, ADS Windows, noms de périphériques et chemins ambigus sont refusés. Chaque parent existant est vérifié par `lstat` et `realpath` ; liens symboliques/junctions sont bloqués dans le navigateur de fichiers et les ZIP. Les restaurations utilisent une zone de préparation ; un fichier ZIP ne peut pas écraser un fichier hors de cette zone. Les collisions d’entrées sont refusées, avec plafonds de taille et de nombre de fichiers.

Les contrôles supposent que le compte OS et les plugins Java installés sont de confiance. Les plugins exécutent du code avec les droits du compte, comme dans tout serveur natif Minecraft ; ce n’est pas une isolation Docker. Un acteur local qui peut modifier simultanément les dossiers peut toujours agir hors de l’application. Une future isolation devra traiter ce risque explicitement.

## Réseau et téléchargement

HTTPS uniquement, liste fixe d’hôtes officiels et CDNs, contrôle de chaque redirection, timeouts, tailles maximales, fichiers temporaires, checksum avant renommage. Les catalogues utilisent un retry borné. L’installation du contenu ne contourne pas les exigences version/loader/côté serveur. Le téléchargement d’un plugin ne remplace pas un fichier non suivi existant.

Le serveur Minecraft est accessible sur le LAN quand `server-ip` est vide. Minecraft utilise aussi ce bind pour RCON : son port **ne doit jamais être redirigé sur Internet**. MineDock se connecte à RCON uniquement via loopback et utilise un mot de passe aléatoire de 256 bits. Pour un usage strictement local, définissez `server-ip=127.0.0.1`. MineDock ne modifie pas le pare-feu ni la box automatiquement.

## Secrets

Le secret RCON dans SQLite est chiffré avec Electron safeStorage lorsque le keychain OS est disponible. Le fallback est AES-256-GCM avec une clé locale de 32 octets et des permissions restrictives sur Unix. Sous Windows, le fallback hérite des ACL du profil utilisateur. La clé locale doit être protégée et conservée pour récupérer les secrets.

Le fichier `server.properties` doit contenir le mot de passe en clair parce que Minecraft l’exige. Il est protégé par les permissions du dossier ; l’éditeur graphique et l’éditeur de fichiers le masquent. Les sauvegardes produites par MineDock enlèvent `rcon.password` et le réinjectent au restore. L’export brut de ce fichier est refusé. Les configurations de plugins peuvent contenir leurs propres secrets : elles font partie de la sauvegarde complète et doivent être traitées comme sensibles.

L’audit ne contient ni mot de passe, ni texte de commandes libres susceptible de contenir des secrets. Les logs exposés par la console sont nettoyés. Les logs Minecraft originaux appartiennent au serveur Java ; MineDock ne peut pas garantir qu’un plugin n’y écrive pas de données sensibles.

## Données et distribution

La suppression d’un serveur conserve une copie en corbeille. Aucune purge automatique des archives manuelles n’est appliquée. Une sauvegarde précède les réglages majeurs, la suppression de fichiers, l’installation de plugins et les restaurations. Des copies SQLite cohérentes sont produites régulièrement. Ne supprimez pas le dossier des données avec la seule clé de chiffrement.

Les builds bêta sont non signés. Les comptes distants, RBAC et tokens publics restent désactivés jusqu’à leur implémentation et leur audit dédiés.
