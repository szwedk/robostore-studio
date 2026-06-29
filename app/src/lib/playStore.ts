/**
 * Persisted Arcade state: per-drill best scores / best times, total stars,
 * current win streak, and a rolling log of recent sessions. Kept separate from
 * the device store so the live frame churn never re-renders these stats.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DrillKey = "target" | "gentle" | "slip";

export interface DrillBest {
  /** Highest score reached in a single round. */
  bestScore: number;
  /** Fastest completion (ms) — lower is better. 0 = none yet. */
  bestTimeMs: number;
  /** Total rounds played. */
  plays: number;
}

export interface SessionEntry {
  id: string;
  drill: DrillKey;
  score: number;
  /** Round duration / reaction time in ms, when meaningful. */
  timeMs: number;
  stars: number;
  ts: number;
}

const emptyBest = (): DrillBest => ({ bestScore: 0, bestTimeMs: 0, plays: 0 });

interface PlayState {
  stars: number;
  streak: number;
  bestStreak: number;
  best: Record<DrillKey, DrillBest>;
  sessions: SessionEntry[];

  /** Record a finished round. Returns the resulting streak for celebration. */
  recordRound: (e: {
    drill: DrillKey;
    score: number;
    timeMs?: number;
    stars: number;
    won: boolean;
  }) => void;
  resetProgress: () => void;
}

let idCounter = 0;
const newId = () => `s_${Date.now().toString(36)}_${(idCounter += 1)}`;

export const usePlayStore = create<PlayState>()(
  persist(
    (set) => ({
      stars: 0,
      streak: 0,
      bestStreak: 0,
      best: { target: emptyBest(), gentle: emptyBest(), slip: emptyBest() },
      sessions: [],

      recordRound: ({ drill, score, timeMs = 0, stars, won }) =>
        set((s) => {
          const prev = s.best[drill];
          const next: DrillBest = {
            bestScore: Math.max(prev.bestScore, score),
            bestTimeMs:
              timeMs > 0
                ? prev.bestTimeMs > 0
                  ? Math.min(prev.bestTimeMs, timeMs)
                  : timeMs
                : prev.bestTimeMs,
            plays: prev.plays + 1,
          };
          const streak = won ? s.streak + 1 : 0;
          const entry: SessionEntry = {
            id: newId(),
            drill,
            score,
            timeMs,
            stars,
            ts: Date.now(),
          };
          return {
            stars: s.stars + stars,
            streak,
            bestStreak: Math.max(s.bestStreak, streak),
            best: { ...s.best, [drill]: next },
            sessions: [entry, ...s.sessions].slice(0, 30),
          };
        }),

      resetProgress: () =>
        set({
          stars: 0,
          streak: 0,
          bestStreak: 0,
          best: { target: emptyBest(), gentle: emptyBest(), slip: emptyBest() },
          sessions: [],
        }),
    }),
    { name: "studio.play" },
  ),
);
