# Native distribution and signing

Use Node 24+, pinned pnpm and the lockfile. `pnpm build` compiles main/preload/renderer and includes dependency notices. The packaging script uses the installed electron-builder **v26** schema and requires the requested OS to equal the host OS. It builds the actual `process.arch` (x64 or ARM64); it never silently packages x64 for an ARM64 host.

| Native host                 | Targets         | Example names for 0.4.0                                             |
| --------------------------- | --------------- | ------------------------------------------------------------------- |
| Windows x64 / ARM64         | NSIS + portable | `MineDock-0.4.0-Setup-ARCH.exe`, `MineDock-0.4.0-Portable-ARCH.exe` |
| Linux x64 / ARM64           | AppImage + deb  | `MineDock-0.4.0-ARCH.AppImage`, `MineDock-0.4.0-ARCH.deb`           |
| macOS Intel / Apple Silicon | dmg + zip       | `MineDock-0.4.0-ARCH.dmg`, `MineDock-0.4.0-ARCH.zip`                |

Windows NSIS is per-user with an installation-folder choice and explicitly retains user data on uninstall. Portable builds keep data in the user profile. Linux deb metadata uses the maintainer masked GitHub address; support is through repository issues. macOS universal packaging is not configured because native Intel/ARM artifacts are provided separately. Package names below describe the current 0.4.0 release.

For Linux x64, electron-builder expands its architecture macro to `x86_64` for AppImage and `amd64` for deb: `MineDock-0.4.0-x86_64.AppImage` and `MineDock-0.4.0-amd64.deb`. Both carry signed metadata architecture `x64`. ARM64 uses `arm64` for both formats.

## Optional certificates

No real Windows/Apple certificate has been supplied. Local packaging remains usable and emits an unsigned warning. No fake official certificate is generated.

Windows accepts `WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD` or the electron-builder `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` aliases. Certificate configuration without its password fails clearly; supplied signing credentials enable required code signing. Certificate values stay in the environment, not package configuration.

macOS accepts `APPLE_CERTIFICATE`/`APPLE_CERTIFICATE_PASSWORD` or `CSC_LINK`/`CSC_KEY_PASSWORD`. With a real identity, hardened runtime and the Electron JIT entitlement are enabled. Notarization additionally needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, or an appropriate Apple API key/ID/issuer configuration. The electron-builder notarization path performs stapling; CI conditionally verifies codesign/stapler/spctl when its Apple ID signing configuration is supplied. Without credentials these checks are not proof of notarization.

Configure credentials only in CI secrets or a private local environment. Never commit private certificates, passwords, update private keys or their base64 representations. [Update metadata signing](update-system.md) uses a separate publisher secret.

## CI and actual execution

The distribution workflow selects six native hosted runners: Windows 2025 x64, Windows 11 ARM, Ubuntu 24.04 x64/ARM, macOS 15 Intel/ARM. It installs dependencies, checks architecture, runs lint/types/unit tests, builds packages and executes ten current Electron journeys using the unpacked packaged app. Linux uses Xvfb with the stock Electron sandbox helper; renderer sandbox/context isolation remain enabled. The historical 0.3.0 matrix ran seven cases. Check the validation record for the revision actually executed on each OS.

The workflow offers opt-in official catalog/runtime/content checks and real Paper bootstrap with `eula=false`. These downloads are not part of ordinary validation. It uploads native packages, signed metadata when the publisher secret is configured, opt-in result records and failure screenshots. It does not automatically publish a GitHub Release.

`pnpm test:packaged` selects the native unpacked executable for the current OS/architecture. It tests setup/languages, filesystem editing/ZIPs, players/storage, worlds/import, recovery/retention, content and survival configuration/snapshot/package flows, plus updater rejection/persistence with isolated data. The Windows NSIS lifecycle and full real executable upgrade were executed separately; see the [record](validation-records/0.4.0-windows-native.json). Linux/macOS OS-installed behavior, signing chains and actual gameplay remain distinct validations; see the [current matrix](validation.md).

Primary configuration references: [electron-builder v26 macOS options](https://www.electron.build/v26/docs/mac/), [electron/notarize](https://github.com/electron/notarize), [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) and [Electron binary prefetch](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md).
