# V1 implementation plan

1. Foundations: strict TypeScript, Electron sandbox, React, SQLite migrations, settings, logging.
2. Minecraft: official Mojang / Paper catalogs, streamed verified downloads, isolated Temurin runtimes.
3. Lifecycle: independent processes, real output, graceful shutdown, bounded crash backoff.
4. Administration: authenticated localhost RCON, players, validated properties, contained file access.
5. Safety: verified ZIP backups, stopped transactional restore, persistent schedules.
6. Content: Modrinth server plugins for Paper, compatibility and required dependencies.
7. Monitoring: actual process CPU/RAM, retained samples, deterministic crash explanations.
8. Distribution: Windows NSIS + portable artifacts, CI on all platforms, documentation, tests.

The advanced roadmap (Bedrock, loaders, Docker, tunnels, remote accounts, cloud, AI) is deliberately outside the first release. Only functioning capabilities appear in the UI. Release auto-update needs an owned signing key and release endpoint and stays disabled until configured.
