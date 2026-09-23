"""BiRefNet General Lite background removal, isolated from the felt-board UI."""

from __future__ import annotations

import io
import os
import threading
from pathlib import Path
from typing import Dict, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = PROJECT_ROOT / "runtime" / "models"
MODEL_NAME = "birefnet-general-lite"
os.environ.setdefault("U2NET_HOME", str(MODEL_DIR))
os.environ.setdefault("OMP_NUM_THREADS", str(max(1, min(4, os.cpu_count() or 1))))

from PIL import Image, ImageOps  # noqa: E402
from rembg import new_session, remove  # noqa: E402


class BackgroundRemovalService:
    """Owns one reusable rembg session and returns tightly cropped transparent PNGs."""

    def __init__(self, model_name: str = MODEL_NAME) -> None:
        self.model_name = model_name
        self._session = None
        self._session_lock = threading.Lock()
        self._inference_lock = threading.Lock()

    def _get_session(self):
        if self._session is None:
            with self._session_lock:
                if self._session is None:
                    MODEL_DIR.mkdir(parents=True, exist_ok=True)
                    self._session = new_session(
                        self.model_name,
                        providers=["CPUExecutionProvider"],
                    )
        return self._session

    @property
    def model_loaded(self) -> bool:
        return self._session is not None

    def remove_background(self, source: bytes) -> Tuple[bytes, Dict[str, int]]:
        if not source:
            raise ValueError("上传的图片为空")

        with Image.open(io.BytesIO(source)) as opened:
            oriented = ImageOps.exif_transpose(opened).convert("RGB")
            source_size = oriented.size
            normalized = io.BytesIO()
            oriented.save(normalized, format="PNG")

        with self._inference_lock:
            cutout_bytes = remove(
                normalized.getvalue(),
                session=self._get_session(),
                alpha_matting=False,
                post_process_mask=False,
                force_return_bytes=True,
            )

        with Image.open(io.BytesIO(cutout_bytes)) as cutout:
            rgba = cutout.convert("RGBA")
            alpha = rgba.getchannel("A")
            # The mask already comes from BiRefNet. This threshold is used only to
            # locate non-empty alpha bounds; it never alters the mask or its edges.
            bounds = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
            if bounds is None:
                raise ValueError("未识别到可保留的前景主体")
            left, top, right, bottom = bounds
            padding = 2
            crop_box = (
                max(0, left - padding),
                max(0, top - padding),
                min(rgba.width, right + padding),
                min(rgba.height, bottom + padding),
            )
            cropped = rgba.crop(crop_box)
            output = io.BytesIO()
            cropped.save(output, format="PNG", optimize=True)

        return output.getvalue(), {
            "source_width": source_size[0],
            "source_height": source_size[1],
            "output_width": cropped.width,
            "output_height": cropped.height,
        }


service = BackgroundRemovalService()
