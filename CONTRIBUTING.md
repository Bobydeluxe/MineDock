# Contribuer

Lisez `docs/development.md`, `docs/architecture.md` et `docs/security.md`. Gardez UI, services et accès système séparés. Toute donnée entrante doit être validée. N’introduisez pas de shell à partir d’une valeur utilisateur ni d’accès fichier hors d’une racine autorisée.

Un changement de schéma exige une nouvelle migration. Toute action destructive exige une confirmation UI adaptée. Les nouveaux textes doivent être traduits. Ajoutez des tests de comportement pour le cycle de vie, les archives et les limites de sécurité.

Avant proposition : `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:ui`, `pnpm build`. N’ajoutez jamais de données de serveurs, secrets, runtimes téléchargés ou builds au contrôle de version.
