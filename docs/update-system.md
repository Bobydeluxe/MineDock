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

The [0.3.0 beta release](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.3.0) now includes all twelve native packages and six verified metadata assets. Post-publication checks used the actual backend to verify every target, download/recheck the real Windows portable installer and confirm that a current 0.3.0 installation reports no newer version. No OS installer was executed; see the validation record. Older 0.2.0 clients predate this updater and require a manual first upgrade.
