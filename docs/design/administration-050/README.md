# Administration preview website review

The existing public MineDock website retains the released 0.4.1 gallery and download links. A separate **Unreleased 0.5.0 preview** section shows the current saved-player profile with exact Java 26.3 client images, visual item search, exact-target action preview and native world controls. Captions identify synthetic saved QA data, locally derived game artwork, stopped-server commands and real isolated Paper values with no connected clients. No new release download is advertised.

The page passes local and deployed checks at 390, 768, 1280, 1440 and 1920 pixels: no horizontal overflow, broken image, missing anchor or runtime error. Three preview images match the native Electron captures by SHA-256. All 13 distinct public download URLs remain on 0.4.1.

- [Desktop page](site-1440.png)
- [Mobile page](site-390.png)
- [Native application captures and provenance](../../screenshots/player-world-050/README.md)
- [Current item-image validation](../../validation.md)
- [Exact-version probe results](../../validation-records/0.5.0-item-assets-probes.json)

The static HTML is built from `site/` by `pnpm build:site`. Sites preserves the existing public project and audience. **Sites version 8**, source `447c417e8e5407bc35c114b31f373e7910ad8d0a`, is deployed and checked on 10 October 2026. All 13 downloads return HTTP 200 with nonzero size; the three preview images match the ten-image native gallery by SHA-256. On this Windows host the standard archive wrapper requires unavailable WSL; the exact verified pushed source is packaged with Sites' shared static-build preparation and native Windows tar instead.
