"""
GraspController — closed-loop reflexive grasp (Grasp Lab).

When armed, each selected finger is driven toward a per-fingertip *normal-force*
setpoint with a proportional law, and a slip reflex tightens the grip when the
tangential (shear) force rises while the normal force stays roughly flat — the
tell-tale signature of an object starting to slide out of the hand.

    out[i] += kp * (force_target - normal_i)          # proportional force law
    out[i] += slip_bump   if tangential rising & normal flat

Non-armed fingers pass their incoming target through untouched. The thumb-aux
actuator (index 1) has no fingertip sensor, so it is never force-controlled.

Claims commands:
  {type:"grasp_close",   fingers:[int], force_target:number, gains:{kp:number}}
  {type:"grasp_release"}

status() → {armed, forceTarget, fingers, kp, force:[per-touch normal x5],
            tangential:[x5], slip:[per-touch bool x5]}
"""

from __future__ import annotations

from typing import Any

from .base import Feature, ACTUATOR_TO_TOUCH
from ..protocol import DeviceState, FINGER_COUNT, POS_MIN, POS_MAX, TOUCH_FINGERS

# How hard a confirmed slip event tightens the finger (command units / frame).
SLIP_BUMP = 18.0
# A slip is flagged when shear climbs by at least this much per frame while the
# normal force barely changes — i.e. the object is shearing, not being squeezed.
SLIP_TANGENTIAL_RISE = 6.0
SLIP_NORMAL_FLAT = 12.0
# Clamp the per-frame proportional correction so a large force error can't slam
# the finger fully closed in a single step (keeps the loop gentle + stable).
MAX_STEP = 60.0


class GraspController(Feature):
    name = "grasp"

    def __init__(self) -> None:
        self.armed = False
        self.fingers: list[int] = []
        self.force_target = 0.0
        self.kp = 0.05
        # Closed-loop command memory, so we integrate corrections frame-to-frame
        # rather than recomputing from the (lagging) measured position each time.
        self._cmd: list[float] = [0.0] * FINGER_COUNT
        # Previous touch readings, for the slip (rate-of-change) detector.
        self._prev_normal: list[float] = [0.0] * len(TOUCH_FINGERS)
        self._prev_tangential: list[float] = [0.0] * len(TOUCH_FINGERS)
        # Latest live telemetry mirrored into status() for the UI plot.
        self._normal: list[float] = [0.0] * len(TOUCH_FINGERS)
        self._tangential: list[float] = [0.0] * len(TOUCH_FINGERS)
        self._slip: list[bool] = [False] * len(TOUCH_FINGERS)

    def on_command(self, cmd: dict[str, Any]) -> bool:
        t = cmd.get("type")
        if t == "grasp_close":
            fingers = [int(i) for i in cmd.get("fingers", [])]
            # Only keep actuators that actually carry a fingertip sensor.
            self.fingers = [i for i in fingers if i in ACTUATOR_TO_TOUCH]
            self.force_target = float(cmd.get("force_target", 0))
            self.kp = float((cmd.get("gains") or {}).get("kp", 0.05))
            self.armed = True
            return True
        if t == "grasp_release":
            self.armed = False
            self.fingers = []
            self._slip = [False] * len(TOUCH_FINGERS)
            return True
        return False

    def _touch(self, state: DeviceState, touch_idx: int) -> tuple[float, float]:
        try:
            s = state.touch[touch_idx]
        except (IndexError, TypeError):
            return 0.0, 0.0
        return float(s.get("normal", 0.0)), float(s.get("tangential", 0.0))

    def step(self, state: DeviceState, targets: list[int]) -> list[int]:
        # Always refresh the live force mirror so the UI keeps plotting even idle.
        for ti in range(len(TOUCH_FINGERS)):
            n, tan = self._touch(state, ti)
            self._normal[ti] = n
            self._tangential[ti] = tan

        if not self.armed:
            self._slip = [False] * len(TOUCH_FINGERS)
            self._prev_normal = list(self._normal)
            self._prev_tangential = list(self._tangential)
            # Stay in sync with the passthrough target so re-arming is bumpless.
            for i in range(FINGER_COUNT):
                self._cmd[i] = float(targets[i])
            return targets

        out = [float(v) for v in targets]
        slip_now = [False] * len(TOUCH_FINGERS)

        for actuator in self.fingers:
            ti = ACTUATOR_TO_TOUCH.get(actuator)
            if ti is None:
                continue
            normal = self._normal[ti]
            tangential = self._tangential[ti]

            # Proportional force tracking toward the setpoint.
            error = self.force_target - normal
            delta = self.kp * error
            delta = max(-MAX_STEP, min(MAX_STEP, delta))

            # Slip reflex: shear rising while normal force is flat → squeeze.
            d_tan = tangential - self._prev_tangential[ti]
            d_norm = abs(normal - self._prev_normal[ti])
            if d_tan > SLIP_TANGENTIAL_RISE and d_norm < SLIP_NORMAL_FLAT:
                delta += SLIP_BUMP
                slip_now[ti] = True

            self._cmd[actuator] = max(
                float(POS_MIN), min(float(POS_MAX), self._cmd[actuator] + delta)
            )
            out[actuator] = self._cmd[actuator]

        self._slip = slip_now
        self._prev_normal = list(self._normal)
        self._prev_tangential = list(self._tangential)
        return [int(round(v)) for v in out]

    def status(self) -> dict[str, Any]:
        return {
            "armed": self.armed,
            "forceTarget": self.force_target,
            "fingers": self.fingers,
            "kp": self.kp,
            "force": [round(v, 1) for v in self._normal],
            "tangential": [round(v, 1) for v in self._tangential],
            "slip": list(self._slip),
        }
