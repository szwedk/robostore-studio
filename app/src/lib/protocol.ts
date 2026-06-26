/**
 * TypeScript mirror of engine/protocol.py. Keep the two in lock-step.
 * The engine sends the device model in its `hello` frame, so the UI never
 * hard-codes finger lists or pose names — they flow from the device.
 */

export interface FingerMeta {
  key: string;
  label: string;
  short: string;
}

export interface PoseMeta {
  label: string;
  icon: string;
}

export interface DeviceModel {
  fingers: FingerMeta[];
  touchFingers: string[];
  fingerCount: number;
  posMin: number;
  posMax: number;
  forceWarn: number;
  forceHigh: number;
  poses: Record<string, PoseMeta>;
}

export interface TouchSample {
  normal: number;
  tangential: number;
  direction: number;
  proximity: number;
  status: number;
}

export interface StateFrame {
  type: "state";
  connected: boolean;
  simulated: boolean;
  has_touch: boolean;
  device_info: string;
  serial: string;
  firmware: string;
  port: string;
  positions: number[];
  targets: number[];
  touch: TouchSample[];
  ts: number;
}

export interface HelloFrame {
  type: "hello";
  product: string;
  device: string;
  simulated: boolean;
  port: string;
  model: DeviceModel;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface ConnectionFrame {
  type: "connection";
  status: ConnectionStatus;
  detail: string;
}

export interface PortsFrame {
  type: "ports";
  ports: string[];
  current: string;
}

export type ServerMessage =
  | HelloFrame
  | StateFrame
  | ConnectionFrame
  | PortsFrame;

// ── Client → server commands ────────────────────────────────────────────────
export type ClientMessage =
  | { type: "set_positions"; positions: number[] }
  | { type: "set_finger"; index: number; value: number }
  | { type: "pose"; name: string }
  | { type: "demo" }
  | { type: "use_simulator"; enabled: boolean }
  | { type: "set_port"; port: string }
  | { type: "list_ports" }
  | { type: "reconnect" };

/** Force band for the green→amber→red sensor colors. */
export function forceBand(
  n: number,
  warn: number,
  high: number,
): "ok" | "warn" | "high" {
  if (n >= high) return "high";
  if (n >= warn) return "warn";
  return "ok";
}
