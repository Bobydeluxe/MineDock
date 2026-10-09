# MineDock 0.4.1 — focused UI cleanup

The owner's annotated review requested simplification, not another redesign. Existing server rows, creation/version selectors, categorized settings, console controls and backup workflows are retained. The current public release is MineDock 0.4.1, implemented in [PR #8](https://github.com/Bobydeluxe/MineDock/pull/8).

## Removed from the actual application

- Sidebar Operations, Activity and Notifications destinations, including their old standalone renderer routes.
- The complete top breadcrumb/global-search strip, its LOCAL status, search icon, Ctrl+K control and command palette.
- The sidebar workspace promotion, associated LOCAL block, beta badge and local/version footer.
- Page eyebrows such as Minecraft Server Manager/Servers/Settings, redundant metric captions and the dashboard marketing card. The sidebar Servers label is regular navigation text rather than an uppercase decorative ribbon.
- Obsolete selectors and the removed containers' spacing. Dashboard events occupy the available width only when actual records exist.

## Retained and relocated

**Settings → Notifications** contains real native-delivery/category preferences and existing advanced thresholds. **Notification history** expands inline for grouped notices and individual/all-read actions. Saving a switch updates its displayed state immediately, prevents concurrent changes and rolls back the display if the API rejects the save.

**Settings → Recovery and background tasks** is collapsed and shows only unfinished/attention-required work, including cancellation and reviewed recovery. **Settings → History** retains searchable audit records. These use the existing APIs/database; no server data or backend service is removed. Local server/content/console searches remain; Ctrl+K does not open a replacement global bar.

Useful state, version, compatibility, backup-type and count badges remain because they identify real behavior. The light palette, server actions, engine choices and existing six languages are retained.

## Black base

| Surface                 | Dark value            |
| ----------------------- | --------------------- |
| Application             | `#0b0b0b`             |
| Sidebar                 | `#101010`             |
| Panel / card            | `#171717` / `#1c1c1c` |
| Input / dialog          | `#111111` / `#181818` |
| Hover / selected        | `#303030`             |
| Console                 | `#080808`             |
| Subtle / control border | `#383838` / `#7c7c7c` |

Every base surface has equal RGB channels. Teal remains in action buttons, selected text/rails, links and focus. Semantic status/action fills are retained. Contrast, keyboard/dialog behavior and compact-window geometry are covered by the UI suite.

## Actual cleaned captures

| View       | Current capture                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard  | ![Clean black dashboard](../../screenshots/dashboard.png)                                                                                                                |
| Creation   | [Engine steps](../../screenshots/create-server.png), [Fabric lists](../../screenshots/fabric-versions.png)                                                               |
| Server     | [Overview](../../screenshots/server.png), [properties](../../screenshots/server-settings.png)                                                                            |
| Settings   | [Preferences](../../screenshots/settings.png), [notification history inside Settings](../../screenshots/notifications.png)                                               |
| Management | [Console](../../screenshots/console.png), [backups](../../screenshots/backups.png), [mods](../../screenshots/mods.png), [performance](../../screenshots/performance.png) |

The [complete 48-image gallery](../../screenshots/README.md) records isolated QA profiles, real verified content and inert-process measurements. It does not claim Minecraft multiplayer. The site gallery uses these current captures. Earlier interface images have been retired from the current tree; [the immutable earlier review](https://github.com/Bobydeluxe/MineDock/blob/944caa8726dd26f2851230fabfcf39149e5c38c1/docs/design/reference-041/README.md) remains in Git history.

See [validation](../../validation.md) for exact commands, native build coverage and remaining platform limitations. The 0.4.1 release publishes the validated cleanup packages as separate assets. Historical published binaries remain unchanged.
