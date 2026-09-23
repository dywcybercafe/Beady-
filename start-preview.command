#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"

PYTHON="$PROJECT_DIR/.venv/bin/python"
PORT="${1:-4174}"

if [ ! -x "$PYTHON" ]; then
  echo "Missing .venv. Run: python3 -m venv .venv && .venv/bin/python -m pip install -r requirements-rembg.txt"
  exit 1
fi

exec "$PYTHON" scripts/serve_preview.py "$PORT"
