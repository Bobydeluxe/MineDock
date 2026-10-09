# Build commands

The reference-design branch builds **0.4.1 for review**. The current public release remains **0.4.0** until explicit approval, native validation and publication. Rebuild the approved platform icons with `python scripts/build-brand-assets.py` before changing their packaging inputs.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:windows  # native Windows x64/ARM64
pnpm build:linux    # native Linux x64/ARM64
pnpm build:mac      # native macOS Intel/Apple Silicon
pnpm test:packaged
pnpm updates:sign
```

`build` writes bundled main/preload, the renderer and dependency notices to `dist/`. End users need no Node/pnpm. Native packaging writes `release/`, including an unpacked application for tests. Cross-OS packaging is refused by the script; choose a native CI runner. Keep `PRODUCT.version` and `package.json` synchronized.

Local unsigned packaging is supported without platform certificates. Optional signing/notarization and the separate updater publisher key are explained in [distribution](distribution.md) and [update-system](update-system.md). The workflow uploads artifacts; only tested artifacts with matching metadata should be published as a release. [Validation](validation.md) distinguishes compilation, execution, automated tests and real gameplay.
