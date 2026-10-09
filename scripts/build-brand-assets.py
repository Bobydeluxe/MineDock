"""Deterministic format/size derivatives of the approved, unchanged PNG (Pillow)."""
from pathlib import Path
from hashlib import sha256
from PIL import Image
import base64
import json

root = Path(__file__).resolve().parent.parent
source = root / 'assets/brand/MineDock_App_Icon.png'
image = Image.open(source).convert('RGBA')
desktop = root / 'apps/desktop/assets'
brand = source.parent
sizes = (16, 24, 32, 48, 64, 128, 256, 512, 1024)
for size in sizes:
    image.resize((size, size), Image.Resampling.LANCZOS).save(brand / f'icon-{size}.png')
image.resize((1024, 1024), Image.Resampling.LANCZOS).save(desktop / 'icon.png')
image.resize((1024, 1024), Image.Resampling.LANCZOS).save(desktop / 'icon.icns', format='ICNS')
image.resize((256, 256), Image.Resampling.LANCZOS).save(desktop / 'icon.ico', format='ICO', sizes=[(s, s) for s in sizes if s <= 256])
image.resize((180, 180), Image.Resampling.LANCZOS).save(brand / 'apple-touch-icon.png')
encoded = base64.b64encode((brand / 'icon-128.png').read_bytes()).decode()
(brand / 'favicon.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><image width="128" height="128" href="data:image/png;base64,{encoded}"/></svg>\n', encoding='utf8')
(desktop / 'logo.svg').write_text((brand / 'favicon.svg').read_text(encoding='utf8'), encoding='utf8')
(brand / 'manifest.json').write_text(json.dumps({'source': source.name, 'sourceSha256': sha256(source.read_bytes()).hexdigest(), 'sourcePixels': list(image.size), 'sourceUnmodified': True, 'pngSizes': sizes, 'icoSizes': [s for s in sizes if s <= 256], 'conversion': 'Pillow LANCZOS; no recoloring, tracing or regenerated mark'}, indent=2)+'\n', encoding='utf8')
print('Approved icon derivatives generated.')
