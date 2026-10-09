# Administration preview website review

The existing public MineDock website retains the released 0.4.1 gallery and download links. A separate **Unreleased 0.5.0 preview** section adds the actual saved-player profile, exact-target action preview and native world controls. Captions identify synthetic saved QA data, stopped-server commands and real isolated Paper values with no connected clients. No new release download is advertised.

The page passes local and deployed checks at 390, 768, 1280, 1440 and 1920 pixels: no horizontal overflow, broken image, missing anchor or runtime error. Three preview images match the native Electron captures by SHA-256. All 13 distinct public download URLs remain on 0.4.1.

- [Desktop page](site-1440.png)
- [Mobile page](site-390.png)
- [Native application captures and provenance](../../screenshots/player-world-050/README.md)
- [Exact validation record](../../validation-records/0.5.0-administration.json)

The static HTML is built from `site/` by `pnpm build:site`. Sites preserves the existing public project and audience. On this Windows host the standard archive wrapper requires unavailable WSL; the exact verified pushed source is packaged with Sites' shared static-build preparation and native Windows tar instead.
