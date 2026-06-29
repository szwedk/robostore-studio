"""
Feature — a processor in the engine command pipeline.

Each frame (~30 Hz) the engine computes the outgoing finger command by passing
the user's target vector through every feature's `step()` in order:

    outgoing = reflexes.step → grasp.step → guardian.step(clamp)  → device.move

Features may also claim WebSocket commands via `on_command`, and expose live
state to the UI via `status()` (merged into the telemetry frame under
`features[<name>]`). Steps run on the hot loop — keep them cheap and never block.
"""

from __future__ import annotations

from typing import Any

from ..protocol import DeviceState

# actuator index (0..5) → index into state.touch (thumb,index,middle,ring,pinky)
ACTUATOR_TO_TOUCH = {0: 0, 2: 1, 3: 2, 4: 3, 5: 4}


class Feature:
    name = "feature"

    def on_command(self, cmd: dict[str, Any]) -> bool:
        """Handle a client command. Return True if this feature owns its type."""
        return False

    def step(self, state: DeviceState, targets: list[int]) -> list[int]:
        """Transform the outgoing command for this frame. Return a 6-int list."""
        return targets

    def status(self) -> dict[str, Any]:
        """Live state for the UI (sent every frame under features[name])."""
        return {}
