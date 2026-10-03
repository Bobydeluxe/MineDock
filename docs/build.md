# Distribution

`pnpm build` produces `dist/main.cjs`, `dist/preload.cjs`, the Vite renderer and icon. Services are bundled; Electron includes Node and Chromium. End users do not install Node or pnpm.

On Windows, `pnpm build:windows` produces NSIS and portable builds in `release/`. NSIS installs for the current user and offers a destination-folder choice. The portable executable self-extracts, while persistent data remains in the user profile. `pnpm test:packaged` launches `release/win-unpacked/MineDock.exe` with temporary data.

`pnpm build:linux` produces AppImage/deb and `pnpm build:mac` produces DMG. CI builds all three platforms. Successful packaging does not verify Minecraft gameplay, downloaded runtimes or every native integration on each OS. Runtime/network support includes x64 and arm64; local Windows delivery was tested on x64.

Debian metadata uses Bobydeluxe's masked GitHub maintainer email. Support belongs in the public repository's issues, linked through `homepage`; the masked email is not a support inbox.

Beta artifacts are **unsigned**. Stable distribution needs Windows signing credentials, a macOS signing identity and notarization. Configure platform `CSC_LINK` and `CSC_KEY_PASSWORD` secrets and verify the signature chain in CI.

The tag workflow uploads build artifacts; it does not publish a GitHub Release. Beta releases are published separately with their unsigned status stated. Verified automatic app updates require a maintainer-owned endpoint and a cryptographic verification policy and are disabled until configured.

Icons are original. Keep the `PRODUCT` version and `package.json` packaging version synchronized. English is the project's primary language; bundled catalogs provide six app languages without network requests.
