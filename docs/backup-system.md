# Backups and retention

Normal backups contain the full server folder plus validated profile/content launch metadata, with session locks and known RCON secrets excluded. They retain engine/entrypoint/arguments/runtime/crossplay/modpack metadata for restore. Archives live outside server folders and are indexed by UUID, date, reason, size and SHA-256.

A running Java engine with supported RCON uses `save-off`, `save-all flush`, ZIP/hash/rename/database registration and `save-on` in `finally`. Failed saving confirmation aborts safely; failed save resumption triggers a safety stop. Native/PocketMine backups require the server stopped for a consistent copy. Lifecycle work cannot overlap backup mutations. Copies/archives/hashes support cancellation and bounds; free space is checked before preparation.

Restoration requires a stopped server and exact-name confirmation. It verifies the registered hash/manifest, creates a current-state safety backup, extracts into private staging, restores supported engine launch metadata, reinjects managed secrets and preserves current network ports. A recorded folder exchange and SQLite commit precede previous-copy cleanup. Failed preparation retains the original; interrupted/ambiguous exchanges use [recovery](recovery.md). Verified backup recovery can restore a missing original without deleting uncertain copies.

Policies can keep a count, elapsed days or newest representatives of hourly/daily/weekly/monthly buckets (defaults 24/7/4/12). Buckets use the selected timezone; the latest eligible archive remains protected. Policies target automatic/scheduled backups. Manual and safety copies are protected by default; including manual files requires a conspicuous option and an additional typed deletion phrase.

Purging is explicit: generate a recent verified preview showing archive count/bytes and kept/deleted/unavailable files, then confirm the server name. Changed policies/folders/archives invalidate the preview. Corrupt/outside/linked files are not silently deleted. Batch moves and database changes have a persistent journal; startup restores uncommitted moves or finishes committed cleanup. Unknown recovery-directory files remain preserved. Unattended purging is not enabled.

Original-folder import safety archives preserve original bytes before managed changes and can contain original secrets. Full backups can contain secrets in arbitrary plugin configurations. Protect archives and the encryption key. Exported backups use a cancellable verified atomic destination; application data/runtime/server roots are protected.
