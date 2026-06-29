/**
 * Scope: a high-rate ring buffer of incoming device frames plus the small bit
 * of persisted UI state (which channel groups are visible, time window).
 *
 * The ring buffer is deliberately NOT React state — it is a plain module-level
 * structure fed by a single `useStore.subscribe` listener. The Scope screen
 * reads it from a requestAnimationFrame draw loop so the chart never triggers a
 * React re-render per frame. UI prefs live in a tiny zustand+persist slice.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useStore } from "./store";
import type { StateFrame } from "./protocol";

/** Seconds of history retained. At ~30 Hz this is ~360 samples. */
export const SCOPE_WINDOW_S = 12;
const EST_HZ = 35; // headroom over the 30 Hz pipeline
const CAP = Math.ceil(SCOPE_WINDOW_S * EST_HZ * 1.5);

/** One captured sample — flat typed arrays would be faster but this stays simple
 *  and is plenty for a 12 s @ 30 Hz window. */
export interface ScopeSample {
  t: number; // ms, performance.now() based (monotonic)
  positions: number[]; // 6
  targets: number[]; // 6
  /** per touch finger (5): normal, tangential, proximity, direction(rad) */
  normal: number[];
  tangential: number[];
  proximity: number[];
  direction: number[];
}

/* ── The ring buffer ──────────────────────────────────────────────────────── */
const buf: ScopeSample[] = [];
let head = 0; // next write index
let count = 0;
let t0 = 0; // performance.now() at first sample (for stable relative time)
let marker: number | null = null; // step-response marker time (ms, relative)

function push(s: ScopeSample) {
  if (buf.length < CAP) {
    buf.push(s);
  } else {
    buf[head] = s;
  }
  head = (head + 1) % CAP;
  count = Math.min(count + 1, CAP);
}

/** Return samples in chronological order (oldest→newest). Allocates; call it at
 *  draw-frame rate only, not per incoming sample. */
export function readSamples(): ScopeSample[] {
  if (buf.length < CAP) return buf.slice();
  return [...buf.slice(head), ...buf.slice(0, head)];
}

export function sampleCount(): number {
  return count;
}

export function clearScope() {
  buf.length = 0;
  head = 0;
  count = 0;
  marker = null;
}

export function setMarker(tRel: number | null) {
  marker = tRel;
}
export function getMarker(): number | null {
  return marker;
}

/** Current relative "now" in ms (since first sample). */
export function nowRel(): number {
  return t0 ? performance.now() - t0 : 0;
}

let paused = false;
/** Pause/resume capture without tearing down the subscription. */
export function setCapturePaused(p: boolean) {
  paused = p;
}

function ingest(frame: StateFrame) {
  if (paused) return;
  const now = performance.now();
  if (!t0) t0 = now;
  const touch = frame.touch ?? [];
  const n = 5;
  const normal = new Array(n);
  const tangential = new Array(n);
  const proximity = new Array(n);
  const direction = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = touch[i];
    normal[i] = s?.normal ?? 0;
    tangential[i] = s?.tangential ?? 0;
    proximity[i] = s?.proximity ?? 0;
    direction[i] = s?.direction ?? 0;
  }
  push({
    t: now - t0,
    positions: (frame.positions ?? []).slice(0, 6),
    targets: (frame.targets ?? []).slice(0, 6),
    normal,
    tangential,
    proximity,
    direction,
  });
}

/* A single shared subscription drives the buffer regardless of how many
 * components mount. Reference-counted so we can stop when Scope unmounts. */
let unsub: (() => void) | null = null;
let refs = 0;

/** Start (or join) the frame subscription. Returns a release fn. */
export function attachScope(): () => void {
  refs += 1;
  if (!unsub) {
    let last: StateFrame | null = useStore.getState().frame;
    if (last) ingest(last);
    unsub = useStore.subscribe((s) => {
      const f = s.frame;
      if (f && f !== last) {
        last = f;
        ingest(f);
      }
    });
  }
  return () => {
    refs -= 1;
    if (refs <= 0 && unsub) {
      unsub();
      unsub = null;
      refs = 0;
    }
  };
}

/* ── Channel-group definitions ────────────────────────────────────────────── */
export type GroupKey =
  | "positions"
  | "targets"
  | "error"
  | "normal"
  | "tangential"
  | "proximity";

export interface GroupDef {
  key: GroupKey;
  label: string;
  /** Which scale band the channels live in (for axis grouping). */
  unit: "pos" | "force" | "prox";
}

export const GROUPS: GroupDef[] = [
  { key: "positions", label: "Positions", unit: "pos" },
  { key: "targets", label: "Targets", unit: "pos" },
  { key: "error", label: "Pos error", unit: "pos" },
  { key: "normal", label: "Normal force", unit: "force" },
  { key: "tangential", label: "Tangential", unit: "force" },
  { key: "proximity", label: "Proximity", unit: "prox" },
];

/* ── Persisted UI prefs ───────────────────────────────────────────────────── */
interface ScopePrefs {
  visible: Record<GroupKey, boolean>;
  windowS: number;
  toggleGroup: (k: GroupKey) => void;
  setWindowS: (s: number) => void;
}

export const useScopePrefs = create<ScopePrefs>()(
  persist(
    (set) => ({
      visible: {
        positions: true,
        targets: true,
        error: false,
        normal: true,
        tangential: false,
        proximity: false,
      },
      windowS: 8,
      toggleGroup: (k) =>
        set((st) => ({ visible: { ...st.visible, [k]: !st.visible[k] } })),
      setWindowS: (s) => set({ windowS: s }),
    }),
    { name: "studio.scope" },
  ),
);

/* ── Export helpers ───────────────────────────────────────────────────────── */
export function scopeToCSV(samples: ScopeSample[]): string {
  const head = [
    "t_ms",
    ...["thumb", "thumb_aux", "index", "middle", "ring", "pinky"].map((f) => `pos_${f}`),
    ...["thumb", "thumb_aux", "index", "middle", "ring", "pinky"].map((f) => `tgt_${f}`),
    ...["thumb", "index", "middle", "ring", "pinky"].map((f) => `normal_${f}`),
    ...["thumb", "index", "middle", "ring", "pinky"].map((f) => `tang_${f}`),
    ...["thumb", "index", "middle", "ring", "pinky"].map((f) => `prox_${f}`),
  ].join(",");
  const body = samples
    .map((s) =>
      [
        s.t.toFixed(1),
        ...s.positions,
        ...s.targets,
        ...s.normal.map((v) => Math.round(v)),
        ...s.tangential.map((v) => Math.round(v)),
        ...s.proximity.map((v) => Math.round(v)),
      ].join(","),
    )
    .join("\n");
  return `${head}\n${body}`;
}

export function scopeToJSON(samples: ScopeSample[]): string {
  return JSON.stringify(
    { window_s: SCOPE_WINDOW_S, count: samples.length, samples },
    null,
    2,
  );
}
