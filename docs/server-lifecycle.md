# Server lifecycle

Creation selects edition/engine/version, compatible runtime and relevant options, then displays a summary. Java consent belongs to the user in the wizard; native engines do not acquire Java dependencies. Official artifacts/builds/loaders/installers are pinned. Downloads verify supplied hashes; Forge/NeoForge run their official installer with captured output, cancellation and a timeout in staging. A persisted prepared operation commits the installed folder/profile. Incomplete installations cannot start and retry preserves pinned selections.

Startup checks completed installation, unresolved recovery, actual entrypoint/arguments, compatible runtime, recorded EULA where required and engine-specific TCP/UDP/IPv6/RCON/crossplay ports. Java, PHP or a native executable starts with `shell: false` in its server folder. Actual engine readiness output controls Online status. Startup has a five-minute deadline. Only Java engines receive heap arguments; no native CPU quota is claimed.

Shutdown uses RCON flush where supported, sends the engine stop command and waits thirty seconds. Forced termination is the bounded last resort. Expected stops differ from crashes. Configurable crash recovery waits fifteen then thirty seconds; three crashes in ten minutes suspend automatic recovery with an audit/alert. Persisted orphan PIDs are not killed automatically because they may have been reused.

Persistent interval/daily/cron tasks run only while MineDock is open. Calendar tasks use the selected timezone; the UI previews upcoming runs and explains cron. Pause/resume persists. Overdue runs are advanced without replaying old commands. Restart warnings are bounded scheduled deadlines followed by the serialized restart; stopping/cancelling prevents later warning work.

Observed players come from actual logs/RCON and available local identity/lists. Reliable UUID/XUID information is distinct from usernames, saved game statistics from MineDock-observed session time, and unknown ping from zero. CPU/RAM metrics are actual process measurements.

Closing MineDock stops task/update checks, cancels/waits for operations/downloads, stops supervised processes, flushes logs and snapshots/closes SQLite. Read [recovery](recovery.md) for interrupted installations/exchanges and [backups](backup-system.md) for live save-hold behavior.
