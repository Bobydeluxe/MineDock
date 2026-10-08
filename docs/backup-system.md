# Backups and retention

Normal backups contain the full server folder plus validated profile/content launch metadata, with session locks and known RCON secrets excluded. They retain engine/entrypoint/arguments/runtime/crossplay/modpack metadata for restore. Archives live outside server folders and are indexed by UUID, date, reason, size and SHA-256.

A running Java engine with supported RCON uses `save-off`, `save-all flush`, ZIP/hash/rename/database registration and `save-on` in `finally`. Failed saving confirmation aborts safely; failed save resumption triggers a safety stop. Native/PocketMine backups require the server stopped for a consistent copy. Lifecycle work cannot overlap backup mutations. Copies/archives/hashes support cancellation and bounds; free space is checked before preparation.

Restoration requires a stopped server and exact-name confirmation. It verifies the registered hash/manifest, creates a current-state safety backup, extracts into private staging, restores supported engine launch metadata, reinjects managed secrets and preserves current network ports. A recorded folder exchange and SQLite commit precede previous-copy cleanup. Failed preparation retains the original; interrupted/ambiguous exchanges use [recovery](recovery.md). Verified backup recovery can restore a missing original without deleting uncertain copies.

Policies can keep a count, elapsed days or newest representatives of hourly/daily/weekly/monthly buckets (defaults 24/7/4/12). Buckets use the selected timezone; the latest eligible archive remains protected. Policies target automatic/scheduled backups. Manual and safety copies are protected by default; including manual files requires a conspicuous option and an additional typed deletion phrase.

Purging is explicit: generate a recent verified preview showing archive count/bytes and kept/deleted/unavailable files, then confirm the server name. Changed policies/folders/archives invalidate the preview. Corrupt/outside/linked files are not silently deleted. Batch moves and database changes have a persistent journal; startup restores uncommitted moves or finishes committed cleanup. Unknown recovery-directory files remain preserved. Unattended purging is not enabled.

Original-folder import safety archives preserve original bytes before managed changes and can contain original secrets. Full backups can contain secrets in arbitrary plugin configurations. Protect archives and the encryption key. Exported backups use a cancellable verified atomic destination; application data/runtime/server roots are protected.

## Incremental and partial restore (0.4.0)

A stopped-server snapshot walks bounded actual files, stores an inventory with SHA-256 and writes immutable file objects only when their content is new. This is file-level deduplication, not block-level incremental storage. The verified manifest is indexed separately in schema 9. Full ZIP backups remain available. Snapshot copying is bounded to 200,000 files / 64 GB, and restore verifies every needed object before staging.

Restore previews can select all files or a world/configuration/mods/plugins/datapacks section. They show exact replacements/removals, preserve unrelated sections and always create a full current-state safety ZIP first. Existing network/RCON identity is retained. A recoverable folder transaction applies the selected inventory; stale state or corrupt objects abort. Partial restoration currently applies to incremental snapshots; legacy full ZIP restoration remains a whole-server operation.

Content-change and Minecraft-change safety policies are separate, both default on. A mounted external disk/NAS can be used through the OS path; Settings probes accessibility, actual write/delete of a uniquely named test file and available space. No SMB credentials/protocol are implemented. A disconnected mount reports an error.

There is no snapshot deletion/garbage collector yet. Unreferenced objects remain retained, so monitor storage and preserve manifests together with their object store. Do not manually prune individual objects used by snapshots.
