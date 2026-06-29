/**
 * Persisted Guardian state: the live safety envelope (so it survives reloads)
 * plus named "fitting profiles" — saved limit sets a clinician or user can
 * apply per patient/hand. Kept separate from the device store so the live
 * frame churn never re-renders this slice, and vice-versa.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Envelope {
  min: number[]; // per-finger soft floor, 0..1000
  max: number[]; // per-finger soft ceiling, 0..1000
  slew: number; // max change per frame (0 = unlimited)
  maxForce: number; // fingertip force ceiling (0 = no limit)
  enabled: boolean;
}

export interface FittingProfile {
  id: string;
  name: string;
  ts: number;
  envelope: Envelope;
}

export const DEFAULT_ENVELOPE: Envelope = {
  min: [0, 0, 0, 0, 0, 0],
  max: [1000, 1000, 1000, 1000, 1000, 1000],
  slew: 0,
  maxForce: 0,
  enabled: false,
};

interface GuardianState {
  envelope: Envelope;
  profiles: FittingProfile[];
  activeProfile: string | null;

  setEnvelope: (patch: Partial<Envelope>) => void;
  setLimit: (which: "min" | "max", index: number, value: number) => void;
  saveProfile: (name: string) => void;
  applyProfile: (id: string) => Envelope | null;
  deleteProfile: (id: string) => void;
}

export const useGuardianStore = create<GuardianState>()(
  persist(
    (set, get) => ({
      envelope: DEFAULT_ENVELOPE,
      profiles: [],
      activeProfile: null,

      setEnvelope: (patch) =>
        set((s) => ({ envelope: { ...s.envelope, ...patch }, activeProfile: null })),

      setLimit: (which, index, value) =>
        set((s) => {
          const arr = [...s.envelope[which]];
          arr[index] = Math.max(0, Math.min(1000, value));
          return { envelope: { ...s.envelope, [which]: arr }, activeProfile: null };
        }),

      saveProfile: (name) =>
        set((s) => {
          const id = `prof_${Date.now().toString(36)}`;
          const profile: FittingProfile = {
            id,
            name: name.trim() || "Untitled profile",
            ts: Date.now(),
            // deep-copy the arrays so later edits don't mutate the snapshot
            envelope: {
              ...s.envelope,
              min: [...s.envelope.min],
              max: [...s.envelope.max],
            },
          };
          return { profiles: [profile, ...s.profiles], activeProfile: id };
        }),

      applyProfile: (id) => {
        const p = get().profiles.find((x) => x.id === id);
        if (!p) return null;
        const env: Envelope = {
          ...p.envelope,
          min: [...p.envelope.min],
          max: [...p.envelope.max],
        };
        set({ envelope: env, activeProfile: id });
        return env;
      },

      deleteProfile: (id) =>
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== id),
          activeProfile: s.activeProfile === id ? null : s.activeProfile,
        })),
    }),
    { name: "studio.guardian" },
  ),
);
