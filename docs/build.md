# Distribution

`pnpm build` produit `dist/main.cjs`, `dist/preload.cjs`, le renderer Vite et l’icône. Les services sont bundlés ; le binaire Electron embarque Node et Chromium. L’utilisateur final n’installe ni Node ni pnpm.

Sur Windows : `pnpm build:windows` produit NSIS et portable dans `release/`. NSIS installe dans le profil utilisateur et propose un dossier d’installation. Le portable est un paquet auto-extractible ; les données restent dans le profil utilisateur. `pnpm test:packaged` lance `release/win-unpacked/MineDock.exe` avec des données temporaires.

Sur Linux : `pnpm build:linux` produit AppImage et deb. Sur macOS : `pnpm build:mac` produit un DMG. Ces cibles sont configurées en CI ; elles nécessitent une validation sur leurs OS respectifs avant publication. Le réseau et les runtimes gèrent x64 et arm64, mais la livraison locale Windows a été validée en x64 uniquement.

Le paquet Debian déclare le mainteneur avec l’adresse GitHub masquée de Bobydeluxe. Le support passe par les issues du dépôt public indiqué dans `homepage` ; cette adresse masquée ne constitue pas une boîte de support.

Les artefacts locaux sont **non signés**. Une distribution publique stable nécessite un certificat Windows / une signature de confiance, une identité macOS et la notarisation. Configurez les secrets `CSC_LINK` et `CSC_KEY_PASSWORD` de chaque plateforme, puis vérifiez la chaîne de signature dans le pipeline.

Le workflow de tags produit des artefacts et ne publie pas de GitHub Release. La publication reste une action volontaire après validation des signatures. Aucune mise à jour distante d’application n’est activée : il manque un endpoint de releases détenu par le mainteneur et une politique de vérification cryptographique. Il n’existe aucun endpoint inventé dans le logiciel.

Les icônes sont originales. Le nom/version se trouvent dans `PRODUCT` et les métadonnées de packaging `package.json`.
