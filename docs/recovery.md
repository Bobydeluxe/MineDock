# Interrupted operations and recovery

In MineDock 0.4.1, open **Settings → Recovery and background tasks** for unfinished jobs, cancellation, failures and reviewed recovery. Completed audit records are available under **Settings → History**. These panels are collapsed; there is no standalone Operations destination. Downloads, extraction, copies, imports/exports, content changes, modpacks, runtime work, world work, backups and storage scans use cancellation at safe boundaries. Cancelling prepared work retains the installed state and records the outcome; an atomic commit cannot be interrupted halfway by a UI cancellation.

HTTP partial records include the temporary path, offset, expected hash/size and server validators. A resumed request requires valid Range/content-range/entity data; ignored Range or changed entities cause a clean restart. An incomplete installed server remains blocked until its pinned installation is retried. An interrupted modpack retries the whole approved pack, not just an empty engine install.

Folder exchanges persist validated destination/prepared/previous paths and the associated profile/content state. Startup examines unfinished jobs and checkpoints. It restores a known previous state or finishes committed cleanup when safe. Scans/previews do not publish partial results. Missing/both/changed originals or unapproved paths require attention; MineDock does not guess which copy contains valuable data.

Select Review recovery to see copies and registered verified backups. Typed operation-label confirmation is required before rollback/backup recovery. Restoring the previous original preserves uncertain prepared/current copies beside it; their paths stay in operation history. A verified full-server backup can restore a missing original. Runtime recovery requires every affected server to be stopped. Server launch and mutations remain blocked until attention is resolved.

Retention has its own batch journal: pending moved archives are restored, or committed cleanup is completed. Unknown files in a recovery folder are preserved and prevent silent deletion. Safe retry is offered; an ambiguous missing archive can require external storage review.

App-update helpers keep a previous executable/bundle and record an installation result. Windows/macOS helper launch errors restore the old copy when possible. A power loss between native filesystem changes, unwritable locations or a broken OS installer may need manual restoration from the preserved copy. Installer packages use the OS installation flow. This is not a claim of perfect atomicity across filesystem, SQLite and OS installers.

Before manual filesystem recovery, close MineDock and affected Minecraft processes, preserve every available copy and read the recorded paths. Never erase a checkpoint or the only encryption key just to hide an alert.
