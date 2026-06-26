"""Abstract hand device — the contract every adapter implements."""

from __future__ import annotations

import abc
from typing import Any

from ..protocol import DeviceState


class HandDevice(abc.ABC):
    """
    A connected (or connectable) hand.

    Adapters own their own connection lifecycle. The engine drives them through
    `connect`, polls telemetry with `read`, issues motion with `move`, and tears
    down with `close`. All methods are async; adapters must never block the loop.
    """

    #: Human-facing adapter name, e.g. "BrainCo Revo2" or "Simulator".
    name: str = "device"

    #: True once a live link is established.
    connected: bool = False

    #: Human-readable reason the last connect() failed (surfaced to the UI).
    last_error: str = ""

    @abc.abstractmethod
    async def connect(self) -> bool:
        """Open the link. Return True on success. Must not raise on a plain
        'device not present' — return False so the engine can retry quietly."""

    @abc.abstractmethod
    async def read(self, state: DeviceState) -> None:
        """Refresh `state` in place: positions, touch, connected, device_info."""

    @abc.abstractmethod
    async def move(self, positions: list[int]) -> None:
        """Command the six actuators to the given normalized positions (0–1000)."""

    @abc.abstractmethod
    async def close(self) -> None:
        """Release the link. Safe to call when already closed."""

    async def describe(self) -> dict[str, Any]:
        """Optional static descriptor for the hello handshake."""
        return {"name": self.name}
