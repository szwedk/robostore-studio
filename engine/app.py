"""
RoboStore Studio engine — local WebSocket server + device manager.

Owns a single active HandDevice (real Revo2 or Simulator), streams telemetry to
all connected UI clients at ~30 Hz, and applies inbound control commands. The
device link self-heals: if a real hand isn't present it falls back to retrying
quietly, and the UI can switch to the Simulator at any time.

Run:
    python -m engine.run            # auto: real device if present, else prompt
    python -m engine.run --sim      # force simulator
    python -m engine.run --port /dev/cu.usbserial-XXXX
"""

from __future__ import annotations

import asyncio
import json
import logging
import pathlib
import time
from typing import Any

from aiohttp import web

from .protocol import (
    DeviceState, POSES, FINGERS, TOUCH_FINGERS, FINGER_COUNT,
    POS_MIN, POS_MAX, FORCE_WARN, FORCE_HIGH, clamp_positions,
)
from .devices.base import HandDevice
from .devices.simulator import SimulatedHand
from .devices import revo2 as revo2mod

logging.getLogger("bc_stark_sdk").setLevel(logging.CRITICAL)

HTTP_PORT = 8765
RETRY_SECONDS = 3.0
CONFIG_FILE = pathlib.Path(__file__).resolve().parent.parent / "studio_config.json"


def _load_config() -> dict[str, Any]:
    try:
        return json.loads(CONFIG_FILE.read_text())
    except Exception:
        return {}


def _save_config(cfg: dict[str, Any]) -> None:
    try:
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    except Exception:
        pass


