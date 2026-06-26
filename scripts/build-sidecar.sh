#!/usr/bin/env bash
# Freeze the Python engine into a self-contained binary and name it the way Tauri
# expects a sidecar (studio-engine-<target-triple>), placed in app/src-tauri/binaries/.
#
# Bundles bc_stark_sdk + libusb, so the result runs on machines that have never
# seen Homebrew/apt. Run on each target OS (or in CI) — a frozen binary is
# platform-specific.
#
#   PYTHON=/opt/anaconda3/bin/python ./scripts/build-sidecar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PYTHON="${PYTHON:-/opt/anaconda3/bin/python}"
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON="python3"

# Target triple (matches Tauri's sidecar naming).
if command -v rustc >/dev/null 2>&1; then
  TRIPLE="$(rustc -vV | sed -n 's/host: //p')"
else
  OS="$(uname -s)"; ARCH="$(uname -m)"
  case "$OS-$ARCH" in
    Darwin-arm64)   TRIPLE="aarch64-apple-darwin" ;;
    Darwin-x86_64)  TRIPLE="x86_64-apple-darwin" ;;
    Linux-x86_64)   TRIPLE="x86_64-unknown-linux-gnu" ;;
    Linux-aarch64)  TRIPLE="aarch64-unknown-linux-gnu" ;;
    *) echo "Unknown host $OS-$ARCH — pass a target triple via rustc"; exit 1 ;;
  esac
fi
EXT=""; case "$TRIPLE" in *windows*) EXT=".exe" ;; esac

OUT_DIR="app/src-tauri/binaries"
mkdir -p "$OUT_DIR"

echo "▸ ensuring PyInstaller is present"
"$PYTHON" -c "import PyInstaller" 2>/dev/null || "$PYTHON" -m pip install --quiet pyinstaller

echo "▸ freezing engine for $TRIPLE"
"$PYTHON" -m PyInstaller \
  --onefile \
  --name studio-engine \
  --collect-all bc_stark_sdk \
  --collect-submodules engine \
  --hidden-import bc_stark_sdk.main_mod \
  --distpath build/sidecar/dist \
  --workpath build/sidecar/work \
  --specpath build/sidecar \
  --noconfirm \
  studio_engine.py

cp "build/sidecar/dist/studio-engine${EXT}" "${OUT_DIR}/studio-engine-${TRIPLE}${EXT}"
echo "✓ ${OUT_DIR}/studio-engine-${TRIPLE}${EXT}"
