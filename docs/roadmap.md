# Implemented scope and remaining validation

## Included in MineDock 0.4.0

The existing eight engines, official runtimes, imports/worlds/files, Modrinth mod manager, backups, schedules and recovery remain. The friends survival evolution adds datapacks/resource packs, health/notices/crash evidence, player sessions/notes, incremental snapshots/partial restores, migration/clones, console search/macros, performance/JVM tools, configuration history/maps/reachability and `.minedock` transfer. English is primary; all six app languages remain bundled. See [the exact ledger](survival-evolution.md), [feature list](../MineDock-Features.txt), [user guide](user-guide.md) and [validation](validation.md).

The static product site, native capture/GIF workflow, user changelog and internal security review are included in the public [MineDock 0.4.0](https://github.com/Bobydeluxe/MineDock/releases/tag/v0.4.0). [PR #7](https://github.com/Bobydeluxe/MineDock/pull/7) records the implementation review.

## Functional limits and follow-up

- Implement reference-safe snapshot deletion/garbage collection before unattended object cleanup. Objects are retained; legacy ZIP partial restore is unavailable.
- Extend migration to apply changed pack versions in one reviewed transaction. Currently explicit pack update/removal is required; unknown compatibility blocks applying changes.
- Add reliable JVM heap/swap sources where supported. Process working set is not heap; unsupported TPS/MSPT stays unavailable.
- Expand curated explanations and complex configuration structures only where safe. Graphical editing covers existing supported YAML/JSON primitives, with the text editor retained.
- Windows firewall/ACL inspection, local Bedrock UDP reachability and IPv6 observer support are unavailable. Local TCP alone never proves Internet access.

## Remaining native validation and publication

- Future releases must repeat the native distribution matrix and verify every uploaded package/checksum. The 0.4.0 evidence is recorded in validation.
- Windows x64 lifecycle/updater results are recorded explicitly in validation. Linux/macOS OS installation/upgrades, ARM64 lifecycle, protected install paths and native keychain behavior need their own environments.
- Actual Minecraft client gameplay, map rendering, historical loader coverage and Bedrock crossplay need real servers/clients and personal EULA acceptance. Capture fixtures are not gameplay.
- Supply Windows/Apple certificates before claiming Authenticode/notarization; publisher metadata signing is separate.
- Commission an independent security review and expand disk-full, network-disconnect, power-loss and long-duration/load fault injection.

Docker, remote accounts/RBAC, tunnels, cloud synchronization/providers, optional AI and universal world conversion remain future scope. None appears as a working button. MineDock must remain open to supervise servers/tasks and does not configure routers/firewalls.

## 0.4.1 review implementation

The reference-based interface, approved branding, full official catalogs, independent Fabric versions, safe categorized properties and local profile images are implemented on codex/reference-design-041. The new site uses current public 0.4.0 downloads and honestly labels candidate screenshots. Public release notes are English. [Design review](design/reference-041/README.md) and [validation](validation.md) record actual results.

The application candidate is not merged/tagged/released until explicit owner approval. All six native jobs and artifact checks pass for the recorded app source; changed app inputs require repeating them. GitHub's social preview is installed and verified. Direct visual confirmation of an existing pinned Windows shortcut remains a manual check where the connected tools cannot observe it.
