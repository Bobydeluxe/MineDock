# Extension implementation map

The original local-first architecture is reused. Engine capabilities and runtime types support the wider adapters; appended SQLite migrations underpin content/player/world history, imports, partial downloads and long-operation recovery. Those services feed the actual validated IPC and capability-aware React views.

The implementation proceeds through foundations, engines, content, crossplay, imports/worlds, files/players/storage, schedules/retention, runtime maintenance, secure updates/distribution and final verification/documentation. The [work record](extension-progress.md) records intermediate findings; [validation](validation.md) is the authority for final tested results. [Roadmap](roadmap.md) lists only remaining prerequisites/validation and future scope.

No unavailable API/certificate/native gameplay path is replaced by production mock data. Demo/test fixtures remain explicit and isolated. The project and default interface remain English with six supported languages.
