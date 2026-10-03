# Architecture et décisions

## État initial et périmètre

Le repository était vide. La première livraison implémente le cœur V1 : Java, Vanilla/Paper, processus natifs, administration locale et sécurité des données. Les fonctions avancées du cahier des charges sont listées explicitement dans `roadmap.md`. Aucun compte, cloud ou assistant IA n’est requis.

## Electron plutôt que Tauri pour la V1

Le main process Node embarqué réunit les flux de processus, TCP RCON, extraction de runtimes, streaming réseau et SQLite. Il évite un service Node externe ou une seconde implémentation Rust de ces services. Le workspace disposait déjà de Node 24 et pas de toolchain Rust. Cet avantage de livraison et de test justifie Electron malgré son empreinte mémoire plus élevée que Tauri. React ne dépend pas de ses API : tout passe par le contrat `Api` du preload.

La fenêtre utilise `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. Le preload expose seulement les méthodes nommées du contrat, jamais `ipcRenderer`, `fs`, un PID à manipuler ou une primitive d’exécution. Le main vérifie l’identité du renderer et son URL à chaque appel. Les pages externes ne sont jamais intégrées dans un renderer privilégié.

## Couches

- Domaine : DTO, Zod, parseur de propriétés, erreurs et états.
- Application : `AppCore` orchestre les services, sérialise les mutations par serveur et centralise l’audit.
- Infrastructure : processus, téléchargements, fichiers, SQLite et secrets.
- Présentation : composants React, dictionnaires FR/EN et thèmes. Le mock est activé uniquement par le mode Vite `mock`.

`ServerRunner`, `SecretStore`, `BackupStorageProvider` et `MarketplaceProvider` définissent des frontières pour les futures implémentations Docker, keychains, clouds et registres. Les implémentations V1 sont concrètes et testées ; les providers futurs n’ont pas de fonctions vides.

## Données

SQLite natif Node est embarqué dans Electron, sans module SQLite natif à recompiler. `migrations.ts` contient le SQL versionné ; `PRAGMA user_version` enregistre la version. `quick_check` vérifie la base, une copie précède une migration, puis une transaction applique le schéma. WAL et clés étrangères sont activés. Un snapshot cohérent de la base est créé à l’ouverture et toutes les heures.

Les tables contiennent profils, réglages, archives, tâches, événements, métriques, contenu installé, historique joueurs et runtimes. Les profils JSON sont typés côté application ; les index temporels permettent la rétention des métriques. Les fonctionnalités de comptes distants ajouteront leurs propres migrations quand elles seront implémentées.

## Événements et charge

Le bus fournit états, logs, métriques, progression et audit. Les envois de console vers le renderer sont groupés toutes les 100 ms et bornés à 500 lignes par envoi/serveur pour éviter l’accumulation IPC lors d’un flot excessif. Aucun serveur web administratif n’est démarré. Les métriques sont mesurées toutes les cinq secondes uniquement pour les processus actifs, persistées toutes les quinze secondes, agrégées à la lecture et retenues sept jours. Le client borne ses logs à 5 000 lignes et les virtualise. Java produit ses propres logs persistants sur disque.

## Sources vérifiées

- [Paper Downloads Service](https://docs.papermc.io/misc/downloads-service/) : API v3, User-Agent identifié, builds stables et SHA-256.
- [Exigences Java Paper](https://docs.papermc.io/paper/getting-started/) : recommandations distinctes de Mojang, jusqu’à Java 25 pour 26.1+.
- [Modrinth API](https://docs.modrinth.com/api/) : filtres version / loader / côté serveur et SHA-512.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

Mojang détermine directement `javaVersion.majorVersion` dans les métadonnées de la version. Le mapping historique n’est qu’un fallback.
