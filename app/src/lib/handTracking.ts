/**
 * In-browser hand tracking → six Revo2 finger positions.
 *
 * Wraps MediaPipe Tasks Vision HandLandmarker and ports the curl math from the
 * original mirror.py so the device mimics the user's hand. Tracking runs in the
 * renderer (one camera consumer); positions are streamed to the engine.
 *
 * Offline note: WASM + model load from a CDN here for dev. For a shipped,
 * offline-first build, vendor `hand_landmarker.task` + the wasm into /public and
 * point WASM_PATH / MODEL_URL at them.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

// Packaged builds load vendored assets (offline-first); dev uses the CDN so you
// don't need to fetch anything to iterate. Run scripts/fetch-camera-assets.sh
// before building to populate app/public. Force local in dev with VITE_LOCAL_ASSETS=1.
const LOCAL_ASSETS = import.meta.env.PROD || import.meta.env.VITE_LOCAL_ASSETS === "1";
const BASE = import.meta.env.BASE_URL; // "./" in the packaged build

const WASM_PATH = LOCAL_ASSETS
  ? `${BASE}mediapipe/wasm`
  : "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL = LOCAL_ASSETS
  ? `${BASE}models/hand_landmarker.task`
  : "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

const FINGER_JOINTS: Record<string, [number, number, number, number]> = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

const sub = (a: Landmark, b: Landmark): Landmark => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (a: Landmark) => Math.hypot(a.x, a.y, a.z);
const dot = (a: Landmark, b: Landmark) => a.x * b.x + a.y * b.y + a.z * b.z;

function angle(v1: Landmark, v2: Landmark): number {
  const n1 = norm(v1);
  const n2 = norm(v2);
  if (n1 < 1e-6 || n2 < 1e-6) return 0;
  const c = Math.max(-1, Math.min(1, dot(v1, v2) / (n1 * n2)));
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * Finger curl, 0 (straight/open) → 1 (curled/closed).
 *
 * Uses the BEND angle at the PIP and DIP joints: angle(v0,v1) is 0° when the two
 * phalanges are collinear (straight) and grows as the joint folds. `dead` is the
 * small natural bend of a relaxed-open finger (mapped to 0); `span` is the bend
 * range to reach a full fist. (The old code measured the interior angle, which is
 * inverted — straight read as fully closed, so everything looked like a fist.)
 */
function curl(
  lm: Landmark[],
  joints: [number, number, number, number],
  dead: number,
  span: number,
): number {
  const p = joints.map((j) => lm[j]);
  const v0 = sub(p[1], p[0]); // proximal phalanx
  const v1 = sub(p[2], p[1]); // middle phalanx
  const v2 = sub(p[3], p[2]); // distal phalanx
  const bend = angle(v0, v1) + angle(v1, v2);
  return Math.max(0, Math.min(1, (bend - dead) / span));
}

function thumbAux(lm: Landmark[]): number {
  const tip = lm[4];
  const idxMcp = lm[5];
  const wrist = lm[0];
  const midMcp = lm[9];
  const handSz = norm(sub(midMcp, wrist)) + 1e-6;
  const dist = norm(sub(tip, idxMcp)) / handSz;
  return Math.max(0, Math.min(1, 1 - (dist - 0.2) / 0.5));
}

/** [thumb, thumb_aux, index, middle, ring, pinky] in 0..1000. */
export function landmarksToPositions(lm: Landmark[]): number[] {
  return [
    curl(lm, [1, 2, 3, 4], 12, 78), // thumb (CMC, MCP, IP, TIP) — bends less
    thumbAux(lm),
    curl(lm, FINGER_JOINTS.index, 22, 150),
    curl(lm, FINGER_JOINTS.middle, 22, 150),
    curl(lm, FINGER_JOINTS.ring, 22, 150),
    curl(lm, FINGER_JOINTS.pinky, 22, 150),
  ].map((v) => Math.round(v * 1000));
}

// ── One Euro filter — low-latency, jitter-aware smoothing ────────────────────
// Smooths hard when the value is still (kills jitter) and barely at all when it
// moves fast (kills lag). Far more responsive than a fixed-weight EMA.
class LowPass {
  private y: number | null = null;
  filter(x: number, a: number): number {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }
  reset() {
    this.y = null;
  }
}

class OneEuro {
  private xf = new LowPass();
  private dxf = new LowPass();
  private xPrev: number | null = null;
  constructor(public minCutoff = 1.7, public beta = 0.012, public dCutoff = 1.0) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x: number, dt: number): number {
    const dx = this.xPrev === null ? 0 : (x - this.xPrev) / dt;
    const edx = this.dxf.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const y = this.xf.filter(x, this.alpha(cutoff, dt));
    this.xPrev = x;
    return y;
  }
  setParams(minCutoff: number, beta: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }
  reset() {
    this.xf.reset();
    this.dxf.reset();
    this.xPrev = null;
  }
}

/** Per-finger One Euro smoothing with a single "responsiveness" knob (0..1). */
export class HandSmoother {
  private filters: OneEuro[];
  private lastT = 0;
  constructor(responsiveness = 0.5, n = 6) {
    this.filters = Array.from({ length: n }, () => new OneEuro());
    this.setResponsiveness(responsiveness);
  }
  /** 0 = very smooth (more lag) → 1 = very snappy (less smoothing). */
  setResponsiveness(r: number) {
    const minCutoff = 0.6 + r * 4.4; // 0.6 .. 5.0 Hz
    const beta = 0.004 + r * 0.02;
    for (const f of this.filters) f.setParams(minCutoff, beta);
  }
  update(values: number[]): number[] {
    const now = performance.now() / 1000;
    let dt = this.lastT ? now - this.lastT : 1 / 30;
    if (dt <= 0 || dt > 0.25) dt = 1 / 30; // guard first frame / long pauses
    this.lastT = now;
    return values.map((v, i) => Math.round(this.filters[i].filter(v, dt)));
  }
  reset() {
    this.filters.forEach((f) => f.reset());
    this.lastT = 0;
  }
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<void> {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  /** Detect on a video frame. Returns landmarks (21) or null if no hand.
   *  The caller is responsible for only passing new frames (see useHandCamera). */
  detect(video: HTMLVideoElement, timestampMs: number): Landmark[] | null {
    if (!this.landmarker) return null;
    const res = this.landmarker.detectForVideo(video, timestampMs);
    if (res.landmarks && res.landmarks.length > 0) return res.landmarks[0] as Landmark[];
    return null;
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

/** MediaPipe hand skeleton connections, for the overlay. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