class Engine:
    def __init__(self, *, port: str | None, force_sim: bool) -> None:
        cfg = _load_config()
        self.port = port or cfg.get("port") or ""
        self.force_sim = force_sim or cfg.get("simulator", False)
        self.state = DeviceState()
        self.device: HandDevice | None = None
        self.clients: set[web.WebSocketResponse] = set()
        self._retry_after = 0.0
        self._want_device = True  # the engine should keep a link alive
        self._switching = False   # True while a user-initiated device switch is in flight

    # ── lifecycle ─────────────────────────────────────────────────────────
    async def _make_device(self) -> HandDevice:
        if self.force_sim or not self.port:
            return SimulatedHand()
        return revo2mod.Revo2Hand(self.port)

    async def device_loop(self) -> None:
        while True:
            if not self._want_device:
                await asyncio.sleep(0.2)
                continue
            now = time.monotonic()
            if now < self._retry_after:
                await asyncio.sleep(0.2)
                continue

            self.device = await self._make_device()
            ok = await self.device.connect()
            if not ok:
                err = getattr(self.device, "last_error", "")
                name = getattr(self.device, "name", "device")
                self.device = None
                self.state.connected = False
                self._switching = False
                self._retry_after = now + RETRY_SECONDS
                detail = f"Can’t reach {name}" + (f" — {err}" if err else " — no response")
                await self._broadcast_status("disconnected", detail)
                await asyncio.sleep(0.2)
                continue

            self._switching = False
            await self._broadcast_status("connected", self.device.name)
            # stream until the link drops
            while self.device and self.device.connected and self._want_device:
                await self.device.read(self.state)
                self.state.ts = round(time.time() * 1000)
                await self._broadcast(self.state.frame())
                await asyncio.sleep(0.033)  # ~30 Hz

            if self.device:
                await self.device.close()
            self.device = None
            self.state.connected = False
            if self._switching:
                # user picked a different device — reconnect immediately, no backoff
                self._switching = False
                self._retry_after = 0.0
                await self._broadcast_status("connecting", "Switching device…")
            else:
                self._retry_after = time.monotonic() + RETRY_SECONDS
                await self._broadcast_status("disconnected", "Link lost — reconnecting…")

    async def _reset_link(self) -> None:
        """Force the device loop to drop and rebuild the link now (user switch)."""
        self._switching = True
        if self.device:
            try:
                await self.device.close()
            except Exception:
                pass
        self.device = None
        self.state.connected = False
        self._retry_after = 0.0
        await self._broadcast_status("connecting", "Switching device…")

    # ── broadcast ─────────────────────────────────────────────────────────
    async def _broadcast(self, obj: dict[str, Any]) -> None:
        if not self.clients:
            return
        msg = json.dumps(obj)
        dead = set()
        for ws in list(self.clients):
            try:
                await ws.send_str(msg)
            except Exception:
                dead.add(ws)
        self.clients.difference_update(dead)

    async def _broadcast_status(self, status: str, detail: str) -> None:
        await self._broadcast({"type": "connection", "status": status, "detail": detail})

    def hello(self) -> dict[str, Any]:
        return {
            "type": "hello",
            "product": "RoboStore Studio",
            "device": "BrainCo Revo2",
            "simulated": self.force_sim or not self.port,
            "port": self.port,
            "model": {
                "fingers": FINGERS,
                "touchFingers": TOUCH_FINGERS,
                "fingerCount": FINGER_COUNT,
                "posMin": POS_MIN,
                "posMax": POS_MAX,
                "forceWarn": FORCE_WARN,
                "forceHigh": FORCE_HIGH,
                "poses": {k: {"label": v["label"], "icon": v["icon"]} for k, v in POSES.items()},
            },
        }

    # ── commands ──────────────────────────────────────────────────────────
    async def handle(self, data: str) -> None:
        try:
            cmd = json.loads(data)
        except Exception:
            return
        t = cmd.get("type")

        if t == "set_positions":
            pos = clamp_positions(cmd.get("positions", []))
            self.state.targets = [float(p) for p in pos]
            if self.device:
                await self.device.move(pos)

        elif t == "set_finger":
            i = int(cmd.get("index", -1))
            if 0 <= i < FINGER_COUNT:
                pos = clamp_positions(self.state.targets)
                pos[i] = max(POS_MIN, min(POS_MAX, int(cmd.get("value", 0))))
                self.state.targets = [float(p) for p in pos]
                if self.device:
                    await self.device.move(pos)

        elif t == "pose":
            pose = POSES.get(cmd.get("name", ""))
            if pose:
                pos = clamp_positions(pose["positions"])
                self.state.targets = [float(p) for p in pos]
                if self.device:
                    await self.device.move(pos)

        elif t == "demo":
            asyncio.create_task(self._run_demo())

        elif t == "use_simulator":
            self.force_sim = bool(cmd.get("enabled", True))
            # Reset the snapshot immediately so no stale frame misreports the device.
            self.state.simulated = self.force_sim
            self.state.connected = False
            cfg = _load_config(); cfg["simulator"] = self.force_sim; _save_config(cfg)
            await self._reset_link()

        elif t == "set_port":
            self.port = str(cmd.get("port", "")).strip()
            self.force_sim = False
            self.state.simulated = False
            self.state.connected = False
            self.state.device_info = "Connecting…"
            cfg = _load_config(); cfg["port"] = self.port; cfg["simulator"] = False; _save_config(cfg)
            await self._reset_link()

        elif t == "list_ports":
            await self._broadcast({
                "type": "ports",
                "ports": revo2mod.list_serial_ports(),
                "current": self.port,
            })

        elif t == "reconnect":
            await self._reset_link()

    async def _run_demo(self) -> None:
        sequence = ["open", "fist", "point", "peace", "pinch", "ok", "open"]
        for name in sequence:
            pose = POSES.get(name)
            if pose and self.device:
                pos = clamp_positions(pose["positions"])
                self.state.targets = [float(p) for p in pos]
                await self.device.move(pos)
            await asyncio.sleep(1.1)


# ── HTTP / WS wiring ──────────────────────────────────────────────────────────
def build_app(engine: Engine, static_dir: pathlib.Path | None) -> web.Application:
    async def ws_handler(request: web.Request) -> web.WebSocketResponse:
        # No server heartbeat: a slow/blocking device connect must not cause the
        # socket to be dropped (that triggered reconnect churn + stale frames).
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        engine.clients.add(ws)
        await ws.send_str(json.dumps(engine.hello()))
        await ws.send_str(json.dumps(engine.state.frame()))
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    await engine.handle(msg.data)
        finally:
            engine.clients.discard(ws)
        return ws

    async def health(_request: web.Request) -> web.Response:
        return web.json_response({"ok": True, "product": "RoboStore Studio"})

    async def on_startup(app: web.Application) -> None:
        app["device_task"] = asyncio.create_task(engine.device_loop())

    async def on_cleanup(app: web.Application) -> None:
        task = app.get("device_task")
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    app = web.Application()
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/health", health)
    if static_dir and static_dir.is_dir():
        async def index(_request: web.Request) -> web.Response:
            return web.FileResponse(static_dir / "index.html")
        app.router.add_get("/", index)
        app.router.add_static("/", static_dir, show_index=False)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app
