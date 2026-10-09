# MineDock brand assets

`MineDock_App_Icon.png` is the exact approved image supplied by the project owner on October 9, 2026. Its source bytes and transparent alpha are retained. It is an independent MineDock mark, not an official Minecraft/Mojang asset or an affiliation claim.

Rebuild PNG, multi-size Windows ICO, macOS ICNS, favicon and Apple touch derivatives with `python scripts/build-brand-assets.py` (Pillow required). `manifest.json` records the unchanged source hash. Derivatives only resample the approved mark; they do not invent a new logo. The desktop build copies the PNG and ICO into packaged resources. Platform package metadata uses ICO/ICNS/PNG respectively.

The source was provided for use in MineDock. The repository's MIT license covers code; it does not establish third-party rights beyond the owner's permission to use this supplied artwork. Do not represent it as Mojang artwork.

## Website landscape and social preview

`survival-dusk.png` is original artwork generated for this task with OpenAI ImageGen on October 9, 2026. It uses custom voxel materials and contains no official game textures, characters or logos. `survival-dusk.webp` is a quality-88 WebP derivative. The illustration is marketing artwork, never a screenshot of MineDock or Minecraft gameplay.

Generation prompt: “Original wide landscape illustration for the MineDock desktop software website hero. Cinematic voxel-block survival landscape at dusk: peaceful reflective lake, rugged block cliffs and layered conifer forest, a small warm lantern-lit wood cabin on the right shore and a short wooden dock, copper-orange sunset behind distant hills. Original independent artwork with custom plain voxel materials, no official Minecraft/Mojang textures, logos, characters or screenshots. Wide landscape, visually rich right two-thirds, dark quiet left third behind website text. Deep charcoal shadows, restrained teal water, warm copper lanterns and sky. Detailed atmospheric depth and crisp block geometry. No text, UI, collage, icons or watermark.” No edit or refinement was needed.

`social-preview.png` is a 1280 × 640 HTML-rendered composition of the approved icon and plain MineDock text, below GitHub's 1 MB limit. It does not contain generated software panels. The exact manual GitHub upload action is documented in [the design review](../../docs/design/reference-041/README.md).
