# MineDock 0.4.0 — release notes prepared for review

**Unreleased candidate.** Public downloads remain [0.3.0 beta](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.3.0). These notes describe [draft PR #7](https://github.com/Bobydeluxe/MineDock/pull/7), including its pending Modrinth/visual bases. Do not upload a partial platform set or imply that a private QA build is a public release.

## A survival world with friends

Install compatible mods, plugins and world-scoped datapacks through Modrinth; choose a server resource pack, inspect dependencies and keep installed inventory offline. Local player notes/sessions, grouped health notices and crash evidence make a small server easier to maintain.

Incremental snapshots reuse unchanged file objects. Partial restoration shows exactly what will be replaced and creates a full safety backup first. Reviewed Minecraft/Paper/Purpur migrations and full/fresh-world clones preserve the existing server while you prepare changes. Console suggestions/macros, actual performance observations, configuration history and verified `.minedock` transfer stay available as secondary tools.

English is default, with French, German, Spanish, Portuguese and Italian bundled. Warm light and neutral charcoal dark remain. See [the beginner guide](user-guide.md), [changelog](../CHANGELOG.md) and [real screenshots](screenshots/README.md).

## Fixes and safeguards

Windows updates now use a hidden native bootstrap that gives the helper/installer its own lifetime; PowerShell's detached-process failure is covered by native regressions. Selected pack removal clears its server URL/hash, migration refuses unknown compatibility, configuration writes reject stale state and preserve comments, and clone ports are independently checked.

## Platforms, assets and release checklist

Retained native targets: Windows NSIS/portable, Linux AppImage/deb, macOS dmg/zip, x64/ARM64 where engine/runtime providers support them. Current 0.4.0 OS lifecycle evidence is Windows x64; the historical six-platform 0.3.0 matrix is not a new 0.4.0 result. Run the native distribution workflow and review all target results before releasing.

Publish tested executables together with matching publisher-signed `update-PLATFORM-ARCH.json`, `SHA256SUMS.txt`, these accurate notes and the screenshot gallery. No Windows/Apple certificate is supplied: describe packages as unsigned. Update signatures are separate from OS code signing. Local Windows candidate hashes are in [validation](validation.md); regenerate the release checksum list from the exact uploaded assets.

## Known issues

- Public 0.3.0 Windows portable auto-replacement failed on this host before its helper ran. A first manual upgrade to the verified new package is required here; the corrected automatic path was tested between real local 0.4.0 and private 0.4.1 QA binaries. Neither new version is publicly released.
- Snapshots have no deletion/garbage collector, and legacy ZIP partial restoration is unavailable.
- Changed datapack/resource-pack releases require explicit update/removal before migration. Unknown compatibility blocks changes rather than risking a broken server.
- RAM is process working set, not JVM heap/swap. Windows firewall/ACL inspection and unsupported reachability remain unavailable.
- Actual multiplayer, live map rendering, other OS installation/upgrades, long-duration faults and certificate signing remain unvalidated. See [exact evidence and limits](validation.md).
