"""
Simulated Revo2 — a believable hand with no hardware attached.

Drives the same DeviceState the real adapter does, so the entire app (control,
poses, charts, camera mirror, demos) runs and demos identically without a
device plugged in. Positions ease toward their targets; "contact" is synthesized
when a finger flexes far enough, producing plausible proximity + force readouts.
"""

from __future__ import annotations

import math
import time

from .base import HandDevice
from ..protocol import DeviceState, FINGER_COUNT, TOUCH_FINGERS, TouchSample

# index into the 6-actuator vector for each touch fingertip
_TOUCH_TO_ACTUATOR = {"thumb": 0, "index": 2, "middle": 3, "ring": 4, "pinky": 5}


class SimulatedHand(HandDevice):
    name = "Simulator"

    def __init__(self) -> None:
        self._pos = [0.0] * FINGER_COUNT
        self._target = [0.0] * FINGER_COUNT
        self._t0 = None  # set on first read to keep motion deterministic-ish

    async def connect(self) -> bool:
        self.connected = True
        return True

    async def move(self, positions: list[int]) -> None:
        self._target = [float(p) for p in positions[:FINGER_COUNT]]

    async def read(self, state: DeviceState) -> None:
        now = time.monotonic()
        if self._t0 is None:
            self._t0 = now
        t = now - self._t0

        # Ease each actuator toward its target (critically-damped-ish).
        for i in range(FINGER_COUNT):
            self._pos[i] += (self._target[i] - self._pos[i]) * 0.18

        state.connected = True
        state.simulated = True
        state.has_touch = True
        state.device_info = "Simulator · virtual Revo2Touch · no hardware"
        state.serial = "SIM-0000"
        state.firmware = "sim"
        state.port = "simulator"
        state.positions = [round(p, 1) for p in self._pos]
        state.targets = [round(p, 1) for p in self._target]

        # Synthesize touch: a flexed fingertip "presses" → proximity + force rise,
        # with a gentle breathing wobble so the UI feels alive.
        touch = []
        for j, finger in enumerate(TOUCH_FINGERS):
            act = _TOUCH_TO_ACTUATOR[finger]
            flex = self._pos[act] / 1000.0
            wobble = 0.5 + 0.5 * math.sin(t * 1.7 + j * 1.1)
            if flex > 0.55:
                grip = (flex - 0.55) / 0.45  # 0..1 over the contact band
                normal = grip * (900 + 600 * wobble)
                tangential = grip * 180 * wobble
                proximity = 40 + 60 * grip
                status = 1
                direction = (t * 30 + j * 47) % 360
            else:
                normal = 0.0
                tangential = 0.0
                proximity = max(0.0, (flex / 0.55) * 30.0)
                status = 0
                direction = 0.0
            touch.append(
                TouchSample(
                    normal=round(normal, 2),
                    tangential=round(tangential, 2),
                    direction=round(direction, 1),
                    proximity=round(proximity, 1),
                    status=status,
                ).dict()
            )
        state.touch = touch
        state.ts = round(time.time() * 1000)

    async def close(self) -> None:
        self.connected = False
