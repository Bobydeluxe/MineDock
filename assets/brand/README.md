# MineDock brand assets

`MineDock_App_Icon.png` is the exact approved image supplied by the project owner on October 9, 2026. Its source bytes and transparent alpha are retained. It is an independent MineDock mark, not an official Minecraft/Mojang asset or an affiliation claim.

Rebuild desktop PNG, multi-size Windows ICO, macOS ICNS and SVG logo derivatives with `python scripts/build-brand-assets.py` (Pillow required). `manifest.json` records the unchanged source hash. Derivatives only resample the approved mark; they do not invent a new logo. The desktop build copies the PNG and ICO into packaged resources. Platform package metadata uses ICO/ICNS/PNG respectively. The script writes the SVG directly to the desktop asset directory.

The source was provided for use in MineDock. The repository's MIT license covers code; it does not establish third-party rights beyond the owner's permission to use this supplied artwork. Do not represent it as Mojang artwork.

## GitHub social preview

`social-preview.png` is a 1280 × 640 HTML-rendered composition of the approved icon and plain MineDock text, below GitHub's 1 MB limit. It does not contain generated software panels. It was uploaded through GitHub's supported Social preview setting and verified after reloading on October 9. [The design review](../../docs/design/reference-041/README.md) retains visual proof and reproduction steps.
