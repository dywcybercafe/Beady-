"""Extract the user-provided artwork from the supplied sprite sheets.

The source PNGs contain a baked-in checkerboard rather than a real alpha
channel. This script crops only the supplied artwork and converts that neutral
checkerboard to transparency without redrawing the assets.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "images"
ELEMENTS = ROOT / "图标元素图.png"
CLOUD = Path("/Users/dongyunwei/Desktop/Codex 图像 2026年9月19日 18_29_57.png")


def transparent_crop(source: Path, box: tuple[int, int, int, int], output: Path, max_size: int) -> None:
    image = Image.open(source).convert("RGB").crop(box)
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    highest = rgb.max(axis=2)
    lowest = rgb.min(axis=2)
    saturation = np.divide(highest - lowest, highest, out=np.zeros_like(highest), where=highest > 0)

    colored = Image.fromarray(((saturation > 0.16) * 255).astype(np.uint8))
    colored = colored.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    proximity = colored.filter(ImageFilter.MaxFilter(31))
    near_art = np.asarray(proximity, dtype=np.float32) / 255.0

    color_alpha = np.clip((saturation - 0.055) / 0.08, 0, 1) * near_art
    white_alpha = np.clip((highest - 0.90) / 0.08, 0, 1) * near_art
    dark_alpha = np.clip((0.40 - highest) / 0.22, 0, 1) * near_art
    alpha = np.maximum.reduce((color_alpha, white_alpha, dark_alpha))
    solid = Image.fromarray(((alpha > 0.08) * 255).astype(np.uint8))
    solid = solid.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    flood = solid.copy()
    ImageDraw.floodfill(flood, (0, 0), 128, thresh=0)
    enclosed = np.asarray(flood) == 0
    alpha[enclosed] = 1
    alpha = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))

    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    content_box = rgba.getbbox()
    if content_box:
        rgba = rgba.crop(content_box)

    scale = min(1.0, max_size / max(rgba.size))
    if scale < 1:
        rgba = rgba.resize(
            (max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale))),
            Image.Resampling.LANCZOS,
        )
    rgba.save(output, optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    transparent_crop(ELEMENTS, (35, 120, 1050, 550), OUTPUT / "beady-logo.png", 720)
    transparent_crop(ELEMENTS, (1050, 150, 1375, 485), OUTPUT / "canvas-size.png", 256)
    transparent_crop(ELEMENTS, (1410, 150, 1725, 485), OUTPUT / "background.png", 256)
    transparent_crop(ELEMENTS, (1785, 150, 2110, 485), OUTPUT / "color-limit.png", 256)
    transparent_crop(CLOUD, (205, 55, 1335, 985), OUTPUT / "upload-cloud.png", 560)


if __name__ == "__main__":
    main()
