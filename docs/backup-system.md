# Backups and restoration

Every archive is a complete server-folder ZIP, excluding session locks and the known RCON secret. It includes a profile/plugin manifest to keep content tracking consistent after restore. Archives live outside server folders and are indexed in SQLite by UUID, size, date, reason and SHA-256.

For a running server: `save-off`, `save-all flush`, ZIP copy, hash verification, final rename, database record and `save-on` in `finally`. If `save-on` cannot be confirmed, a safety stop prevents leaving the world without saving. Lifecycle operations cannot overlap a backup.

Free disk space is checked before copying. V1 accepts up to 64 GB uncompressed. Interval tasks persist between launches and require the manager to remain open. No destructive retention policy is enabled implicitly.

Restore requires the server name and a stopped server. It verifies SHA-256, backs up the current state, extracts into staging while validating every entry, validates the manifest/JAR, reinjects the secret and preserves current ports, moves the original aside, swaps folders and restores profile/plugin metadata in a SQLite transaction. If the swap or transaction fails, it restores the original folder. The safety backup remains available.

Extraction failure does not damage the original server. A power loss exactly between renames remains a risk: the `.previous` copy and safety backup permit manual recovery. Automatic interruption recovery is planned; this is not a perfectly atomic distributed transaction.

Manual archives remain until confirmed deletion. Settings/plugin safety copies consume disk space; monitor storage and explicitly remove old copies when necessary.
