import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, Clock, ArrowRight, ArrowLeft, ChevronRight, CircleCheck,
  Keyboard, Lightbulb, BookOpen,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useLearnStore } from "@/lib/learnStore";
import { TUTORIALS, CURRICULUM, type Tutorial } from "@/lib/learnContent";
import { Button } from "@/components/ui/Button";
import { SubNav } from "@/components/ui/SubNav";
import { SectionLabel, Card } from "@/components/ui/Section";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "tutorials", label: "Tutorials" },
  { key: "curriculum", label: "Curriculum" },
  { key: "tips", label: "Tips" },
];

export function Learn() {
  const [tab, setTab] = useState("tutorials");
  const [open, setOpen] = useState<Tutorial | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden p-7">
      <div className="mb-5">
        <SubNav items={TABS} active={tab} onChange={(k) => { setTab(k); setOpen(null); }} layoutId="learn-subnav" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "tutorials" &&
          (open ? (
            <Walkthrough tutorial={open} onClose={() => setOpen(null)} />
          ) : (
            <Tutorials onOpen={setOpen} />
          ))}
        {tab === "curriculum" && <Curriculum />}
        {tab === "tips" && <Tips />}
      </div>
    </div>
  );
}

/* ── Tutorials ──────────────────────────────────────────────────────────── */
function Tutorials({ onOpen }: { onOpen: (t: Tutorial) => void }) {
  const done = useLearnStore((s) => s.tutorialDone);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {TUTORIALS.map((t, i) => (
        <motion.button
          key={t.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.04 }}
          onClick={() => onOpen(t)}
          className="card group flex flex-col p-5 text-left transition-all hover:border-accent/40 hover:shadow-glow"
        >
          <div className="flex items-start justify-between">
            <div className={cn("grid h-10 w-10 place-items-center rounded-xl",
              done[t.id] ? "bg-green/15 text-green" : "bg-accent/12 text-accent")}>
              {done[t.id] ? <CircleCheck size={20} /> : <BookOpen size={18} />}
            </div>
            <span className="flex items-center gap-1 text-[11px] text-text-faint">
              <Clock size={12} /> {t.minutes} min
            </span>
          </div>
          <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.01em]">{t.title}</h3>
          <p className="mt-1 flex-1 text-[13px] leading-relaxed text-text-dim">{t.blurb}</p>
          <span className="mt-3 flex items-center gap-1 text-[13px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
            {done[t.id] ? "Review" : "Start"} <ArrowRight size={14} />
          </span>
        </motion.button>
      ))}
    </div>
  );
}

function Walkthrough({ tutorial, onClose }: { tutorial: Tutorial; onClose: () => void }) {
  const [i, setI] = useState(0);
  const { setScreen } = useStore();
  const complete = useLearnStore((s) => s.completeTutorial);
  const step = tutorial.steps[i];
  const last = i === tutorial.steps.length - 1;

  return (
    <div className="mx-auto max-w-[680px]">
      <button onClick={onClose} className="mb-4 flex items-center gap-1.5 text-[13px] text-text-dim transition-colors hover:text-text">
        <ArrowLeft size={15} /> All tutorials
      </button>
      <Card className="p-7">
        <div className="flex items-center justify-between">
          <SectionLabel>{tutorial.title}</SectionLabel>
          <span className="text-[12px] text-text-faint">Step {i + 1} of {tutorial.steps.length}</span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {tutorial.steps.map((_, n) => (
            <span key={n} className={cn("h-1 flex-1 rounded-full transition-colors",
              n <= i ? "bg-accent" : "bg-surface-3")} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22 }}
            className="mt-6 min-h-[120px]"
          >
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{step.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-text-dim">{step.body}</p>
            {step.action && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => setScreen(step.action!.screen)}>
                {step.action.label} <ArrowRight size={14} />
              </Button>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" disabled={i === 0} onClick={() => setI((n) => n - 1)}>
            <ArrowLeft size={16} /> Back
          </Button>
          {last ? (
            <Button variant="primary" onClick={() => { complete(tutorial.id); onClose(); }}>
              <Check size={16} /> Finish
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setI((n) => n + 1)}>
              Next <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ── Curriculum ─────────────────────────────────────────────────────────── */
function Curriculum() {
  const { lessonDone, toggleLesson } = useLearnStore();
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      {CURRICULUM.map((m) => {
        const total = m.lessons.length;
        const completed = m.lessons.filter((l) => lessonDone[l.id]).length;
        return (
          <Card key={m.id}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{m.title}</h3>
                <p className="mt-0.5 text-[13px] text-text-dim">{m.summary}</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-medium text-text-dim">
                {completed}/{total}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-1.5">
              {m.lessons.map((l) => {
                const isOpen = openLesson === l.id;
                const isDone = !!lessonDone[l.id];
                return (
                  <div key={l.id} className="rounded-xl border border-line/10 bg-surface-2">
                    <button
                      onClick={() => setOpenLesson(isOpen ? null : l.id)}
                      className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                    >
                      <span
                        onClick={(e) => { e.stopPropagation(); toggleLesson(l.id); }}
                        className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                          isDone ? "border-green bg-green/15 text-green" : "border-line/25 text-transparent hover:border-accent")}
                      >
                        <Check size={12} />
                      </span>
                      <span className={cn("flex-1 text-[14px] font-medium", isDone && "text-text-dim")}>{l.title}</span>
                      <ChevronRight size={16} className={cn("text-text-faint transition-transform", isOpen && "rotate-90")} />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <p className="px-3.5 pb-4 pl-[42px] text-[14px] leading-relaxed text-text-dim">{l.body}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ── Tips ───────────────────────────────────────────────────────────────── */
function Tips() {
  return (
    <div className="mx-auto grid max-w-[760px] grid-cols-1 gap-5 sm:grid-cols-2">
      <Card>
        <div className="flex items-center gap-2">
          <Lightbulb size={16} className="text-amber" />
          <SectionLabel>Quick tips</SectionLabel>
        </div>
        <ul className="mt-3 flex flex-col gap-2.5 text-[13px] leading-relaxed text-text-dim">
          {[
            "No hand connected? Everything works in Simulator — perfect for learning offline.",
            "On the live hand, fingertip color is force: green is gentle, red is firm.",
            "Lower the camera Smoothing for snappier mirroring; raise it to remove jitter.",
            "Calibrate once and the camera mirror fits your hand’s exact range.",
            "Turn on Developer mode for scripting, data export, and the local API.",
          ].map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {t}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <div className="flex items-center gap-2">
          <Keyboard size={16} className="text-accent" />
          <SectionLabel>Reference</SectionLabel>
        </div>
        <div className="mt-3 flex flex-col gap-2 text-[13px]">
          {[
            ["Position range", "0 = open · 1000 = closed"],
            ["Finger order", "Thumb · Thumb Rot · Index · Middle · Ring · Pinky"],
            ["Force bands", "green < 500 · amber < 1500 · red ≥ 1500"],
            ["Engine API", "ws://127.0.0.1:8765/ws"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <span className="text-text-dim">{k}</span>
              <span className="tnum text-right font-mono text-[12px] text-text-faint">{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
