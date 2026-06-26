/** Persisted Developer-area state: classifier samples and pose sequences. */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ClassSample {
  label: string;
  features: number[]; // 6 positions + 5 normal forces
}
export interface SeqStep {
  id: string;
  pose: string;
  hold: number; // ms
}
export interface Sequence {
  id: string;
  name: string;
  steps: SeqStep[];
}

interface DevState {
  samples: ClassSample[];
  k: number;
  sequences: Sequence[];
  code: string;

  addSample: (s: ClassSample) => void;
  clearSamples: (label?: string) => void;
  setK: (k: number) => void;

  addSequence: (s: Sequence) => void;
  updateSequence: (s: Sequence) => void;
  deleteSequence: (id: string) => void;
  setCode: (c: string) => void;
}

const DEFAULT_CODE = `// A small async API: pose(name), move([6]), sleep(ms), log(...)
await pose("open");
await sleep(600);
await pose("fist");
await sleep(800);
await move([800, 800, 0, 1000, 1000, 1000]); // point
await sleep(800);
await pose("open");
log("sequence complete");`;

export const useDevStore = create<DevState>()(
  persist(
    (set) => ({
      samples: [],
      k: 3,
      sequences: [],
      code: DEFAULT_CODE,
      addSample: (s) => set((st) => ({ samples: [...st.samples, s] })),
      clearSamples: (label) =>
        set((st) => ({ samples: label ? st.samples.filter((x) => x.label !== label) : [] })),
      setK: (k) => set({ k }),
      addSequence: (s) => set((st) => ({ sequences: [s, ...st.sequences] })),
      updateSequence: (s) =>
        set((st) => ({ sequences: st.sequences.map((x) => (x.id === s.id ? s : x)) })),
      deleteSequence: (id) => set((st) => ({ sequences: st.sequences.filter((x) => x.id !== id) })),
      setCode: (c) => set({ code: c }),
    }),
    { name: "studio.dev" },
  ),
);

/** k-NN over an arbitrary-length feature vector. */
export function classifyFeatures(
  sample: number[],
  samples: ClassSample[],
  k: number,
): { label: string; confidence: number } | null {
  if (samples.length === 0) return null;
  const dist = (a: number[], b: number[]) =>
    Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0));
  const ranked = samples
    .map((g) => ({ label: g.label, d: dist(sample, g.features) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(k, samples.length));
  const votes: Record<string, number> = {};
  for (const r of ranked) votes[r.label] = (votes[r.label] ?? 0) + 1;
  const [label, count] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return { label, confidence: count / ranked.length };
}
