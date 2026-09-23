#!/usr/bin/env python3
"""Run the supplied felt-art photo through the production BiRefNet service."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from PIL import Image  # noqa: E402

from services.background_removal_service import MODEL_NAME, service  # noqa: E402


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: benchmark_background_removal.py INPUT OUTPUT")
    source_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    output, metadata = service.remove_background(source_path.read_bytes())
    output_path.write_bytes(output)

    with Image.open(output_path) as image:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        histogram = alpha.histogram()
        pixels = rgba.width * rgba.height
        report = {
            "model": MODEL_NAME,
            **metadata,
            "output_mode": rgba.mode,
            "transparent_pixels": sum(histogram[:8]),
            "opaque_pixels": sum(histogram[248:]),
            "soft_edge_pixels": sum(histogram[8:248]),
            "transparent_ratio": round(sum(histogram[:8]) / pixels, 4),
        }

        checker = Image.new("RGB", rgba.size, "#eceaf0")
        tile = 24
        for y in range(0, rgba.height, tile):
            for x in range(0, rgba.width, tile):
                if (x // tile + y // tile) % 2:
                    checker.paste("#ffffff", (x, y, min(x + tile, rgba.width), min(y + tile, rgba.height)))
        checker.paste(rgba, mask=alpha)
        preview_path = output_path.with_name(f"{output_path.stem}-checker.jpg")
        checker.save(preview_path, quality=92)

    report_path = output_path.with_suffix(".json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({**report, "output": str(output_path), "preview": str(preview_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
