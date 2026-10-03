# MineDock

Gestionnaire desktop de serveurs Minecraft, local-first, en français et en anglais. **V1 bêta 0.1.0**, code original sous licence MIT.

## Installer sur Windows 11

Les versions téléchargeables sont regroupées dans les [releases GitHub](https://github.com/Bobydeluxe/MineDock/releases).

Les builds locaux se trouvent dans `release/` :

- `MineDock-0.1.0-Setup-x64.exe` : installateur par utilisateur ;
- `MineDock-0.1.0-Portable-x64.exe` : exécutable sans installation ;
- `win-unpacked/MineDock.exe` : application décompressée pour diagnostic.

Ces builds ne sont pas signés. Aucun compte cloud, Node ou installation manuelle de Java n’est nécessaire pour les utiliser. Le runtime Java adapté est téléchargé au premier besoin. La version portable utilise elle aussi un dossier de données persistant dans le profil utilisateur ; elle ne met pas les mondes à côté de l’exécutable.

1. Lancez MineDock et terminez l’assistant.
2. Créez un serveur Paper ou Vanilla, choisissez la version et la RAM.
3. Lisez et acceptez vous-même l’EULA Minecraft dans l’assistant.
4. Démarrez le serveur, attendez le statut « En ligne », puis connectez votre client de la même version à l’adresse affichée.
5. Utilisez les onglets Console, Joueurs, Fichiers, Sauvegardes et Paramètres.

MineDock doit rester ouvert pour superviser les serveurs et exécuter les tâches. Sa fermeture arrête les serveurs proprement. Le premier démarrage de Paper peut télécharger des fichiers Minecraft supplémentaires. Une fois le serveur complètement installé et démarré une première fois, son administration locale ne dépend pas d’Internet.

## Fonctions réellement implémentées

- Electron avec renderer isolé, React, TypeScript strict, Vite, Tailwind et SQLite avec migration versionnée.
- Installation Vanilla / Paper depuis leurs catalogues officiels ; snapshots masqués, builds Paper stables uniquement et reprise d’installation incomplète depuis l’interface.
- Runtimes Temurin isolés et détection de Java ; exigences Java distinctes pour Mojang et Paper.
- Processus indépendants, start / stop / restart, détection des crashes et redémarrages bornés.
- Console live virtualisée, recherche, filtres, copier, historique de commandes et RCON authentifié.
- Liste de joueurs et commandes kick / ban / op / deop / whitelist.
- Édition graphique de `server.properties`, RAM et runtime par serveur.
- Navigation de fichiers confinée, éditeur texte, validation JSON, import/export de fichiers, création de dossiers et suppression confirmée.
- ZIP complets avec SHA-256, sauvegardes live avec `save-off` / `save-all flush` / `save-on`, restauration préparée dans un dossier temporaire, sauvegarde préalable et restauration des métadonnées plugins.
- Tâches persistantes à intervalle : sauvegarde, start, stop, restart, commande. Les reprises manquées sont regroupées en une exécution.
- Plugins Modrinth compatibles Paper, dépendances obligatoires et versions épinglées, activation/désactivation serveur arrêté.
- CPU / RAM du vrai processus Java, historique limité à 7 jours, taille des serveurs, audit et logs de l’application séparés.
- Préférences FR / EN, thème clair / sombre / système et inhibition temporaire de veille optionnelle.
- Suppression d’un serveur vers une corbeille locale, avec conservation des fichiers.

Les sauvegardes manuelles ne sont jamais purgées automatiquement. La V1 plafonne les archives à 64 Go non compressés et l’éditeur à 2 Mo. Les fichiers d’un serveur actif sont consultables mais les modifications sont réservées au serveur arrêté.

## Développement

Node **24+**, pnpm **11+**. La compilation Windows s’effectue sur Windows ; macOS et Linux ont leurs propres jobs CI.

```sh
pnpm install
pnpm dev
pnpm dev:mock
pnpm test
pnpm test:ui
pnpm lint
pnpm typecheck
pnpm build
pnpm build:windows
```

`dev` lance le vrai desktop et ses services locaux. `dev:mock` lance un navigateur avec des données **explicitement simulées** ; il ne gère aucun vrai serveur. Redémarrez `dev` après un changement du main process ou du preload ; Vite recharge le renderer automatiquement.

```sh
pnpm test:live      # Téléchargements réels, Java, bootstrap Paper avec eula=false
pnpm test:packaged  # Test du binaire Windows après build:windows
pnpm build:linux
pnpm build:mac
```

Les tests UI utilisent Edge sous Windows et Chromium sous Linux/macOS. Sur ces derniers systèmes : `pnpm exec playwright install --with-deps chromium`. Les tests desktop sur Linux doivent s’exécuter sous un affichage graphique ou Xvfb. Aucun test n’accepte l’EULA d’un vrai serveur à votre place.

## Architecture

```text
apps/desktop/       main Electron, preload, React, assets originaux
packages/domain/    types, validation, propriétés, erreurs
packages/core/      services d’application, événements, fichiers, logs, scheduler
packages/database/  repository SQLite, migrations
packages/minecraft/ versions et téléchargements
packages/runtime-manager/  runtimes Temurin
packages/server-core/      supervisor, métriques
packages/rcon/      protocole RCON
packages/backups/   archives et restauration
packages/marketplace/       Modrinth
packages/security/ chemins et secrets
packages/networking/       ports et réseau local
tests/             tests unitaires, intégration, UI
docs/              décisions, sécurité, validation et feuille de route
```

Consultez [l’architecture](docs/architecture.md), [la sécurité](docs/security.md), [les validations](docs/validation.md) et [les limites de la V1](docs/roadmap.md).

## Aperçu

![Tableau de bord MineDock, données de démonstration](docs/screenshots/dashboard-demo.png)

L’image ci-dessus présente le mode démo, annoncé par une bannière. Une installation neuve démarre avec une liste de serveurs vide.

## Références fonctionnelles

[Minecraft Server Manager](https://github.com/anefzaoui/minecraft-server-manager) et [PocketMC](https://pocketmc.github.io/) ont été étudiés uniquement pour leur philosophie et leurs fonctions publiques. Aucun code, asset, logo ou texte de ces projets n’a été repris. MineDock n’est pas affilié à Mojang, Microsoft ou PaperMC.
