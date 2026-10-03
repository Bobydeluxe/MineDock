# Beta scope and limitations

The local V1 core is implemented. [The implementation plan](plan.md) and [validation record](validation.md) describe what is exercised and tested.

## Before a stable public V1

- Connect a real Minecraft client after the owner personally accepts the EULA. Existing live tests stop at that consent gate.
- Validate historical Vanilla/Paper versions, Linux, macOS and arm64 on their actual platforms.
- Add offset-based download resumption, automatic staging recovery after interruption and broader long-job cancellation. Retrying an incomplete installation already preserves its pinned version/build.
- Broaden forced-shutdown, repeated-crash and disk-full testing.
- Configure certificates, signatures and a verified update channel.
- Arrange independent auditing and configurable retention policies.

## Extensions after stabilization

Fabric/Forge/NeoForge/Purpur, BDS/PocketMine, server/modpack import, dedicated world import/export/duplication, plugin update comparison/rollback, CurseForge/Hangar, Geyser/Floodgate, Playit tunnels, Docker quotas, remote administration/local multi-user accounts, cloud backups and optional AI.

## Simplified V1 choices

- Tasks use minute intervals rather than daily calendars/cron or multiple warnings. Scheduled restart announces ten seconds.
- In-memory console history is capped at 5,000 lines; full Minecraft logs stay on disk. Text editing validates JSON but has no syntax highlighting/YAML validation.
- Files: browse, edit, create, import/export and delete. Rename/move/copy and general ZIP tools are not implemented in the UI.
- Modrinth: Paper plugins, dependencies, pinned versions and enable/disable. Update checks, managed uninstall, version comparison and remote project icons are pending.
- Players: live usernames and RCON moderation. UUID/ping/playtime and detailed persistent lists are not fabricated.
- Server size refreshes periodically; storage category indexes and largest-file lists are pending.
- Runtimes: install, detect and choose per server. UI repair/removal is pending.
- Docker detection is informational; there is no Docker runner.
- Six languages cover MineDock's interface and recognized diagnostics. External output and unknown errors retain their original text.

Unavailable features are documented rather than represented by nonfunctional buttons.
