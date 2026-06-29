"""
GuardianClamp — safety envelope + E-stop (Guardian). Runs LAST in the pipeline.

The Guardian is the credible safety layer that sits between every other feature
and the device. It enforces, in order:

  1. E-stop — when latched, the hand is forced fully open ([0]*6) and held there
     until explicitly cleared. E-stop ALWAYS works, even when the envelope is
     disabled.
  2. Per-finger soft limits — each commanded position is clamped to
     [min[i], max[i]] so the fingers can never travel outside the fitted range.
  3. Slew-rate limit — the change per frame is capped to `self.slew` units so the
     hand can never snap; motion stays smooth and predictable.
  4. Force ceiling — if a fingertip's normal force exceeds `self.max_force`, the
     finger backs off a step (relaxes) and a trip is counted.

The envelope (2–4) is only enforced while `self.enabled`. E-stop is independent.

Claims commands:
  {type:"set_limits", min:[6], max:[6], slew:int, maxForce:number, enabled:bool}
  {type:"estop", on:bool}

status() → {enabled, estopped, min, max, slew, maxForce, trips, tripped, force}
"""

from __future__ import annotations

from typing import Any

from .base import Feature, ACTUATOR_TO_TOUCH
from ..protocol import DeviceState, FINGER_COUNT, POS_MIN, POS_MAX

# How far a finger relaxes (toward open) per frame when over the force ceiling.
FORCE_BACKOFF = 25


class GuardianClamp(Feature):
    name = "guardian"

    def __init__(self) -> None:
        self.enabled = False
        self.estopped = False
        self.min = [POS_MIN] * FINGER_COUNT
        self.max = [POS_MAX] * FINGER_COUNT
        self.slew = 0          # 0 = no slew limit; else max delta per frame
        self.max_force = 0.0    # 0 = no force ceiling
        self.trips = 0
        # per-finger "tripped this frame" flags + last seen force, for the UI
        self._tripped = [False] * FINGER_COUNT
        self._force = [0.0] * FINGER_COUNT
        self._last: list[int] | None = None

    def on_command(self, cmd: dict[str, Any]) -> bool:
        t = cmd.get("type")
        if t == "set_limits":
            if "min" in cmd:
                self.min = self._coerce(cmd["min"], POS_MIN)
            if "max" in cmd:
                self.max = self._coerce(cmd["max"], POS_MAX)
            # Keep min <= max so the envelope can never invert.
            for i in range(FINGER_COUNT):
                if self.min[i] > self.max[i]:
                    self.min[i], self.max[i] = self.max[i], self.min[i]
            if "slew" in cmd:
                self.slew = max(0, int(cmd["slew"]))
            if "maxForce" in cmd:
                self.max_force = max(0.0, float(cmd["maxForce"]))
            if "enabled" in cmd:
                self.enabled = bool(cmd["enabled"])
            return True
        if t == "estop":
            self.estopped = bool(cmd.get("on", True))
            if self.estopped:
                # Drop the slew memory so the release ramps cleanly from open.
                self._last = [POS_MIN] * FINGER_COUNT
            return True
        return False

    @staticmethod
    def _coerce(values: Any, fill: int) -> list[int]:
        out = [fill] * FINGER_COUNT
        for i in range(FINGER_COUNT):
            try:
                out[i] = max(POS_MIN, min(POS_MAX, int(values[i])))
            except (IndexError, TypeError, ValueError):
                out[i] = fill
        return out

    def step(self, state: DeviceState, targets: list[int]) -> list[int]:
        # E-stop is unconditional — force fully open and latch.
        if self.estopped:
            self._tripped = [False] * FINGER_COUNT
            out = [POS_MIN] * FINGER_COUNT
            self._last = out
            return out

        out = [int(v) for v in targets[:FINGER_COUNT]]
        while len(out) < FINGER_COUNT:
            out.append(POS_MIN)

        if not self.enabled:
            self._tripped = [False] * FINGER_COUNT
            self._last = out
            return out

        prev = self._last if self._last is not None else out

        # 1. Per-finger soft limits.
        for i in range(FINGER_COUNT):
            out[i] = max(self.min[i], min(self.max[i], out[i]))

        # 2. Slew-rate limit — cap the per-frame change.
        if self.slew > 0:
            for i in range(FINGER_COUNT):
                delta = out[i] - prev[i]
                if delta > self.slew:
                    out[i] = prev[i] + self.slew
                elif delta < -self.slew:
                    out[i] = prev[i] - self.slew

        # 3. Force ceiling — back a finger off when its fingertip is over the limit.
        self._tripped = [False] * FINGER_COUNT
        if self.max_force > 0:
            touch = state.touch or []
            for act, ti in ACTUATOR_TO_TOUCH.items():
                sample = touch[ti] if ti < len(touch) else None
                normal = float(sample.get("normal", 0.0)) if sample else 0.0
                self._force[act] = normal
                if normal > self.max_force:
                    # Relax this finger a step (toward open), respecting min.
                    out[act] = max(self.min[act], out[act] - FORCE_BACKOFF)
                    self._tripped[act] = True
                    self.trips += 1
        else:
            self._force = [0.0] * FINGER_COUNT

        # Final hard clamp to the device range.
        out = [max(POS_MIN, min(POS_MAX, v)) for v in out]
        self._last = out
        return out

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "estopped": self.estopped,
            "min": self.min,
            "max": self.max,
            "slew": self.slew,
            "maxForce": self.max_force,
            "trips": self.trips,
            "tripped": self._tripped,
            "force": [round(f, 1) for f in self._force],
        }
