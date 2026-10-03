# Validation de MineDock 0.1.0

Validation locale effectuée le **3 octobre 2026**, sous Windows 11 x64. Cette livraison est une bêta du gestionnaire local Paper / Vanilla ; son périmètre précis figure dans [la feuille de route](roadmap.md).

## Contrôles de code et de construction

| Contrôle                                       | Résultat                                   |
| ---------------------------------------------- | ------------------------------------------ |
| TypeScript strict, `pnpm typecheck`            | Réussi                                     |
| ESLint, `pnpm lint`                            | Réussi                                     |
| Vitest, `pnpm test`                            | 52 tests réussis dans 5 fichiers           |
| Playwright, `pnpm test:ui`                     | 2 parcours réussis                         |
| Exécutable empaqueté, `pnpm test:packaged`     | Premier lancement Electron réussi          |
| Compilation et packaging, `pnpm build:windows` | Installateur NSIS et portable x64 produits |

Les tests unitaires et d’intégration couvrent notamment SQLite, le chiffrement, les chemins confinés, les liens de fichiers, le parseur de propriétés, les ports réservés, les téléchargements et leurs empreintes, les redirections, les ZIP malveillants, RCON fragmenté, les dépendances Modrinth, les sauvegardes live, la restauration et son retour arrière, les tâches et la limitation des redémarrages après crash. Les processus de ces tests sont de petits programmes Node dédiés ; ils ne sont pas des serveurs Minecraft jouables.

Le parcours Electron utilise le vrai main process, le preload et SQLite dans un dossier temporaire : premier lancement, diagnostic, préférences, dashboard vide, langue et isolation du renderer. Le second parcours utilise le **mode démo explicitement annoncé** : création, start, console, stop, sauvegarde, paramètres et restauration. Les captures ont été inspectées ; le test Electron vérifie aussi les couleurs finales du thème sombre.

## Vérifications avec les services réels

Le script `pnpm test:live` a accédé aux catalogues officiels : 103 releases Vanilla et 55 versions Paper lors de ce contrôle. Il a téléchargé un runtime Temurin Java 21 et Paper **1.21.11, build 132**, vérifié leurs empreintes puis lancé le véritable bootstrap Java / Paper. Le démarrage a atteint le contrôle EULA avec `eula=false`. Une recherche Modrinth de plugins compatibles a également retourné des résultats réels.

L’empreinte SHA-256 de ce JAR Paper était :

```text
5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba
```

Le résultat machine est conservé dans `data/live-smoke/result.json` sur le poste de validation, dossier ignoré par Git. Aucun test n’accepte l’EULA d’un serveur réel au nom de son propriétaire.

## Limites de cette validation

Le [workflow GitHub Validate](https://github.com/Bobydeluxe/MineDock/actions/runs/37150089013) a également réussi le 3 octobre 2026 sur Ubuntu : installation des dépendances, lint, TypeScript, tests unitaires/d’intégration, compilation et deux parcours d’interface sous Xvfb. Cette validation du code et de l’interface ne valide pas à elle seule les packages AppImage/deb/DMG, les runtimes Java sur ces OS ou une session de jeu.

- Une connexion depuis un véritable client Minecraft et une session de jeu restent à valider après acceptation personnelle de l’EULA dans l’assistant.
- Les binaires Windows sont non signés, comme confirmé par `Get-AuthenticodeSignature`. L’installation NSIS sur le système hôte n’a pas été exécutée pendant les tests.
- Linux, macOS, arm64 et les anciennes versions Minecraft nécessitent leurs propres validations ; leurs configurations de build ne constituent pas une preuve de fonctionnement.
- Les scénarios de coupure électrique, disque plein et serveurs de grande taille n’ont pas fait l’objet d’un essai de charge prolongé.

Les distributions incluent la licence du projet et les [mentions des dépendances](THIRD_PARTY_NOTICES.md). Les empreintes des deux distributions finales se trouvent dans `release/SHA256SUMS.txt`.
