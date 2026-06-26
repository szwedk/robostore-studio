#!/usr/bin/env bash
# Download the MediaPipe WASM runtime + hand-landmark model into app/public so the
# camera works fully OFFLINE in the packaged app (dev still uses the CDN by default).
# Run once before `npm run tauri build`.
set -euo pipefail
cd "$(dirname "$0")/.."

WASM_VER="0.10.35"
DEST="app/public"
mkdir -p "$DEST/mediapipe/wasm" "$DEST/models"

echo "▸ MediaPipe WASM runtime (v${WASM_VER})"
for f in \
  vision_wasm_internal.js \
  vision_wasm_internal.wasm \
  vision_wasm_nosimd_internal.js \
  vision_wasm_nosimd_internal.wasm; do
  curl -fsSL "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${WASM_VER}/wasm/${f}" \
    -o "$DEST/mediapipe/wasm/${f}"
  echo "  ✓ ${f}"
done

echo "▸ hand_landmarker model"
curl -fsSL "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" \
  -o "$DEST/models/hand_landmarker.task"
echo "  ✓ hand_landmarker.task"

echo "✓ camera assets ready in $DEST (the app now runs offline)"
