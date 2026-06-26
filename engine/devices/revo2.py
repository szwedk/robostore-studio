"""
BrainCo Revo2(Touch) adapter — RS-485 / USB serial via bc_stark_sdk.

Mirrors the proven logic from the original server.py hand_loop, refactored
behind the HandDevice contract. Connection is lazy and forgiving: a missing
device returns False from connect() rather than raising, so the engine retries
quietly.
"""

from __future__ import annotations

import os
import sys

# Make the bundled SDK importable whether we run from source or as a sidecar.
_SDK = os.path.join(os.path.dirname(__file__), "..", "..", "brainco-hand-sdk", "python")
if os.path.isdir(_SDK) and _SDK not in sys.path:
    sys.path.insert(0, os.path.abspath(_SDK))

from .base import HandDevice
from ..protocol import DeviceState, FINGER_COUNT, TouchSample

try:
    from bc_stark_sdk import main_mod as sdk
    HAS_SDK = True
except Exception:  # pragma: no cover - depends on platform libs
    sdk = None
    HAS_SDK = False

SLAVE_ID = 127


class Revo2Hand(HandDevice):
    name = "BrainCo Revo2"

    def __init__(self, port: str, baud_name: str = "Baud460800") -> None:
        self.port = port
        self.baud_name = baud_name
        self._ctx = None
        self._has_touch = False
        self._info = ""
        self._serial = ""
        self._firmware = ""
        self._fail_count = 0  # consecutive fully-failed reads before giving up

    async def connect(self) -> bool:
        if not HAS_SDK:
            self.last_error = "BrainCo SDK not loaded — is libusb installed?"
            return False
        self.last_error = ""
        try:
            baud = getattr(sdk.Baudrate, self.baud_name, sdk.Baudrate.Baud460800)
            self._ctx = await sdk.modbus_open(self.port, baud)
            await self._ctx.set_finger_unit_mode(SLAVE_ID, sdk.FingerUnitMode.Normalized)

            info = await self._ctx.get_device_info(SLAVE_ID)
            self._has_touch = info.uses_revo2_touch_api()
            self._serial = str(getattr(info, "serial_number", ""))
            self._firmware = str(getattr(info, "firmware_version", ""))
            hw = getattr(info, "hardware_type", "")
            # Match the proven server.py format; fall back to description.
            parts = [str(p) for p in (hw, self._serial) if p]
            self._info = " · ".join(parts)
            if self._firmware:
                self._info += f" · fw {self._firmware}"
            if not self._info:
                self._info = str(getattr(info, "description", "") or "BrainCo Revo2")

            if self._has_touch:
                try:
                    await self._ctx.touch_sensor_setup(SLAVE_ID, 0x1F)
                except Exception:
                    pass
            self.connected = True
            return True
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e}"[:80]
            self._ctx = None
            self.connected = False
            return False

    async def read(self, state: DeviceState) -> None:
        if self._ctx is None:
            self.connected = False
            state.connected = False
            return

        got_something = False

        # Touch — tolerate transient failures, never drop the link for them.
        if self._has_touch:
            try:
                statuses = await self._ctx.get_touch_sensor_status(SLAVE_ID)
                touch = []
                for s in statuses[:5]:
                    touch.append(
                        TouchSample(
                            normal=round(float(s.normal_force1), 2),
                            tangential=round(float(s.tangential_force1), 2),
                            direction=round(float(s.tangential_direction1), 1),
                            proximity=round(float(s.self_proximity1), 1),
                            status=int(s.status),
                        ).dict()
                    )
                if touch:
                    state.touch = touch
                    got_something = True
            except Exception:
                pass

        # Motor positions.
        try:
            ms = await self._ctx.get_motor_status(SLAVE_ID)
            state.positions = [round(float(p), 1) for p in ms.now_positions[:FINGER_COUNT]]
            got_something = True
        except Exception:
            pass

        if got_something:
            # Healthy read (or partial) — keep the link up, like the original server.py.
            self._fail_count = 0
            self.connected = True
            state.connected = True
            state.simulated = False
            state.has_touch = self._has_touch
            state.device_info = self._info
            state.serial = self._serial
            state.firmware = self._firmware
            state.port = self.port
        else:
            # Only give up after sustained, total failure — not a single timeout.
            self._fail_count += 1
            if self._fail_count >= 10:
                self.connected = False
                state.connected = False
                self._ctx = None

    async def move(self, positions: list[int]) -> None:
        if self._ctx is None:
            return
        try:
            await self._ctx.set_finger_positions(SLAVE_ID, positions)
        except Exception:
            self.connected = False
            self._ctx = None

    async def close(self) -> None:
        ctx, self._ctx = self._ctx, None
        self.connected = False
        if ctx is not None and HAS_SDK:
            try:
                sdk.modbus_close(ctx)
            except Exception:
                pass


def list_serial_ports() -> list[str]:
    try:
        from serial.tools import list_ports
        return sorted(p.device for p in list_ports.comports())
    except Exception:
        return []
