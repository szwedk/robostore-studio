"""
RoboStore Studio — engine protocol.

Single source of truth for the device model shared between the Python engine
and the TypeScript UI. The matching TS types live in
`app/src/lib/protocol.ts` and must be kept in lock-step with this file.

Wire format: newline-free JSON objects over a local WebSocket. Every message
has a `type`. Server→client telemetry is `state`; client→server control
messages mirror the names below.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any

# ── Finger model ────────────────────────────────────────────────────────────
# Revo2 exposes six actuators. Position is normalized 0–1000 where
# 0 = fully open / extended and 1000 = fully closed / flexed.
FINGER_COUNT = 6

# Display + protocol order. ThumbAux is the thumb opposition/rotation actuator.
FINGERS: list[dict[str, str]] = [
    {"key": "thumb",    "label": "Thumb",     "short": "Th"},
    {"key": "thumb_aux","label": "Thumb Rot", "short": "TR"},
    {"key": "index",    "label": "Index",     "short": "Ix"},
    {"key": "middle",   "label": "Middle",    "short": "Mi"},
    {"key": "ring",     "label": "Ring",      "short": "Rg"},
    {"key": "pinky",    "label": "Pinky",     "short": "Pk"},
]

POS_MIN = 0
POS_MAX = 1000

# Touch sensors report for the five physical fingertips (no aux).
TOUCH_FINGERS: list[str] = ["thumb", "index", "middle", "ring", "pinky"]

# Force thresholds (Newtons-ish, sensor units) for the green→amber→red bands.
FORCE_WARN = 500.0
FORCE_HIGH = 1500.0


# ── Pose library ─────────────────────────────────────────────────────────────
# Order matches FINGERS: [thumb, thumb_aux, index, middle, ring, pinky].
# Tuned from the verified test.py sequences.
POSES: dict[str, dict[str, Any]] = {
    "open":   {"label": "Open",   "icon": "open",   "positions": [0,   0,   0,    0,    0,    0]},
    "fist":   {"label": "Fist",   "icon": "fist",   "positions": [800, 800, 1000, 1000, 1000, 1000]},
    "point":  {"label": "Point",  "icon": "point",  "positions": [800, 800, 0,    1000, 1000, 1000]},
    "peace":  {"label": "Peace",  "icon": "peace",  "positions": [800, 800, 0,    0,    1000, 1000]},
    "pinch":  {"label": "Pinch",  "icon": "pinch",  "positions": [500, 0,   500,  0,    0,    0]},
    "ok":     {"label": "OK",     "icon": "ok",     "positions": [700, 600, 700,  0,    0,    0]},
    "gun":    {"label": "Gun",    "icon": "gun",    "positions": [0,   0,   0,    1000, 1000, 1000]},
    "claw":   {"label": "Claw",   "icon": "claw",   "positions": [0,   0,   500,  500,  500,  500]},
    "relax":  {"label": "Relax",  "icon": "relax",  "positions": [300, 200, 300,  300,  300,  300]},
    "three":  {"label": "Three",  "icon": "three",  "positions": [800, 800, 0,    0,    0,    1000]},
    "rock":   {"label": "Rock",   "icon": "rock",   "positions": [0,   0,   1000, 1000, 0,    0]},
    "thumbs": {"label": "Thumbs", "icon": "thumbs", "positions": [0,   0,   1000, 1000, 1000, 1000]},
}


# ── Telemetry shapes ──────────────────────────────────────────────────────────
@dataclass
class TouchSample:
    normal: float = 0.0
    tangential: float = 0.0
    direction: float = 0.0
    proximity: float = 0.0
    status: int = 0

    def dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DeviceState:
    """One telemetry frame broadcast to all UI clients."""
    connected: bool = False
    simulated: bool = False
    has_touch: bool = False
    device_info: str = ""
    serial: str = ""
    firmware: str = ""
    port: str = ""
    positions: list[float] = field(default_factory=lambda: [0.0] * FINGER_COUNT)
    targets: list[float] = field(default_factory=lambda: [0.0] * FINGER_COUNT)
    touch: list[dict[str, Any]] = field(
        default_factory=lambda: [TouchSample().dict() for _ in TOUCH_FINGERS]
    )
    ts: int = 0

    def frame(self) -> dict[str, Any]:
        d = asdict(self)
        d["type"] = "state"
        return d


def clamp_positions(values: list[Any]) -> list[int]:
    """Coerce an incoming positions array to six clamped ints."""
    out = [0] * FINGER_COUNT
    for i in range(FINGER_COUNT):
        try:
            v = int(round(float(values[i])))
        except (IndexError, TypeError, ValueError):
            v = 0
        out[i] = max(POS_MIN, min(POS_MAX, v))
    return out
