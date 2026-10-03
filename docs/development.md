# Développement

Prérequis : Node 24+, pnpm 11+, accès réseau pour l’installation des dépendances. `pnpm install` est reproductible via le lockfile. `pnpm-workspace.yaml` autorise les scripts Electron et esbuild explicitement.

`pnpm dev` construit main/preload puis lance Vite et Electron. `pnpm dev:mock` ne lance que l’interface simulée sur `127.0.0.1:5173`. Le mock n’est jamais sélectionné automatiquement en production si le bridge Electron manque.

Le contrat partagé est `packages/domain/types.ts`. Ajoutez une méthode au domaine, au preload et au main avec validation et vérification des permissions système pertinentes. Les méthodes UI de fichiers reçoivent des chemins relatifs, jamais des chemins système libres. Les sélecteurs natifs de fichiers ne fonctionnent que dans le desktop.

Les textes UI sont dans `i18n.ts`. Les erreurs domaine et diagnostics de règles serveur sont principalement en français dans cette bêta, même lorsque les libellés UI sont en anglais.

`MINEDOCK_DATA_DIR` permet un dossier de données isolé pour les tests et le développement. `MINEDOCK_TEST=1` masque la fenêtre des tests ; il ne remplace aucun service réel. Ne pointez jamais un test sur vos données de jeu.

Les tests unitaires et d’intégration ne téléchargent rien. Les tests UI utilisent des dossiers temporaires et un processus de jeu conçu pour les tests. `test:live` est facultatif, télécharge un vrai runtime et Paper dans `data/live-smoke`, conserve `eula=false` et atteint l’écran d’acceptation sans créer de monde jouable.

Exécutez `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` avant contribution. La console reste bornée ; le fichier complet `logs/latest.log` du serveur est accessible depuis son dossier pour l’archivage et le diagnostic.
