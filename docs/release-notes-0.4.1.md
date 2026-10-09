# MineDock 0.4.1 — review candidate

These notes describe the implemented candidate. **0.4.0 remains the public release.** Publishing 0.4.1 requires the owner's explicit approval and the verified native artifacts recorded in [validation](validation.md).

## Added

- The approved teal/copper cube icon for desktop packages, the website and documentation.
- Complete official build catalogs, independent Fabric loader/installer choices, search, refresh and labeled cached/offline results.
- A categorized, searchable graphical properties editor with typed controls, change review and protected saving.
- Local server profile names and images, distinct from Minecraft MOTD and world names.
- Carefully selected graphical Paper/Purpur configuration options, with the existing text editor available for complex settings.

## Improved

The interface keeps compact server rows, numbered creation steps, engine information and clear controls, with a focused cleanup to neutral black/charcoal surfaces. Dashboard, Backups, servers and Settings form the main navigation. The breadcrumb/global-search strip, workspace promotion and repeated decorative labels are removed. Notifications, their preferences/history, recovery tools and searchable audit history live in Settings. Console categories and backup filters use real logs and backup metadata. All six languages remain available; English is primary. The website uses original dusk scenery and actual cleaned candidate screenshots, with downloads still pointing to the public release.

## Fixed

- Notification switches retain their new state while saving and restore the previous value if saving fails.
- Historical Fabric installers are no longer reduced to one stable entry; explicit loader/installer selections reach installation and migration plans unchanged.
- Beginner engine recommendations require an available build. Experimental and unsupported choices have explicit states.
- Properties saves preserve unrelated comments, formatting, unknown keys and inherited values, reject stale files and removed/version-incompatible settings, protect secrets and take safety backups.
- Unsaved property/profile edits are protected during navigation and native window closing.
- Unavailable server metrics remain unavailable instead of inventing activity.

## Known issues

Windows and macOS builds have no OS publisher certificate or notarization. Signed updater metadata is a separate integrity mechanism. The old 0.3.0 Windows launcher may require a manual first upgrade. Native packaged tests do not establish OS installation/update behavior on Linux/macOS/ARM64, multiplayer gameplay or live map rendering. Existing Windows pinned shortcuts may need to be re-pinned to refresh the OS icon cache; their visible taskbar state was not observed here. Incremental snapshot deletion/garbage collection and legacy full-ZIP partial restore remain unavailable. Bedrock offers only actually linked official platform binaries; PocketMine upstream support has ended. All historical engine combinations are not guaranteed compatible.
