/**
 * Global app state (Zustand). Holds the live device frame, connection status,
 * device model from the engine handshake, and UI preferences. The EngineClient
 * pushes frames in; screens read slices out; command actions send back.
 */
import { create } from "zustand";
import { EngineClient } from "./engine";
import type {
  ConnectionStatus,
  DeviceModel,
  StateFrame,
  TouchSample,
} from "./protocol";

export type Screen = "setup" | "control" | "camera" | "learn" | "develop";
export type Theme = "dark" | "light";

interface AppState {
  // link to engine process
  engineOnline: boolean;
  // device link (real or simulated hand)
  status: ConnectionStatus;
  statusDetail: string;
  connected: boolean;
  simulated: boolean;

  model: DeviceModel | null;
  frame: StateFrame | null;
  positions: number[];
  targets: number[];
  touch: TouchSample[];
  deviceInfo: string;
  hz: number;

  ports: string[];
  currentPort: string;
  /** What the user has selected: "simulator" or a serial port. Optimistic. */
  selectedDevice: string;

  // UI
  screen: Screen;
  theme: Theme;
  developerMode: boolean;
  onboarded: boolean;

  // actions
  setScreen: (s: Screen) => void;
  setTheme: (t: Theme) => void;
  setDeveloperMode: (v: boolean) => void;
  completeOnboarding: () => void;

  setFinger: (index: number, value: number) => void;
  setPositions: (positions: number[]) => void;
  sendPose: (name: string) => void;
  runDemo: () => void;
  useSimulator: (enabled: boolean) => void;
  setPort: (port: string) => void;
  listPorts: () => void;
  reconnect: () => void;
}

const THEME_KEY = "studio.theme";
const ONBOARD_KEY = "studio.onboarded";

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

// frame-rate estimate
let lastTs = 0;
let hzAvg = 0;
// timestamp of the last user-initiated device switch (ms). Within a short window
// the menu shows the user's intent; after it settles we reconcile to reality.
let lastUserSwitch = 0;

export const useStore = create<AppState>((set, get) => {
  // The single engine connection. Created once with handlers wired to the store.
  const engine = new EngineClient(
    (msg) => {
      switch (msg.type) {
        case "hello":
          set({
            model: msg.model,
            simulated: msg.simulated,
            selectedDevice: msg.simulated ? "simulator" : msg.port || get().selectedDevice,
          });
          break;
        case "state": {
          if (lastTs) {
            const dt = msg.ts - lastTs;
            if (dt > 0) hzAvg = hzAvg ? hzAvg * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
          }
          lastTs = msg.ts;
          // Reconcile the selected device ONLY from a frame that is actually
          // connected and streaming — never from a stale/disconnected snapshot
          // (which is what caused the UI to "snap back" to simulator).
          const reconcile =
            msg.connected && Date.now() - lastUserSwitch > 2500
              ? { selectedDevice: msg.simulated ? "simulator" : msg.port || get().selectedDevice }
              : {};
          set({
            frame: msg,
            positions: msg.positions,
            targets: msg.targets,
            touch: msg.touch,
            connected: msg.connected,
            simulated: msg.simulated,
            deviceInfo: msg.device_info,
            currentPort: msg.port,
            hz: Math.round(hzAvg),
            status: msg.connected ? "connected" : get().status,
            ...reconcile,
          });
          break;
        }
        case "connection":
          set({ status: msg.status, statusDetail: msg.detail });
          break;
        case "ports":
          set({ ports: msg.ports, currentPort: msg.current });
          break;
      }
    },
    (open) => {
      set({
        engineOnline: open,
        status: open ? get().status : "connecting",
        statusDetail: open ? get().statusDetail : "Starting engine…",
      });
      if (open) engine.send({ type: "list_ports" });
    },
  );
  engine.connect();

  return {
    engineOnline: false,
    status: "connecting",
    statusDetail: "Starting engine…",
    connected: false,
    simulated: false,

    model: null,
    frame: null,
    positions: [0, 0, 0, 0, 0, 0],
    targets: [0, 0, 0, 0, 0, 0],
    touch: [],
    deviceInfo: "",
    hz: 0,

    ports: [],
    currentPort: "",
    selectedDevice: "simulator",

    screen: localStorage.getItem(ONBOARD_KEY) ? "control" : "setup",
    theme: initialTheme(),
    developerMode: false,
    onboarded: !!localStorage.getItem(ONBOARD_KEY),

    setScreen: (s) => set({ screen: s }),
    setTheme: (t) => {
      localStorage.setItem(THEME_KEY, t);
      set({ theme: t });
    },
    setDeveloperMode: (v) => set({ developerMode: v }),
    completeOnboarding: () => {
      localStorage.setItem(ONBOARD_KEY, "1");
      set({ onboarded: true, screen: "control" });
    },

    setFinger: (index, value) => {
      const targets = [...get().targets];
      targets[index] = value;
      set({ targets });
      engine.send({ type: "set_finger", index, value });
    },
    setPositions: (positions) => {
      set({ targets: positions });
      engine.send({ type: "set_positions", positions });
    },
    sendPose: (name) => engine.send({ type: "pose", name }),
    runDemo: () => engine.send({ type: "demo" }),
    useSimulator: (enabled) => {
      if (enabled) {
        lastUserSwitch = Date.now();
        set({ selectedDevice: "simulator", status: "connecting", statusDetail: "Starting simulator…" });
      }
      engine.send({ type: "use_simulator", enabled });
    },
    setPort: (port) => {
      lastUserSwitch = Date.now();
      set({ selectedDevice: port, status: "connecting", statusDetail: "Connecting to hand…" });
      engine.send({ type: "set_port", port });
    },
    listPorts: () => engine.send({ type: "list_ports" }),
    reconnect: () => engine.send({ type: "reconnect" }),
  };
});
