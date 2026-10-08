# Implemented scope and remaining validation

## Implemented

The 0.3.0 source extends the existing local desktop with eight engine adapters/capabilities, Java/PHP/native runtimes, mods/plugins/providers/history, Geyser/Floodgate controls, server/world/mrpack imports, advanced files/editor/ZIPs, persistent players, storage analysis, calendar/cron tasks, runtime repair/deletion, retention previews/purges, resumable downloads, cancellation/recovery and verified app-update infrastructure. These are accessible services and interface flows, covered by automated tests. See the [feature list](../MineDock-Features.txt) and [validation record](validation.md) for evidence and constraints.

Earlier roadmap entries for those implemented services are no longer marked planned. A working adapter and fixture tests do not imply that every historical engine has been played on every native target.

The unpublished 0.3.1 UI revision implements centered native dialogs with focus/scroll handling, simpler engine/resource/settings/review steps, eight original engine symbols, concise six-language navigation, improved light/dark styling and a documented screenshot workflow. The README, contribution instructions and issue/PR templates are updated. Its validation evidence is listed separately from the published 0.3.0 matrix.

## Remaining prerequisites and validation

The development mod manager now uses Modrinth exclusively for Fabric/Forge/NeoForge mods, with real staged file/SQLite transactions, named dependencies, batched updates, archived rollback, locks, collections, manual identification and pre-start health checks. Appended migration 6 retains existing binaries and published migrations. This work remains an unpublished source revision; a future minor release will receive its version after the complete release validation. Visual review changes belong to a separate PR and do not authorize a release.

- Real client/server gameplay after personal EULA acceptance, including engine/loader historical-version coverage and Bedrock crossplay connectivity.
- Real Windows Authenticode and Apple Developer ID/notarization credentials, followed by chain/notarization/stapling validation. Unsigned packaging is supported.
- Actual newer-release installation/relaunch through each package's native installer/updater, including protected/non-writable locations; fixture helper tests do not replace this.
- Native job results, OS-installed package behavior, permissions/shortcuts/keychain/sleep prevention and external network gameplay must be reported separately. Current CI evidence is in [validation](validation.md).
- Independent security review and broader disk-full/power-loss/forced-shutdown testing.

## Future scope

General datapack/resource management, Docker isolation/quotas, tunnels, remote accounts/RBAC, cloud backup providers and optional AI remain future extensions.

Unknown external diagnostics retain their original text. Ping/seed/statistics/UUIDs remain unavailable when no reliable local source exists. Retention purges require preview/confirmation; unattended archive deletion is not enabled. MineDock must remain open to supervise processes/tasks and does not configure firewalls/routers.
