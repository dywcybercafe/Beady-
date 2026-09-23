#!/usr/bin/env python3
"""Compare BiRefNet General and General Lite with the production cutout path."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from PIL import Image  # noqa: E402
from services.background_removal_service import BackgroundRemovalService  # noqa: E402

MODELS = ("birefnet-general-lite", "birefnet-general")


def alpha_report(output_path: Path) -> dict:
    with Image.open(output_path) as image:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        histogram = alpha.histogram()
        pixels = rgba.width * rgba.height
        checker = Image.new("RGB", rgba.size, "#eceaf0")
        tile = 24
        for y in range(0, rgba.height, tile):
            for x in range(0, rgba.width, tile):
                if (x // tile + y // tile) % 2:
                    checker.paste("#ffffff", (x, y, min(x + tile, rgba.width), min(y + tile, rgba.height)))
        checker.paste(rgba, mask=alpha)
        checker.save(output_path.with_name(f"{output_path.stem}-checker.jpg"), quality=92)
        return {
            "output_width": rgba.width,
            "output_height": rgba.height,
            "transparent_ratio": round(sum(histogram[:8]) / pixels, 4),
            "soft_edge_pixels": sum(histogram[8:248]),
        }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: benchmark_birefnet_models.py INPUT [OUTPUT_DIRECTORY]")
    source_path = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else PROJECT_ROOT / "benchmark" / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)
    source = source_path.read_bytes()
    results = []
    for model_name in MODELS:
        service = BackgroundRemovalService(model_name)
        started = time.perf_counter()
        output, metadata = service.remove_background(source)
        cold_elapsed = time.perf_counter() - started
        warm_started = time.perf_counter()
        warm_output, warm_metadata = service.remove_background(source)
        warm_elapsed = time.perf_counter() - warm_started
        if warm_metadata != metadata:
            raise RuntimeError(f"{model_name} produced inconsistent dimensions")
        if warm_output != output:
            raise RuntimeError(f"{model_name} produced inconsistent output")
        output_path = output_dir / f"felt-cat-{model_name}.png"
        output_path.write_bytes(output)
        results.append({
            "model": model_name,
            "cold_seconds": round(cold_elapsed, 2),
            "warm_seconds": round(warm_elapsed, 2),
            **metadata,
            **alpha_report(output_path),
            "output": str(output_path),
        })
        print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    report_path = output_dir / "felt-cat-birefnet-comparison.json"
    report_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(report_path), "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
