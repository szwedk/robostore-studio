/**
 * Persisted camera-feature state: recordings, trained gestures, calibration,
 * and mirror settings. Kept separate from the device store so the live hand
 * frame churn never re-renders this, and vice-versa.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecordingFrame {
  t: number; // ms from start
  pos: number[];
}
export interface Recording {
  id: string;
  name: string;
  ts: number;
  frames: RecordingFrame[];
}
export interface GestureSample {
  label: string;
  pos: number[];
}
export interface Calibration {
  min: number[]; // per-finger captured "open" value
  max: number[]; // per-finger captured "closed" value
}

const IDENTITY: Calibration = {
  min: [0, 0, 0, 0, 0, 0],
  max: [1000, 1000, 1000, 1000, 1000, 1000],
};

interface CameraState {
  alpha: number;
  recordings: Recording[];
  gestures: GestureSample[];
  calibration: Calibration | null;

  setAlpha: (a: number) => void;
  addRecording: (r: Recording) => void;
  deleteRecording: (id: string) => void;
  addGesture: (s: GestureSample) => void;
  clearGestures: (label?: string) => void;
  setCalibration: (c: Calibration | null) => void;
}

export const useCameraStore = create<CameraState>()(
  persist(
    (set) => ({
      alpha: 0.35,
      recordings: [],
      gestures: [],
      calibration: null,
      setAlpha: (a) => set({ alpha: a }),
      addRecording: (r) => set((s) => ({ recordings: [r, ...s.recordings] })),
      deleteRecording: (id) => set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) })),
      addGesture: (g) => set((s) => ({ gestures: [...s.gestures, g] })),
      clearGestures: (label) =>
        set((s) => ({ gestures: label ? s.gestures.filter((g) => g.label !== label) : [] })),
      setCalibration: (c) => set({ calibration: c }),
    }),
    { name: "studio.camera" },
  ),
);

/** Map a raw position through calibration into the device's 0..1000 range. */
export function applyCalibration(pos: number[], cal: Calibration | null): number[] {
  if (!cal) return pos;
  return pos.map((v, i) => {
    const lo = cal.min[i];
    const hi = cal.max[i];
    if (hi - lo < 40) return v; // ignore degenerate ranges
    const t = (v - lo) / (hi - lo);
    return Math.max(0, Math.min(1000, Math.round(t * 1000)));
  });
}

/** k-NN over the 6-dim finger-position feature. */
export function classify(
  sample: number[],
  gestures: GestureSample[],
  k = 3,
): { label: string; confidence: number } | null {
  if (gestures.length === 0) return null;
  const dist = (a: number[], b: number[]) =>
    Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
  const ranked = gestures
    .map((g) => ({ label: g.label, d: dist(sample, g.pos) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(k, gestures.length));
  const votes: Record<string, number> = {};
  for (const r of ranked) votes[r.label] = (votes[r.label] ?? 0) + 1;
  const [label, count] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return { label, confidence: count / ranked.length };
}

export const IDENTITY_CALIBRATION = IDENTITY;
