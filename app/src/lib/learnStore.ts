/** Persisted Learn progress: completed tutorial steps and curriculum lessons. */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LearnState {
  // tutorialId → highest step index reached + completion flag
  tutorialDone: Record<string, boolean>;
  lessonDone: Record<string, boolean>;
  completeTutorial: (id: string) => void;
  resetTutorial: (id: string) => void;
  toggleLesson: (id: string) => void;
}

export const useLearnStore = create<LearnState>()(
  persist(
    (set) => ({
      tutorialDone: {},
      lessonDone: {},
      completeTutorial: (id) => set((s) => ({ tutorialDone: { ...s.tutorialDone, [id]: true } })),
      resetTutorial: (id) => set((s) => ({ tutorialDone: { ...s.tutorialDone, [id]: false } })),
      toggleLesson: (id) =>
        set((s) => ({ lessonDone: { ...s.lessonDone, [id]: !s.lessonDone[id] } })),
    }),
    { name: "studio.learn" },
  ),
);
