# MineDock 0.4.1

A cleaner black interface, complete engine version lists and safer server customization. All survival, content and backup tools from 0.4.0 remain available. English is the default; French, German, Spanish, Portuguese and Italian are included.

## Added

- The approved teal/copper cube icon for desktop packages, the website and documentation.
- Complete official build catalogs, independent Fabric loader/installer choices, search, refresh and labeled cached/offline results.
- A categorized, searchable graphical properties editor with typed controls, change review and protected saving.
- Local server profile names and images, distinct from Minecraft MOTD and world names.
- Carefully selected graphical Paper/Purpur configuration options, with the existing text editor available for complex settings.

## Improved

The interface keeps compact server rows, numbered creation steps, engine information and clear controls, with a focused cleanup to neutral black/charcoal surfaces. Dashboard, Backups, servers and Settings form the main navigation. The breadcrumb/global-search strip, workspace promotion and repeated decorative labels are removed. Notifications, their preferences/history, recovery tools and searchable audit history live in Settings. Console categories and backup filters use real logs and backup metadata. All six languages remain available; English is primary. The website uses original dusk scenery and actual 0.4.1 screenshots, with downloads for every produced platform.

## Fixed

- Notification switches retain their new state while saving and restore the previous value if saving fails.
- Historical Fabric installers are no longer reduced to one stable entry; explicit loader/installer selections reach installation and migration plans unchanged.
- Beginner engine recommendations require an available build. Experimental and unsupported choices have explicit states.
- Properties saves preserve unrelated comments, formatting, unknown keys and inherited values, reject stale files and removed/version-incompatible settings, protect secrets and take safety backups.
- Unsaved property/profile edits are protected during navigation and native window closing.
- Unavailable server metrics remain unavailable instead of inventing activity.

## Download

Choose the package matching your computer. No Node.js or pnpm installation is needed.

| Platform            | Packages                                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64         | [Setup](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-Setup-x64.exe) · [Portable](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-Portable-x64.exe)     |
| Windows ARM64       | [Setup](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-Setup-arm64.exe) · [Portable](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-Portable-arm64.exe) |
| Linux x64           | [AppImage](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-x86_64.AppImage) · [deb](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-amd64.deb)            |
| Linux ARM64         | [AppImage](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-arm64.AppImage) · [deb](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-arm64.deb)             |
| macOS Intel         | [dmg](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-x64.dmg) · [zip](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-x64.zip)                           |
| macOS Apple Silicon | [dmg](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-arm64.dmg) · [zip](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-0.4.1-arm64.zip)                       |

Verify your download against [SHA256SUMS.txt](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/SHA256SUMS.txt). [Complete feature list](https://github.com/Bobydeluxe/MineDock/releases/download/v0.4.1/MineDock-Features.txt). Twelve packages were produced on their native OS/architecture and passed the recorded packaged tests.

### Upgrading

Close MineDock, retain your storage folders and use the same OS account. The application reuses your existing profile, servers, SQLite database, backups, runtimes, player data and tasks. Version 0.4.1 retains schema 11. From 0.3.0 on Windows, the first upgrade may require opening the verified new package manually. Keep a backup of your data. See [validation](validation.md) for exact migration evidence.

## Known issues

Windows and macOS builds have no OS publisher certificate or notarization. Signed updater metadata is a separate integrity mechanism. The old 0.3.0 Windows launcher may require a manual first upgrade. Native packaged tests do not establish OS installation/update behavior on Linux/macOS/ARM64, multiplayer gameplay or live map rendering. Existing Windows pinned shortcuts may need to be re-pinned to refresh the OS icon cache; their visible taskbar state was not observed here. Incremental snapshot deletion/garbage collection and legacy full-ZIP partial restore remain unavailable. Bedrock offers only actually linked official platform binaries; PocketMine upstream support has ended. All historical engine combinations are not guaranteed compatible.
