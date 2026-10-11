# MineDock 0.5.1

Release preparation: packages are published only after the native build, signature, checksum and upgrade checks pass. The public release remains 0.5.0 until publication.

## Added

- Windows x64 and ARM64 application, Setup and Portable signatures using the stable MineDock self-signed certificate (`CN=MineDock`, RSA 3072, SHA-256).
- RFC 3161 timestamps and independent native signature/file-integrity checks before final SHA-256 checksums and Ed25519 update metadata.

## Improved

- Automatic Windows signing for reviewed version tags, with pinned certificate identity and temporary private-file cleanup.
- GitHub-only distribution and current privacy/signing documentation; desktop packages include only the intended application build outputs.
- The existing player/world tools, private item resources, six languages and neutral dark/light interface are retained from 0.5.0. No database schema or server/world format changes are introduced.

## Fixed

- Future Windows downloads now carry the configured certificate. Previously published 0.5.0 downloads remain unchanged and unsigned.

## Downloads

The validated release will provide Windows x64/ARM64 (Setup and Portable), Linux x64/ARM64 (AppImage and deb), and macOS Intel/Apple Silicon (dmg and zip), with `SHA256SUMS.txt` and six signed updater manifests. Check the published assets for actual availability.

## Upgrade

Close running servers and long operations before upgrading. Keep the same OS account and existing storage folders. MineDock 0.5.0 and 0.5.1 use SQLite schema 12; servers, preferences, backups, runtimes, player data and schedules remain in the same profile. The signed updater metadata identifies the exact final signed package bytes. Historical 0.3.0 Windows launcher failures still require a manual first upgrade.

## Known issues

- Self-signed does not establish public Windows CA trust or Microsoft certification. SmartScreen/Unknown Publisher warnings can remain. No installer or script installs a root certificate; do not disable Windows protections.
- macOS is not Apple Developer ID signed or notarized. Linux/macOS OS installer/update lifecycles, Windows ARM64 installed lifecycle, independent timestamp-authority chain/long-term expiry validation and the owner's offline certificate backup restore remain separate checks.
- The existing gameplay, renderer/registry, inventory format and privacy-control limits remain; this maintenance release does not add connected-client gameplay coverage.

Public certificate DER SHA-256:

```text
0f8c09238269ccf126182ec3efad795ce745d3e00f18ca03142d1557b8175395
```

[Public certificate](certificates/README.md) · [Signature verification](windows-signing.md#verify-before-hashing) · [Code signing policy](code-signing-policy.md) · [Privacy Policy](PRIVACY_POLICY.md) · [Validation](validation.md)
