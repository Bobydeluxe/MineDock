# Verified MineDock updates

The stable channel uses GitHub release assets plus **Ed25519-signed metadata** verified against `config/update-trust.json`. The key is the repository publisher key, separate from Authenticode and Apple Developer ID. HTTPS is required but does not by itself make an installer trusted.

Each native metadata asset `update-PLATFORM-ARCH.json` wraps the exact base64 payload and signature/key ID. The payload pins product/channel/stable version, notes, publication/expiry dates, filenames, repository URLs, OS/architecture/package type, sizes and SHA-256. The app rejects tampering, wrong keys, expired/future metadata, duplicates, other repositories/URLs, downgrades and architecture fallback.

Settings offers optional automatic checks (off by default), manual checking, available version/notes, verified download and explicit installation. Checks do not automatically download/install. Downloads use signed bounds/hashes and the cached artifact is verified again before native installation. Installing requires all servers and long operations to be stopped. Minecraft versions/content/worlds are never upgraded as a side effect of an app update.

| Installed package                    | Update flow                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Windows portable                     | Close, native literal-path PowerShell replacement, preserve previous executable, launch new executable |
| Windows NSIS                         | Close and open the verified installer; user completes its wizard/relaunch                              |
| Linux AppImage                       | Close, native writable-file replacement with permissions retained, preserve previous file, launch      |
| Linux deb                            | Open verified package in the OS installer; user completes installation/relaunch                        |
| macOS writable app bundle / zip      | Close, native ditto preparation and bundle replacement, preserve previous bundle, open new app         |
| macOS dmg / non-replaceable location | Verified package through the OS installation flow                                                      |

Native helpers validate source hashes and predetermined executable/bundle locations. The renderer cannot choose a replacement target. Helper result/version state is checked on next launch and audited. Previous copies are retained for recovery. The native updater has fixture tests; [validation](validation.md) distinguishes those from installing a real newer release on a user's machine.

## Publisher workflow

`pnpm updates:keygen` creates/reuses an ignored local private key and writes its public key/key ID. Do not rotate the embedded public key casually: old clients must still verify future release signatures. Keep a protected offline backup of the private key. The owner key was configured as encrypted GitHub Actions secret `MINEDOCK_UPDATE_PRIVATE_KEY`; it is not committed or included in packages.

After building native artifacts, `pnpm updates:sign` reads that environment secret (or the ignored local publisher file), verifies that it matches the embedded public key and writes signed metadata with streamed SHA-256/size for each package. Without the key it reports that metadata signing is unavailable. Mismatched keys fail rather than creating unusable signatures. Never place private keys/certificates/passwords in a workflow body or release asset.

The distribution workflow uploads artifacts; release publication is separate. Publish only tested artifacts with their matching metadata and accurate unsigned/notarized status. An older release without these metadata is refused by the updater. Metadata expiry is currently one year; maintainers must publish fresh trusted metadata/releases as appropriate. See [distribution](distribution.md).

The [0.3.0 beta release](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.3.0) includes all twelve native packages and six verified metadata assets. Its historical post-publication checks verified every target, the actual Windows download and the then-current feed. Older 0.2.0 clients predate the updater and require a manual first upgrade.

## Windows native validation and legacy limitation

The 0.4.0 review discovered that `DETACHED_PROCESS` made Windows PowerShell exit before reading its helper on this host. Simply inheriting Electron's process lifetime did not survive application closure either. Windows now runs a short hidden bootstrap, waits for its successful exit, and uses native `Start-Process -WindowStyle Hidden` to give the verified helper/installer an independent lifetime. Literal paths are safely quoted inside an encoded fixed script; no renderer-supplied command string enters this flow.

The historical packaged 0.4.0 → private 0.4.1 QA upgrade verified production signatures/downloaded bytes, native replacement, genuine new-version startup, installation audit and preserved settings/server/world/backup/runtime-reference data. Transport responses alone were controlled for that pre-release replay; 0.4.1 has since been published and separately validated. A genuine public 0.3.0 → 0.4.0 schema-5→11 test required explicitly executing the native helper after the old launcher failed; this is a manual recovery, not a successful automatic legacy upgrade. Users encountering it must manually open the verified new package first. [Historical evidence](validation-records/0.4.0-windows-native.json) and [validation](validation.md) keep these paths separate.

`node scripts/validate-native-upgrade.mjs` reproduces this Windows test using explicit baseline binary/portable, candidate, metadata and version arguments. It creates isolated temporary data, uses loopback debug endpoints for test transport injection, never starts Minecraft, and closes only candidate wrappers within `data/upgrade-validation`. See [developer instructions](development.md).

## Current release and public verification

The current release is [MineDock 0.4.1](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.4.1). Native update metadata is signed with the pinned publisher key and identifies the exact uploaded package bytes. The public 0.4.0 → 0.4.1 Windows replay and the older 0.3.0 recovery have separate evidence in [validation](validation.md). `scripts/validate-native-upgrade.mjs --public-release` uses actual public GitHub feed/metadata/downloads and explicit baseline/candidate arguments; its data checks include preferences, player history/files, scheduled tasks, encrypted RCON data, Java and the pre-migration SQLite copy.

MineDock 0.5.0 uses migration 11 → 12. Historical administration-candidate evidence targets source 815f4a7; it is distinct from the exact final-binary validation recorded in [release validation](validation.md). The item-resource enhancement adds no further migration. Public signature/download checks and the actual Windows replacement/relaunch are recorded with their specific artifact hashes.
