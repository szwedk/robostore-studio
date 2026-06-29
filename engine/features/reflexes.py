"""
ReflexEngine — background "if-this-then-that" rules (Reflexes).

Runs FIRST in the engine pipeline so a rule's reaction is applied before the
grasp controller and the guardian safety envelope get a say. Because it runs in
the engine (not the UI) the rules keep firing even when the app window is shut.

A rule (author-defined, kept generic):
  {
    id, enabled,
    when: {signal: "normal"|"tangential"|"proximity"|"position", finger: int, op: ">"|"<", value: number},
    then: {action: "tighten"|"loosen"|"open"|"pose"|"set", finger?: int, delta?: int, pose?: str, value?: int}
  }

Signals read off the live frame:
  • position           → state.positions[finger]   (actuator 0..5)
  • normal/tangential/
    proximity          → state.touch[touch_idx]    (fingertip 0..4)
                         actuator index is mapped through ACTUATOR_TO_TOUCH.

Actions mutate a copy of `targets`:
  • tighten  finger += delta
  • loosen   finger -= delta
  • set      finger  = value
  • open     all fingers → POS_MIN
  • pose     targets    = POSES[pose].positions

Claims commands:
  {type:"set_rules", rules:[...]}

status() → {rules, active:[ids firing now]}
"""

from __future__ import annotations

from typing import Any

from .base import Feature, ACTUATOR_TO_TOUCH
from ..protocol import DeviceState, FINGER_COUNT, POS_MIN, POS_MAX, POSES

# Default per-action nudge when a rule omits an explicit delta.
DEFAULT_DELTA = 120


class ReflexEngine(Feature):
    name = "reflexes"

    def __init__(self) -> None:
        self.rules: list[dict[str, Any]] = []
        self.active: list[str] = []

    def on_command(self, cmd: dict[str, Any]) -> bool:
        if cmd.get("type") == "set_rules":
            self.rules = list(cmd.get("rules", []))
            return True
        return False

    # ── condition ───────────────────────────────────────────────────────────
    def _signal(self, state: DeviceState, signal: str, finger: int) -> float | None:
        """Read a signal value for an actuator index, or None if unavailable."""
        if not isinstance(finger, int) or not (0 <= finger < FINGER_COUNT):
            return None

        if signal == "position":
            try:
                return float(state.positions[finger])
            except (IndexError, TypeError, ValueError):
                return None

        # touch-based signals live on the five fingertips, not the aux actuator
        touch_idx = ACTUATOR_TO_TOUCH.get(finger)
        if touch_idx is None:
            return None
        try:
            sample = state.touch[touch_idx]
        except (IndexError, TypeError):
            return None
        if signal in ("normal", "tangential", "proximity"):
            try:
                return float(sample.get(signal, 0.0))
            except (AttributeError, TypeError, ValueError):
                return None
        return None

    def _fires(self, state: DeviceState, when: dict[str, Any]) -> bool:
        signal = when.get("signal")
        finger = when.get("finger")
        op = when.get("op", ">")
        try:
            threshold = float(when.get("value", 0))
        except (TypeError, ValueError):
            return False

        value = self._signal(state, signal, finger)
        if value is None:
            return False
        if op == "<":
            return value < threshold
        return value > threshold

    # ── action ──────────────────────────────────────────────────────────────
    def _apply(self, out: list[int], then: dict[str, Any]) -> None:
        action = then.get("action")

        if action == "open":
            for i in range(FINGER_COUNT):
                out[i] = POS_MIN
            return

        if action == "pose":
            pose = POSES.get(then.get("pose", ""))
            if pose:
                for i, v in enumerate(pose["positions"][:FINGER_COUNT]):
                    out[i] = int(v)
            return

        finger = then.get("finger")
        if not isinstance(finger, int) or not (0 <= finger < FINGER_COUNT):
            return

        if action == "tighten":
            out[finger] += int(then.get("delta", DEFAULT_DELTA))
        elif action == "loosen":
            out[finger] -= int(then.get("delta", DEFAULT_DELTA))
        elif action == "set":
            out[finger] = int(then.get("value", 0))

    # ── pipeline ──────────────────────────────────────────────────────────────
    def step(self, state: DeviceState, targets: list[int]) -> list[int]:
        out = list(targets)
        firing: list[str] = []

        for rule in self.rules:
            if not rule.get("enabled", True):
                continue
            when = rule.get("when") or {}
            then = rule.get("then") or {}
            try:
                if self._fires(state, when):
                    self._apply(out, then)
                    rid = rule.get("id")
                    if rid is not None:
                        firing.append(str(rid))
            except Exception:
                # A malformed rule must never take down the hot loop.
                continue

        self.active = firing
        return [max(POS_MIN, min(POS_MAX, int(v))) for v in out]

    def status(self) -> dict[str, Any]:
        return {"rules": self.rules, "active": self.active}
