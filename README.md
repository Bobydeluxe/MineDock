# MineDock

A desktop Minecraft server manager that keeps your worlds on your computer. **V1 beta 0.2.0**, original code under the MIT license.

English is the project's primary language and the application's default. The app also supports **French, German, Spanish, Portuguese and Italian**. Choose a language during setup or in Settings; your preference is remembered between launches. Upgrades preserve your existing language choice.

## Install on Windows 11

Download builds from [GitHub Releases](https://github.com/Bobydeluxe/MineDock/releases). The multilingual beta 0.2.0 provides a [Windows x64 installer](https://github.com/Bobydeluxe/MineDock/releases/download/v0.2.0/MineDock-0.2.0-Setup-x64.exe), a [portable executable](https://github.com/Bobydeluxe/MineDock/releases/download/v0.2.0/MineDock-0.2.0-Portable-x64.exe) and [SHA-256 checksums](https://github.com/Bobydeluxe/MineDock/releases/download/v0.2.0/SHA256SUMS.txt).

Local builds are in `release/`:

- `MineDock-0.2.0-Setup-x64.exe`: installer for the current user.
- `MineDock-0.2.0-Portable-x64.exe`: executable requiring no installation.
- `win-unpacked/MineDock.exe`: unpacked application for diagnostics.

These beta builds are unsigned. You do not need a cloud account, Node or a manual Java installation. MineDock downloads the required Java runtime when needed. The portable edition also keeps persistent data in your user profile; it does not store worlds beside the executable.

1. Launch MineDock and complete setup.
2. Create a Paper or Vanilla server and select its Minecraft version and RAM.
3. Read and personally accept the Minecraft EULA in the wizard.
4. Start the server, wait for **Online**, then connect a matching Minecraft client using the displayed address.
5. Use the Console, Players, Files, Backups and Settings tabs.

MineDock must remain open to supervise servers and run scheduled tasks. Closing it stops servers gracefully. Paper may download additional Minecraft files on its first startup. After complete installation and a first startup, local administration works offline.

## Implemented features

- Electron with an isolated renderer, React, strict TypeScript, Vite, Tailwind and SQLite with versioned migrations.
- Official Vanilla and Paper catalogs; release versions, stable Paper builds and retry of incomplete installations.
- Isolated Temurin runtimes and Java detection, with separate Mojang and Paper Java requirements.
- Independent server processes, start/stop/restart, crash explanations and bounded automatic restarts.
- Virtualized live console, search, filters, copying, command history and authenticated RCON.
- Player list and kick/ban/op/deop/whitelist commands.
- Graphical `server.properties` editing and per-server RAM/runtime settings.
- Contained file browsing, text editor, JSON validation, import/export, folder creation and confirmed deletion.
- Complete ZIP backups with SHA-256, live `save-off`/`save-all flush`/`save-on`, staged restore, safety backup and plugin metadata restoration.
- Persistent interval tasks: backup, start, stop, restart and command. Missed runs coalesce into one execution.
- Compatible Modrinth Paper plugins, required dependencies, pinned versions and enable/disable while stopped.
- Real Java process CPU/RAM, seven-day metric history, server storage, audit trail and separate application logs.
- Six interface languages, localized MineDock diagnostics, light/dark/system themes and optional temporary sleep prevention.
- Server deletion into a local trash folder, preserving its files.

Manual backups are never automatically purged. V1 limits backups to 64 GB of uncompressed data and text editing to 2 MB. Running servers' files can be viewed; writes require a stopped server. The [complete feature list](MineDock-Features.txt) distinguishes implemented features from planned work.

## Development

Requires Node **24+** and pnpm **11+**. Build Windows packages on Windows; Linux and macOS have their own CI jobs.

```sh
pnpm install
pnpm dev
pnpm dev:mock
pnpm test
pnpm test:ui
pnpm lint
pnpm typecheck
pnpm build
pnpm build:windows
```

`dev` runs the real desktop and its local services. `dev:mock` opens a browser with **explicitly simulated data** and manages no real server. Restart `dev` after main-process or preload changes; Vite reloads the renderer automatically.

```sh
pnpm test:live      # Real downloads, Java and Paper bootstrap with eula=false
pnpm test:packaged  # Windows binary smoke test after build:windows
pnpm build:linux
pnpm build:mac
```

UI tests use Edge on Windows and Chromium on Linux/macOS. On those systems run `pnpm exec playwright install --with-deps chromium`. Linux desktop tests require a graphical display or Xvfb. No test accepts a real server's EULA on your behalf.

## Architecture

```text
apps/desktop/       Electron main, preload, React and original assets
packages/domain/    types, validation, properties, languages and diagnostics
packages/core/      application services, events, files, logs and scheduler
packages/database/  SQLite repository and migrations
packages/minecraft/ versions and downloads
packages/runtime-manager/  Temurin runtimes
packages/server-core/      supervisor and metrics
packages/rcon/      RCON protocol
packages/backups/   archives and restoration
packages/marketplace/       Modrinth
packages/security/ paths and secrets
packages/networking/       ports and local network
tests/             unit, integration and UI tests
docs/              architecture, security, validation and roadmap
```

Read the [architecture](docs/architecture.md), [security](docs/security.md), [localization](docs/localization.md), [validation](docs/validation.md) and [V1 limitations](docs/roadmap.md). New to GitHub? See [the beginner guide](GITHUB-GUIDE.txt).

## Preview

![MineDock dashboard with demonstration data](docs/screenshots/dashboard-demo.png)

This screenshot shows demo mode, identified by its banner. A fresh installation starts with an empty server list.

## Functional references

[Minecraft Server Manager](https://github.com/anefzaoui/minecraft-server-manager) and [PocketMC](https://pocketmc.github.io/) informed the public feature research only. No code, assets, logos or text were copied from those projects. MineDock is not affiliated with Mojang, Microsoft or PaperMC.
