/**
 * Persisted Reflexes state: the user's authored if-this-then-that rules.
 * Kept separate from the device store so the live frame churn never re-renders
 * the rule list. The whole list is pushed to the engine via
 * `send({ type: "set_rules", rules })` whenever it changes.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ReflexSignal = "proximity" | "normal" | "tangential" | "position";
export type ReflexOp = ">" | "<";
export type ReflexAction = "tighten" | "loosen" | "set" | "open" | "pose";

export interface ReflexWhen {
  signal: ReflexSignal;
  finger: number; // actuator index 0..5
  op: ReflexOp;
  value: number;
}

export interface ReflexThen {
  action: ReflexAction;
  finger?: number; // for tighten/loosen/set
  delta?: number; // for tighten/loosen
  value?: number; // for set
  pose?: string; // for pose
}

export interface Reflex {
  id: string;
  name: string;
  enabled: boolean;
  when: ReflexWhen;
  then: ReflexThen;
}

let seq = 0;
export const reflexId = () => `rfx_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** Friendly starter rules so the panel is useful out of the box. */
export function starterRules(): Reflex[] {
  return [
    {
      id: reflexId(),
      name: "Catch a slip — index",
      enabled: true,
      when: { signal: "tangential", finger: 2, op: ">", value: 250 },
      then: { action: "tighten", finger: 2, delta: 140 },
    },
    {
      id: reflexId(),
      name: "Pre-shape pinch on approach",
      enabled: false,
      when: { signal: "proximity", finger: 2, op: ">", value: 600 },
      then: { action: "pose", pose: "pinch" },
    },
    {
      id: reflexId(),
      name: "Ease off if thumb pushes hard",
      enabled: false,
      when: { signal: "normal", finger: 0, op: ">", value: 1200 },
      then: { action: "loosen", finger: 0, delta: 120 },
    },
  ];
}

export function blankRule(): Reflex {
  return {
    id: reflexId(),
    name: "New reflex",
    enabled: true,
    when: { signal: "normal", finger: 2, op: ">", value: 500 },
    then: { action: "tighten", finger: 2, delta: 120 },
  };
}

interface ReflexState {
  rules: Reflex[];
  hydrated: boolean;
  addRule: (r: Reflex) => void;
  updateRule: (id: string, patch: Partial<Reflex>) => void;
  updateWhen: (id: string, patch: Partial<ReflexWhen>) => void;
  updateThen: (id: string, patch: Partial<ReflexThen>) => void;
  toggleRule: (id: string) => void;
  deleteRule: (id: string) => void;
  resetStarters: () => void;
}

export const useReflexStore = create<ReflexState>()(
  persist(
    (set) => ({
      rules: starterRules(),
      hydrated: false,
      addRule: (r) => set((s) => ({ rules: [r, ...s.rules] })),
      updateRule: (id, patch) =>
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      updateWhen: (id, patch) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, when: { ...r.when, ...patch } } : r)),
        })),
      updateThen: (id, patch) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, then: { ...r.then, ...patch } } : r)),
        })),
      toggleRule: (id) =>
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) })),
      deleteRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      resetStarters: () => set({ rules: starterRules() }),
    }),
    {
      name: "studio.reflexes",
      partialize: (s) => ({ rules: s.rules }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
