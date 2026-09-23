#!/usr/bin/env python3
"""Serve the Beady preview and its local BiRefNet background-removal API."""

from __future__ import annotations

import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from services.background_removal_service import MODEL_NAME, service  # noqa: E402

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


class BeadyPreviewHandler(SimpleHTTPRequestHandler):
    server_version = "BeadyPreview/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/health":
            self._json(200, {
                "ok": True,
                "model": MODEL_NAME,
                "model_loaded": service.model_loaded,
                "runtime": "rembg",
            })
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/remove-background":
            self._json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].lower()
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            self._json(413, {"error": "图片不能为空且需小于 25 MB"})
            return
        if content_type not in ALLOWED_CONTENT_TYPES:
            self._json(415, {"error": "仅支持 JPG、PNG 或 WEBP 图片"})
            return

        filename = unquote(self.headers.get("X-File-Name", "upload"))
        self.log_message(
            "Background removal request received: %s (%d bytes, %s); model_loaded=%s",
            filename,
            length,
            content_type,
            service.model_loaded,
        )
        try:
            output, metadata = service.remove_background(self.rfile.read(length))
        except Exception as error:
            self.log_error("BiRefNet failed for %s: %s", filename, error)
            self._json(500, {"error": f"抠图失败：{error}"})
            return

        self.log_message(
            "Background removal completed: %s -> %dx%d; model_loaded=%s",
            filename,
            metadata["output_width"],
            metadata["output_height"],
            service.model_loaded,
        )

        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(output)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Background-Model", MODEL_NAME)
        self.send_header("X-Output-Size", f"{metadata['output_width']}x{metadata['output_height']}")
        self.end_headers()
        try:
            self.wfile.write(output)
        except BrokenPipeError:
            self.log_message("Client disconnected after inference completed for %s", filename)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(("127.0.0.1", port), BeadyPreviewHandler)
    print(f"Beady preview: http://localhost:{port}/preview/", flush=True)
    print(f"Background removal API: http://localhost:{port}/api/remove-background", flush=True)
    print(f"Background removal: rembg + {MODEL_NAME} (model loads on first upload)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
