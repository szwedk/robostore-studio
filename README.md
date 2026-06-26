# RoboStore Studio

A sellable, native desktop app for the **BrainCo Revo2** hand — control, learn,
and develop, with camera-driven control. Co-branded RoboStore, built to ship in
the box with each hand.

> A ground-up rebuild of the BrainCo Revo2 control software. Code lives in
> [`engine/`](engine/) (Python device engine) and [`app/`](app/) (Tauri + React UI).
> The original prototype is kept for reference only in a separate repo,
> [`brainco-revo2-hand-control`](https://github.com/szwedk/brainco-revo2-hand-control)
> (under `legacy/`).

---

## Architecture

```
Tauri shell (Rust)          native window · bundled sidecar · updates · license
  └── React + TS + Tailwind  the UI                    app/src
        │  local WebSocket (typed JSON, ws://127.0.0.1:8765/ws)
        ▼
      Python engine          device adapters · simulator · camera   engine/
        └── BrainCo Revo2 (USB serial)   [Inspire fork later]
```

- **One device model, one protocol.** The engine sends its device model (fingers,
  poses, force thresholds) in a `hello` frame, so the UI never hard-codes a
  device. See [`engine/protocol.py`](engine/protocol.py) ⇄ [`app/src/lib/protocol.ts`](app/src/lib/protocol.ts).
- **Simulator-first.** With no hand attached the engine runs a believable virtual
  Revo2 — the whole app (control, poses, sensors, camera, demos) works for
  showroom, QA, and offline use.
- **Re-skinnable.** Brand + product strings live in
  [`app/src/brand.config.ts`](app/src/brand.config.ts); colors are CSS-variable
  tokens in [`app/src/styles/index.css`](app/src/styles/index.css). The Inspire
  fork and any white-label is a token + string swap.

---

## Run it (development, no Rust required)

All scripts run **from the repo root** (not from `app/`).

```bash
# one-time setup
pip install -r engine/requirements.txt   # engine + BrainCo SDK (needs libusb — see file)
( cd app && npm install )                 # UI deps

# run (from the repo root)
./scripts/dev.sh             # simulator — starts engine + UI together
# open http://127.0.0.1:1420
```

Use a real hand instead of the simulator:

```bash
./scripts/dev.sh --port /dev/cu.usbserial-FTAHKGS21
```

Activate with a license key when prompted — issue one with
`node scripts/mint-license.mjs` (also from the repo root).

The engine alone (e.g. to point a browser or external code at it):

```bash
python -m engine.run --sim            # or --port /dev/cu.usbserial-XXXX
```

## Run as the native app (requires Rust + Tauri CLI)

```bash
cargo install create-tauri-app --locked   # if needed
cd app && npm install
npm run tauri dev      # spins up Vite + the Rust shell window
```

In dev the Rust shell expects the engine to be started separately (the dev
script does this). In a packaged build the engine is bundled as a **sidecar**.

## Package as a downloadable app

The product is a **downloadable desktop app** (Tauri) with **offline license-key
activation** — no backend, no internet needed. Two ways to build it:

### A. CI (recommended) — builds all targets, no local toolchain

Tag a release and [`.github/workflows/release.yml`](.github/workflows/release.yml)
builds **macOS (Apple Silicon + Intel)** and **Linux** installers and attaches
them to a draft GitHub Release:

```bash
git tag v0.1.0 && git push --tags     # or run the workflow manually
```

Each runner freezes the Python engine (with libusb + the BrainCo SDK bundled),
vendors the offline camera assets, generates icons, and runs `tauri build`.

### B. Local — build for your own machine (needs Rust)

```bash
# one-time
curl https://sh.rustup.rs -sSf | sh          # install Rust
cd app && npm install && cd ..

# every build
./scripts/build-sidecar.sh                    # freeze engine → src-tauri/binaries/  ✅ verified
./scripts/fetch-camera-assets.sh              # vendor MediaPipe for offline          ✅ verified
cd app && npm run icons                        # generate app icons from the logo
npm run tauri build                            # → src-tauri/target/release/bundle/
```

Outputs: `.dmg` (macOS) / `.AppImage` + `.deb` (Linux). The engine binary is
self-contained — **verified on Apple Silicon**: a 13 MB `studio-engine` with
`libusb-1.0.0.dylib` + `bc_stark_sdk` bundled in, so it runs on a buyer's machine
that never had Homebrew. (First launch self-extracts in ~5 s; the UI shows
"Starting engine…" meanwhile.)

### Installing the unsigned build

We're **not code-signing yet**, so the OS will warn on first open:

- **macOS:** right-click the app → **Open** (once), or clear the quarantine flag:
  `xattr -cr "/Applications/RoboStore Studio.app"`. For a warning-free install,
  get an Apple Developer account ($99/yr) and add signing + notarization (the CI
  has the slot for it).
- **Linux:** `chmod +x RoboStore-Studio_*.AppImage && ./RoboStore-Studio_*.AppImage`,
  or install the `.deb`.

### Dev (no Rust needed)

```bash
cd app && npm run tauri dev    # Vite + the Rust shell window (engine started by dev.sh)
```

Day-one targets: **macOS** (Apple Silicon + Intel) and **Linux**. Windows is out
of scope for v1.

---

## Status

| Phase | Scope | State |
|-------|-------|-------|
| **P0 Foundation** | design system · app shell · engine + simulator + Revo2 adapter · typed protocol · onboarding · live Control | ✅ built & verified in simulator |
| **P1 Camera** | live mirror · record/replay · train gestures · calibration | ✅ built (UI + tracking + graceful no-camera states); live webcam needs a device to fully exercise |
| **P2 Learn** | guided tutorials · full curriculum · tips, with persisted progress | ✅ built & verified |
| **P3 Develop** | code runner · data export · k-NN + PCA classifier · sequencer · local API | ✅ built & verified |
| **P4 Productization** | license-key activation (offline) | ✅ built & verified · auto-update + signed installers + Inspire fork documented below |

### Licensing (built)

Offline license-key activation gates the app. Keys look like `ROBO-XXXX-XXXX-XXXX`
and validate locally — no internet, no account ([app/src/lib/license.ts](app/src/lib/license.ts)).

```bash
node scripts/mint-license.mjs 5     # issue 5 keys (RoboStore-side)
```

> The current checksum proves a key is well-formed, not that RoboStore minted it.
> `validateLicenseKey` is the single seam: for production, swap the checksum for
> an Ed25519/ECDSA signature check against an embedded public key — ideally in
> the Rust layer where it's harder to patch.

### Auto-update (to wire on a Rust machine)

Add the updater plugin and a static `latest.json` endpoint:

```bash
cargo add tauri-plugin-updater   # in app/src-tauri
```
Then in `tauri.conf.json` add a `plugins.updater` block with your release
`endpoints` and signing `pubkey`, set `bundle.createUpdaterArtifacts: true`,
and `.plugin(tauri_plugin_updater::Builder::new().build())` in `main.rs`.
(Left out of the committed config so an unsigned dev build doesn't fail.)

### Inspire fork (P4)

The Inspire build reuses `engine/` + `app/` unchanged except: a new
`engine/devices/inspire.py` adapter (Modbus TCP — port the proven logic from the
prototype repo's `server.py` + `inspire_gestures/`) and a one-line swap in
[brand.config.ts](app/src/brand.config.ts). Blocked only on confirmed **Inspire
E2** connection specs (the prototype code targets RH56DFTP).

## Project layout

```
engine/                Python device engine
  protocol.py          device model + pose library (source of truth)
  app.py               WebSocket server + device manager
  run.py               entry point / Tauri sidecar
  devices/             base · simulator · revo2 (bc_stark_sdk)
app/                   Tauri + React + TS + Tailwind UI
  src/lib/             protocol · engine (WS) · store · {camera,dev,learn}Store ·
                       license · handTracking · pca · codeRunner
  src/components/       Sidebar · TopBar · DeviceMenu · HandVisual · ui/
  src/screens/          Activate · Setup · Control · Camera · Learn · Develop
  src-tauri/           Rust shell · tauri.conf.json · sidecar wiring
studio_engine.py       frozen-sidecar entry (PyInstaller)
scripts/               dev.sh · build-sidecar.sh · fetch-camera-assets.sh · mint-license.mjs
.github/workflows/     CI — build macOS + Linux installers
```

> `bc-stark-sdk` (the BrainCo SDK) installs from PyPI via
> `pip install -r engine/requirements.txt` — see Run it below.
