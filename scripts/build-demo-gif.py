"""Encode a labeled slideshow of actual Electron captures; never simulate gameplay."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

workspace = Path(__file__).resolve().parent.parent
gallery = workspace / "docs" / "screenshots"
views = [
    ("create-summary", "Create a survival server"),
    ("server-active", "Actual process view (inert QA child, not Minecraft)"),
    ("mods", "Modrinth library with verified downloads"),
    ("datapacks", "Choose a datapack for a world"),
    ("player-details", "Player records and private notes (QA records)"),
    ("backups", "Verified backups and incremental snapshots"),
    ("partial-restore", "Review exactly what a partial restore replaces"),
    ("configuration", "Edit configuration and retain history"),
    ("notifications", "Grouped local notifications"),
]
font_path = Path("C:/Windows/Fonts/segoeui.ttf")
font = ImageFont.truetype(str(font_path), 16) if font_path.exists() else ImageFont.load_default()
frames = []
for name, caption in views:
    with Image.open(gallery / (name + ".png")) as image:
        image = image.convert("RGB")
        image.thumbnail((1080, 720), Image.Resampling.LANCZOS)
        frame = Image.new("RGB", (1080, 776), "#151515")
        frame.paste(image, ((1080 - image.width) // 2, (720 - image.height) // 2))
        draw = ImageDraw.Draw(frame)
        draw.text((16, 724), caption, font=font, fill="#80cabe")
        draw.text((16, 748), "Actual Electron captures | isolated QA data | slideshow, not gameplay", font=font, fill="#ded9d2")
        frames.append(frame.quantize(colors=256, method=Image.Quantize.MEDIANCUT))
destination = gallery / "survival-demo.gif"
frames[0].save(destination, save_all=True, append_images=frames[1:], duration=2400,
               loop=0, disposal=2, optimize=False)
with Image.open(destination) as result:
    assert result.n_frames == len(views)
    assert result.size == (1080, 776)
print(f"Encoded {len(views)} actual capture frames: {destination}")
