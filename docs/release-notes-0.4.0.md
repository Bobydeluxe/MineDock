# MineDock 0.4.0

MineDock 0.4.0 helps you create and maintain a survival world with friends from one local desktop app. English is the default, with French, German, Spanish, Portuguese and Italian included.

## Added

- Modrinth datapacks and server resource packs, compatible version/dependency previews and local ZIP import.
- Grouped health notifications, crash evidence, player sessions, private notes and reliable cached skins.
- Incremental snapshots with file deduplication, exact partial-restore previews and a safety backup before restoration.
- Minecraft/Paper/Purpur migration reviews and full or fresh-world server clones.
- Historical log search, contextual commands, cancellable macros and safe JVM presets.
- Performance history, configuration versions and graphical YAML/JSON options, map installation assistance and consented Internet reachability checks.
- Verified `.minedock` packages for moving a server to another computer.

## Improved

Modrinth is the primary content experience. Advanced tools stay secondary to creation, start, content and backups. Warm light and neutral charcoal dark themes are retained. Content and Minecraft update backups have separate settings, enabled by default.

## Fixed

Compatible server plugins such as Geyser are accepted when version environment metadata is unknown and project support is known; explicit client-only versions remain blocked. Windows update helpers now launch independently through a hidden native bootstrap. Configuration editing preserves comments and rejects stale writes. Resource-pack removal clears its server URL/hash. Clones choose independent available ports, and migrations block unknown compatibility.

## Download

Use [the public release](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.4.0) and its `SHA256SUMS.txt`. Published packages are grouped by OS and architecture; choose x64 for ordinary Intel/AMD PCs or ARM64 for a matching ARM computer. Windows has Setup/portable, Linux AppImage/deb and macOS dmg/zip. Only actual produced and validated files are uploaded.

End users do not need Node or pnpm. Packages include Electron. Windows/macOS packages have no OS publisher certificate; publisher signatures on update metadata are a separate integrity check.

## Upgrade from 0.3.x

Close MineDock and keep your existing storage folders. Open the verified new package under the same OS account. The existing database is reused and copied before schema migration; servers, preferences, backups, runtimes, player history and scheduled tasks are retained. On this Windows host the old 0.3.0 automatic launcher exits before running its helper, so manually open the 0.4.0 portable or Setup package if the old automatic upgrade fails. Never delete your profile to upgrade.

## Known issues

- Incremental snapshots cannot yet be deleted through the app; their shared file objects are retained. Partial restore applies to incremental snapshots; older full ZIP backups support full restore.
- A migration needing different datapack/resource-pack releases requires explicit pack update/removal first. Unknown compatibility blocks applying changes.
- Supported existing YAML/JSON scalar options have a graphical editor; complex structures remain in the text editor.
- RAM is process working set, not JVM heap/swap. Windows ACL/firewall inspection, local Bedrock UDP and IPv6 observer support are unavailable.
- Multiplayer gameplay, live map rendering, OS installation/upgrades on Linux/macOS/ARM64 and certificate signing have their own validation limits. Native packaged execution is recorded separately in [validation](validation.md).

See the [user guide](user-guide.md), [complete features](../MineDock-Features.txt), [changelog](../CHANGELOG.md) and [actual desktop captures](screenshots/README.md).
