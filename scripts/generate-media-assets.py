"""Generate the deterministic overlay assets used by the lesson video composition.

Run from the repository root with `python3 scripts/generate-media-assets.py`.
Requires Pillow. The output files are checked in under src/server/media/assets/.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "server" / "media" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

SLIDE_WIDTH = 1280
SLIDE_HEIGHT = 960
RADIUS = 32


def build_slide_mask() -> None:
    mask = Image.new("RGBA", (SLIDE_WIDTH, SLIDE_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, SLIDE_WIDTH - 1, SLIDE_HEIGHT - 1),
        radius=RADIUS,
        fill=(255, 255, 255, 255),
    )
    mask.save(OUT / "slide-mask.png")


def build_slide_shadow() -> None:
    pad = 40
    size = (SLIDE_WIDTH + pad * 2, SLIDE_HEIGHT + pad * 2)
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    shape = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shape)
    draw.rounded_rectangle(
        (pad, pad, pad + SLIDE_WIDTH, pad + SLIDE_HEIGHT),
        radius=RADIUS,
        fill=(8, 18, 32, 150),
    )
    shadow = shape.filter(ImageFilter.GaussianBlur(18))
    shadow.save(OUT / "slide-shadow.png")


def build_vignette() -> None:
    width, height = 1920, 1080
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    # Soft edge vignette: darkest at the frame edges, clear in the middle.
    gradient = Image.radial_gradient("L").resize((width, height))
    edge = gradient.point(lambda value: max(0, 92 - int(value * 0.36)))
    tint = Image.new("RGBA", (width, height), (8, 14, 28, 255))
    tint.putalpha(edge)
    layer = Image.alpha_composite(layer, tint)

    # A barely visible lighter panel behind the character on the right.
    panel = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(panel)
    draw.rounded_rectangle((1328, 64, 1872, 1040), radius=40, fill=(255, 255, 255, 16))
    layer = Image.alpha_composite(layer, panel)

    layer.save(OUT / "vignette.png")


if __name__ == "__main__":
    build_slide_mask()
    build_slide_shadow()
    build_vignette()
    for name in ("slide-mask.png", "slide-shadow.png", "vignette.png"):
        image = Image.open(OUT / name)
        print(name, image.size, image.mode)
