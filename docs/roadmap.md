# Périmètre et limites honnêtes de la bêta

Le cœur local V1 est implémenté. Les fichiers `plan.md` et `validation.md` décrivent ce qui est exécuté et testé.

## Avant une V1 stable publique

- Faire le parcours de connexion avec un vrai client Minecraft après consentement EULA du propriétaire. Les tests live de cette livraison s’arrêtent volontairement avant ce consentement.
- Valider plusieurs versions historiques Vanilla/Paper, Linux, macOS et architectures arm64 sur leurs OS.
- Ajouter la reprise des téléchargements à partir d’un offset, la récupération automatique de staging après coupure et les annulations de jobs longues. La reprise d’une installation incomplète depuis le bouton Réessayer est implémentée, avec version/build épinglés.
- Élargir les tests de démarrage forcé, de crash répété et de disque plein.
- Mettre en place certificats, signatures et canal de mises à jour vérifiées.
- Préparer audit indépendant et politiques de rétention configurables.

## Extensions après stabilisation

Fabric / Forge / NeoForge / Purpur, BDS / PocketMine, import de serveurs et de modpacks, import/export/duplication de mondes, mises à jour de plugins avec comparaison et rollback, CurseForge / Hangar, Geyser / Floodgate, tunnels Playit, Docker avec quotas, panneau distant et comptes locaux multi-utilisateurs, cloud backups et IA optionnelle.

## Choix V1 simplifiés

- Les tâches utilisent des intervalles en minutes, pas encore un calendrier quotidien/cron avec avertissements multiples. Restart annonce dix secondes.
- Console en mémoire limitée à 5 000 lignes ; les logs Minecraft complets restent sur disque. L’éditeur est textuel avec validation JSON, sans coloration syntaxique ni validation YAML.
- File manager : navigation, édition, création, import/export fichier, suppression ; pas encore rename/move/copy ou outils ZIP génériques dans l’UI.
- Modrinth : plugins Paper, installation de dépendances, versions épinglées, enable/disable. Pas encore recherche de mises à jour, désinstallation gérée, comparaison de versions ni téléchargement d’icônes distantes.
- Joueurs : pseudos live et modération RCON ; UUID/ping/playtime et listes persistantes détaillées ne sont pas inventés.
- Taille de serveur disponible, rafraîchie périodiquement ; pas encore un index par catégorie et une liste des plus gros fichiers.
- Runtimes : installation, détection et sélection par serveur ; réparation/suppression de runtime via UI reste à ajouter.
- La détection Docker est informative. Elle n’annonce pas un runner Docker fonctionnel.
- L’interface est FR/EN ; certains diagnostics domaine restent en français.

Ces limites sont documentées et les fonctions absentes ne sont pas présentées avec des boutons trompeurs.
