# Native distribution and signing

## GitHub distribution

The [GitHub repository](https://github.com/Bobydeluxe/MineDock) is the official homepage and source. [GitHub Releases](https://github.com/Bobydeluxe/MineDock/releases) distributes the current **0.5.1** packages and checksums. The README includes installation/removal instructions, [Privacy Policy](PRIVACY_POLICY.md) and [Code signing policy](code-signing-policy.md). Windows 0.5.1 app/Setup/Portable are self-signed and timestamped; macOS remains unsigned/not notarized. Historical 0.5.0 files and cryptographic metadata remain unchanged. Future release descriptions must link both policies and state the actual signing status.

Use Node 24+, pinned pnpm and the lockfile. `pnpm build` compiles main/preload/renderer and includes dependency notices. The packaging script uses the installed electron-builder **v26** schema and requires the requested OS to equal the host OS. It builds the actual `process.arch` (x64 or ARM64); it never silently packages x64 for an ARM64 host.

| Native host                 | Targets         | Example names for public 0.5.1                                      |
| --------------------------- | --------------- | ------------------------------------------------------------------- |
| Windows x64 / ARM64         | NSIS + portable | `MineDock-0.5.1-Setup-ARCH.exe`, `MineDock-0.5.1-Portable-ARCH.exe` |
| Linux x64 / ARM64           | AppImage + deb  | `MineDock-0.5.1-ARCH.AppImage`, `MineDock-0.5.1-ARCH.deb`           |
| macOS Intel / Apple Silicon | dmg + zip       | `MineDock-0.5.1-ARCH.dmg`, `MineDock-0.5.1-ARCH.zip`                |

Windows NSIS is per-user with an installation-folder choice and explicitly retains user data on uninstall. Portable builds keep data in the user profile. Linux deb metadata uses the maintainer masked GitHub address; support is through repository issues. macOS universal packaging is not configured because native Intel/ARM artifacts are provided separately. Package names below describe the public 0.5.1 release.

For Linux x64, electron-builder expands its architecture macro to `x86_64` for AppImage and `amd64` for deb: `MineDock-0.5.1-x86_64.AppImage` and `MineDock-0.5.1-amd64.deb`. Both carry signed metadata architecture `x64`. ARM64 uses `arm64` for both formats.

## Optional certificates

The owner has created a stable self-signed Windows certificate; its [public CER and fingerprint](certificates/README.md) are available, and the public CI pin and two encrypted signing secrets are configured. Automatic signing is enabled for future `v*` version tags; a manual signed build selects `main` and `windows_signing`. [Owner setup and native validation](validation-records/windows-owner-signing.json). No Apple signing certificate has been supplied. Ordinary local packaging without credentials remains usable and emits an unsigned warning. Windows 0.5.1 uses this identity; [setup, secrets, verification, backup and rotation](windows-signing.md). Certificate generation is run once by the owner; CI never creates a production identity. Self-signed does not establish public Windows trust or remove SmartScreen/Unknown Publisher warnings.

Windows accepts `WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD` or `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` aliases, plus a required public DER SHA-256 pin in `MINEDOCK_WINDOWS_CERT_SHA256`. Explicit `MINEDOCK_WINDOWS_SIGNING_REQUIRED=true` without credentials fails. Native preflight verifies PFX/password/identity/constraints; SHA-256/RFC 3161 signing and independent CMS/SIP integrity verification cover the packaged app, final Setup and Portable before final checksums/update metadata. Certificate values remain in the environment. Windows chain trust is reported separately.

macOS accepts `APPLE_CERTIFICATE`/`APPLE_CERTIFICATE_PASSWORD` or `CSC_LINK`/`CSC_KEY_PASSWORD`. With a real identity, hardened runtime and the Electron JIT entitlement are enabled. Notarization additionally needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, or an appropriate Apple API key/ID/issuer configuration. The electron-builder notarization path performs stapling; CI conditionally verifies codesign/stapler/spctl when its Apple ID signing configuration is supplied. Without credentials these checks are not proof of notarization.

Configure credentials only in CI secrets or a private local environment. Never commit private certificates, passwords, update private keys or their base64 representations. [Update metadata signing](update-system.md) uses a separate publisher secret.

## CI and actual execution

The distribution workflow selects six native hosted runners: Windows 2025 x64, Windows 11 ARM, Ubuntu 24.04 x64/ARM, macOS 15 Intel/ARM. It installs dependencies, checks architecture, runs lint/types/unit tests, builds packages and executes the current Electron journeys using the unpacked packaged app: the 0.5.1 suite contains 16 cases. Without private game assets, Windows/Linux run 15 and skip the owned-game case; macOS runs 14 and also skips Bedrock directory import because the dedicated server has no macOS distribution. The private owned-game case passed locally for the historical 0.5.0 release. It is skipped in the 0.5.1 runs; no new private-resource coverage is claimed. Linux uses Xvfb with the stock Electron sandbox helper; renderer sandbox/context isolation remain enabled. The historical 0.3.0 matrix ran seven cases. Check the validation record for the revision actually executed on each OS.

The workflow offers opt-in official catalog/runtime/content checks and real Paper bootstrap with `eula=false`. It also offers owner signing only from the default branch or explicitly opted-in future tags, with restricted temporary PFX cleanup, and an explicit disposable native signing self-test. These checks are not enabled by ordinary PR validation. It uploads native packages, signed metadata when the publisher secret is configured, opt-in result records and failure screenshots. It does not automatically publish a GitHub Release.

`pnpm test:packaged` selects the native unpacked executable for the current OS/architecture. It tests setup/languages, filesystem editing/ZIPs, players/storage, worlds/import, recovery/retention, content and survival configuration/snapshot/package flows, plus updater rejection/persistence with isolated data. The Windows NSIS lifecycle and full real executable upgrade were executed separately; see the [record](validation-records/0.4.0-windows-native.json). Linux/macOS OS-installed behavior, signing chains and actual gameplay remain distinct validations; see the [current matrix](validation.md).

Primary configuration references: [electron-builder v26 macOS options](https://www.electron.build/v26/docs/mac/), [electron/notarize](https://github.com/electron/notarize), [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) and [Electron binary prefetch](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md).

## 0.4.1 branding

The canonical owner-supplied PNG generates Windows ICO sizes 16/24/32/48/64/128/256, macOS ICNS, Linux PNG sizes and the desktop SVG logo. Packaging refers to these assets; the desktop build includes ICO and PNG and chooses the native Windows window icon. Run `python scripts/build-brand-assets.py` to reproduce technical derivatives. The historical 0.4.1 release leaves 0.4.0 bytes unchanged. GitHub social-preview configuration and any unobserved native icon/pinning checks are distinguished in the design/validation records.
