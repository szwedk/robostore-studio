#!/usr/bin/env bash
# RoboStore Studio — development runner.
# Starts the Python engine (simulator by default) and the Vite UI together.
#
#   ./scripts/dev.sh            # simulator (no hardware)
#   ./scripts/dev.sh --port /dev/cu.usbserial-XXXX   # real Revo2
set -euo pipefail
cd "$(dirname "$0")/.."

PYTHON="${PYTHON:-/opt/anaconda3/bin/python}"
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON="python3"

ENGINE_ARGS=("--http-port" "8765")
if [[ "${1:-}" == "--port" && -n "${2:-}" ]]; then
  ENGINE_ARGS+=("--port" "$2")
else
  ENGINE_ARGS+=("--sim")
fi

echo "▸ starting engine: $PYTHON -m engine.run ${ENGINE_ARGS[*]}"
"$PYTHON" -m engine.run "${ENGINE_ARGS[@]}" &
ENGINE_PID=$!
trap 'kill $ENGINE_PID 2>/dev/null || true' EXIT

echo "▸ starting UI on http://127.0.0.1:1420"
( cd app && npm run dev )
