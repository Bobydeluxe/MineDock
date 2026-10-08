# Implemented scope and remaining validation

## Implemented in the 0.4.0 review

The existing eight engines, official runtimes, imports/worlds/files, Modrinth mod manager, backups, schedules and recovery remain. The friends survival evolution adds datapacks/resource packs, health/notices/crash evidence, player sessions/notes, incremental snapshots/partial restores, migration/clones, console search/macros, performance/JVM tools, configuration history/maps/reachability and `.minedock` transfer. English is primary; all six app languages remain bundled. See [the exact ledger](survival-evolution.md), [feature list](../MineDock-Features.txt), [user guide](user-guide.md) and [validation](validation.md).

The static product site, native capture/GIF workflow, user changelog and internal security review are included. The source is 0.4.0 under review in [PR #7](https://github.com/Bobydeluxe/MineDock/pull/7), based on pending PRs #5/#6. Public downloads remain 0.3.0. Review and app release publication are separate owner decisions.

## Functional limits and follow-up

- Implement reference-safe snapshot deletion/garbage collection before unattended object cleanup. Objects are retained; legacy ZIP partial restore is unavailable.
- Extend migration to apply changed pack versions in one reviewed transaction. Currently explicit pack update/removal is required; unknown compatibility blocks applying changes.
- Add reliable JVM heap/swap sources where supported. Process working set is not heap; unsupported TPS/MSPT stays unavailable.
- Expand curated explanations and complex configuration structures only where safe. Graphical editing covers existing supported YAML/JSON primitives, with the text editor retained.
- Windows firewall/ACL inspection, local Bedrock UDP reachability and IPv6 observer support are unavailable. Local TCP alone never proves Internet access.

## Remaining native validation and publication

- Review the current real screenshots and draft PR before any merge/release. A fresh six-platform 0.4.0 distribution matrix is required before publishing all platforms.
- Windows x64 lifecycle/updater results are recorded explicitly in validation. Linux/macOS OS installation/upgrades, ARM64 lifecycle, protected install paths and native keychain behavior need their own environments.
- Actual Minecraft client gameplay, map rendering, historical loader coverage and Bedrock crossplay need real servers/clients and personal EULA acceptance. Capture fixtures are not gameplay.
- Supply Windows/Apple certificates before claiming Authenticode/notarization; publisher metadata signing is separate.
- Commission an independent security review and expand disk-full, network-disconnect, power-loss and long-duration/load fault injection.

Docker, remote accounts/RBAC, tunnels, cloud synchronization/providers, optional AI and universal world conversion remain future scope. None appears as a working button. MineDock must remain open to supervise servers/tasks and does not configure routers/firewalls.
