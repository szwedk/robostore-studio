import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Target, Feather, Zap, Trophy, Flame, Star, RotateCcw, Play, Trash2, Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { usePlayStore, type DrillKey } from "@/lib/playStore";
import { HandVisual } from "@/components/HandVisual";
import { Button } from "@/components/ui/Button";
import { SubNav } from "@/components/ui/SubNav";
import { SectionLabel, Card, EmptyState } from "@/components/ui/Section";
import type { DeviceModel, TouchSample } from "@/lib/protocol";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "target", label: "Hit the Target" },
  { key: "gentle", label: "Gentle Grip" },
  { key: "slip", label: "Slip Catch" },
];

/** Throttle live-telemetry reads into UI state at ~18 Hz to avoid render storms. */
function useThrottledFrame() {
  const [snap, setSnap] = useState(() => ({
    positions: useStore.getState().positions,
    touch: useStore.getState().touch,
  }));
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 55) {
        last = now;
        const s = useStore.getState();
        setSnap({ positions: s.positions, touch: s.touch });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return snap;
}

export function Arcade() {
  const model = useStore((s) => s.model);
  const [tab, setTab] = useState<DrillKey>("target");

  if (!model) return <Connecting />;

  return (
    <div className="flex h-full flex-col overflow-hidden p-7">
      <div className="mb-5 flex items-center justify-between gap-4">
        <SubNav
          items={TABS}
          active={tab}
          onChange={(k) => setTab(k as DrillKey)}
          layoutId="arcade-subnav"
        />
        <StatStrip />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        {tab === "target" && <TargetDrill model={model} />}
        {tab === "gentle" && <GentleDrill model={model} />}
        {tab === "slip" && <SlipDrill model={model} />}
        <SessionSummary />
      </div>
    </div>
  );
}

/* ── Shared header stats ─────────────────────────────────────────────────── */
function StatStrip() {
  const stars = usePlayStore((s) => s.stars);
  const streak = usePlayStore((s) => s.streak);
  return (
    <div className="flex items-center gap-2">
      <Pill icon={<Star size={13} />} tone="amber" value={stars} label="stars" />
      <Pill icon={<Flame size={13} />} tone="accent" value={streak} label="streak" />
    </div>
  );
}

function Pill({
  icon, value, label, tone,
}: { icon: React.ReactNode; value: number; label: string; tone: "amber" | "accent" }) {
  const c = tone === "amber" ? "text-amber bg-amber/12" : "text-accent bg-accent/12";
  return (
    <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold", c)}>
      {icon}
      <span className="tnum">{value}</span>
      <span className="font-normal opacity-70">{label}</span>
    </div>
  );
}

/* ── Reusable two-column drill layout ────────────────────────────────────── */
function DrillShell({
  positions, touch, model, children,
}: {
  positions: number[];
  touch: TouchSample[];
  model: DeviceModel;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
      <Card className="flex flex-col items-center justify-center">
        <div className="h-[360px] w-full max-w-[400px]">
          <HandVisual
            positions={positions}
            touch={touch}
            forceWarn={model.forceWarn}
            forceHigh={model.forceHigh}
          />
        </div>
      </Card>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </div>
  );
}

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <Star
          key={i}
          size={20}
          className={cn("transition-colors", i < count ? "text-amber" : "text-surface-3")}
          fill={i < count ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

/** Celebratory burst shown when a round is won. */
function WinBurst({ show, stars, message }: { show: boolean; stars: number; message: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
          className="flex flex-col items-center gap-2 rounded-2xl border border-green/25 bg-green/10 px-5 py-4 text-center"
        >
          <Sparkles className="text-green" size={22} />
          <div className="text-[15px] font-semibold text-green">{message}</div>
          <StarRow count={stars} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Drill 1 — Hit the Target                                                   */
/* ════════════════════════════════════════════════════════════════════════ */
const TARGET_TOL = 90; // per-finger position tolerance (0..1000)
const TARGET_ROUNDS = 5;
const TARGET_TIME = 8; // seconds per round

function poseList(model: DeviceModel): { key: string; label: string }[] {
  return Object.entries(model.poses).map(([key, p]) => ({ key, label: p.label }));
}

/** A target finger vector for each pose key (curl per upright + thumb). */
function targetForPose(key: string): number[] {
  // [thumb, thumb_aux, index, middle, ring, pinky]
  const M: Record<string, number[]> = {
    open: [0, 0, 0, 0, 0, 0],
    fist: [900, 700, 950, 950, 950, 950],
    point: [700, 600, 0, 950, 950, 950],
    peace: [700, 600, 0, 0, 950, 950],
    pinch: [600, 800, 600, 950, 950, 950],
    ok: [700, 800, 700, 0, 0, 0],
    three: [200, 200, 0, 0, 0, 950],
    rock: [600, 700, 0, 950, 950, 0],
    claw: [500, 400, 500, 500, 500, 500],
    relax: [300, 300, 300, 300, 300, 300],
  };
  return M[key] ?? [500, 500, 500, 500, 500, 500];
}

function matchPct(live: number[], target: number[]): number {
  // Average per-finger closeness mapped through the tolerance band → 0..1.
  let acc = 0;
  for (let i = 0; i < target.length; i++) {
    const err = Math.abs((live[i] ?? 0) - target[i]);
    acc += Math.max(0, 1 - err / (TARGET_TOL * 2.4));
  }
  return acc / target.length;
}

function TargetDrill({ model }: { model: DeviceModel }) {
  const { positions, touch } = useThrottledFrame();
  const setPositions = useStore((s) => s.setPositions);
  const sendPose = useStore((s) => s.sendPose);
  const recordRound = usePlayStore((s) => s.recordRound);

  const poses = poseList(model).filter((p) =>
    ["open", "fist", "point", "peace", "pinch", "ok", "three", "rock"].includes(p.key),
  );

  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(TARGET_TIME);
  const [current, setCurrent] = useState(poses[0]?.key ?? "fist");
  const [hits, setHits] = useState(0);
  const [done, setDone] = useState(false);
  const holdRef = useRef(0);
  const startRef = useRef(0);

  const target = targetForPose(current);
  const pct = matchPct(positions, target);
  const matched = pct >= 0.9;

  const pickPose = useCallback(() => {
    const next = poses[Math.floor(Math.random() * poses.length)]?.key ?? "fist";
    setCurrent(next);
    setTime(TARGET_TIME);
    holdRef.current = 0;
  }, [poses]);

  const start = () => {
    setPlaying(true);
    setDone(false);
    setRound(1);
    setScore(0);
    setHits(0);
    startRef.current = performance.now();
    pickPose();
    setPositions([0, 0, 0, 0, 0, 0]);
  };

  const finish = useCallback(
    (finalScore: number, finalHits: number) => {
      setPlaying(false);
      setDone(true);
      const stars = finalHits >= 5 ? 3 : finalHits >= 3 ? 2 : finalHits >= 1 ? 1 : 0;
      recordRound({
        drill: "target",
        score: finalScore,
        timeMs: Math.round(performance.now() - startRef.current),
        stars,
        won: finalHits >= 3,
      });
    },
    [recordRound],
  );

  // countdown + auto-advance / hold-to-confirm
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setTime((t) => {
        const nt = +(t - 0.1).toFixed(1);
        if (nt <= 0) {
          // timed out → advance with no points
          advance(false);
          return TARGET_TIME;
        }
        return nt;
      });
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, round]);

  // hold the matched pose briefly to lock the hit
  useEffect(() => {
    if (!playing) return;
    if (matched) {
      holdRef.current += 1;
      if (holdRef.current >= 4) advance(true);
    } else {
      holdRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, playing, matched]);

  const advance = (hit: boolean) => {
    const speedBonus = hit ? Math.round(time * 12) : 0;
    const gained = hit ? 100 + speedBonus : 0;
    const newScore = score + gained;
    const newHits = hits + (hit ? 1 : 0);
    setScore(newScore);
    setHits(newHits);
    if (round >= TARGET_ROUNDS) {
      finish(newScore, newHits);
    } else {
      setRound((r) => r + 1);
      pickPose();
    }
  };

  const stars = hits >= 5 ? 3 : hits >= 3 ? 2 : hits >= 1 ? 1 : 0;

  return (
    <DrillShell positions={positions} touch={touch} model={model}>
      <Card>
        <div className="flex items-center gap-3">
          <Glyph tone="accent"><Target size={20} /></Glyph>
          <div>
            <SectionLabel>Hit the Target</SectionLabel>
            <p className="mt-0.5 text-[13px] text-text-dim">
              Match the shown shape before the clock runs out. Faster = more points.
            </p>
          </div>
        </div>
      </Card>

      {!playing && !done && (
        <Card>
          <BestLine drill="target" />
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={start}>
            <Play size={18} /> Start round
          </Button>
        </Card>
      )}

      {playing && (
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Make this shape</SectionLabel>
            <span className="text-[12px] tnum text-text-faint">
              Round {round}/{TARGET_ROUNDS}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-[26px] font-semibold tracking-[-0.01em]">
              {model.poses[current]?.label ?? current}
            </div>
            <Button size="sm" variant="ghost" onClick={() => sendPose(current)} title="Preview on hand">
              Show me
            </Button>
          </div>
          <Meter pct={pct} matched={matched} />
          <div className="mt-4 flex items-center justify-between text-[13px]">
            <span className="text-text-dim">Time</span>
            <span className={cn("tnum font-semibold", time < 3 ? "text-amber" : "text-text")}>
              {time.toFixed(1)}s
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-100"
              style={{ width: `${(time / TARGET_TIME) * 100}%` }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12px] text-text-faint">Score</span>
            <span className="text-[18px] font-semibold tnum text-accent">{score}</span>
          </div>
        </Card>
      )}

      {done && (
        <Card className="flex flex-col items-center gap-3 text-center">
          <WinBurst show={hits >= 3} stars={stars} message={hits === 5 ? "Perfect run!" : "Nice work!"} />
          {hits < 3 && <div className="text-[15px] font-semibold text-text">Good try — go again!</div>}
          <div className="text-[13px] text-text-dim">
            You matched <span className="font-semibold text-text">{hits}</span> of {TARGET_ROUNDS} shapes for{" "}
            <span className="font-semibold text-accent">{score}</span> points.
          </div>
          <Button variant="primary" className="mt-1 w-full" onClick={start}>
            <RotateCcw size={16} /> Play again
          </Button>
        </Card>
      )}
    </DrillShell>
  );
}

function Meter({ pct, matched }: { pct: number; matched: boolean }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[11px] text-text-faint">
        <span>Match</span>
        <span className="tnum">{Math.round(pct * 100)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("h-full rounded-full transition-all duration-100", matched ? "bg-green" : "bg-accent")}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Drill 2 — Gentle Grip                                                      */
/* ════════════════════════════════════════════════════════════════════════ */
const GENTLE_HOLD = 3; // seconds inside the band to win

function GentleDrill({ model }: { model: DeviceModel }) {
  const { positions, touch } = useThrottledFrame();
  const setPositions = useStore((s) => s.setPositions);
  const recordRound = usePlayStore((s) => s.recordRound);

  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState(0); // seconds accumulated in band
  const [over, setOver] = useState(false); // crushed (too hard)
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);

  // Strongest touch reading across fingers drives the band.
  const peak = touch.reduce((m, t) => Math.max(m, t?.normal ?? 0), 0);
  const lo = model.forceWarn * 0.35;
  const hi = model.forceWarn * 0.9;
  const inBand = peak >= lo && peak <= hi;
  const crushed = peak >= model.forceHigh;

  const start = () => {
    setPlaying(true);
    setDone(false);
    setHeld(0);
    setScore(0);
    setOver(false);
    setPositions([0, 0, 0, 0, 0, 0]);
  };

  const finish = useCallback(
    (won: boolean, finalScore: number) => {
      setPlaying(false);
      setDone(true);
      const stars = won ? (finalScore > 280 ? 3 : 2) : 0;
      recordRound({ drill: "gentle", score: finalScore, stars, won });
    },
    [recordRound],
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const t = useStore.getState().touch;
      const p = t.reduce((m, s) => Math.max(m, s?.normal ?? 0), 0);
      if (p >= model.forceHigh) {
        setOver(true);
        finish(false, 0);
        return;
      }
      const within = p >= lo && p <= hi;
      if (within) {
        setHeld((h) => {
          const nh = +(h + 0.1).toFixed(1);
          setScore((s) => s + 4);
          if (nh >= GENTLE_HOLD) {
            finish(true, Math.round((nh * 80) + 60));
            return nh;
          }
          return nh;
        });
      } else {
        // gently decay so wandering out costs progress but isn't brutal
        setHeld((h) => Math.max(0, +(h - 0.05).toFixed(2)));
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, lo, hi, model.forceHigh]);

  return (
    <DrillShell positions={positions} touch={touch} model={model}>
      <Card>
        <div className="flex items-center gap-3">
          <Glyph tone="green"><Feather size={20} /></Glyph>
          <div>
            <SectionLabel>Gentle Grip</SectionLabel>
            <p className="mt-0.5 text-[13px] text-text-dim">
              Squeeze until the force sits in the green band — then hold steady. Don’t crush it!
            </p>
          </div>
        </div>
      </Card>

      {playing ? (
        <Card>
          <SectionLabel>Force</SectionLabel>
          <ForceGauge peak={peak} lo={lo} hi={hi} model={model} inBand={inBand} crushed={crushed} />
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[12px]">
              <span className="text-text-dim">Hold steady</span>
              <span className="tnum text-text-faint">
                {held.toFixed(1)} / {GENTLE_HOLD}s
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-green transition-all duration-100"
                style={{ width: `${Math.min(100, (held / GENTLE_HOLD) * 100)}%` }}
              />
            </div>
          </div>
          <p className="mt-3 text-center text-[13px] font-medium">
            {crushed ? (
              <span className="text-red">Too hard!</span>
            ) : inBand ? (
              <span className="text-green">Perfect — keep it there</span>
            ) : peak > hi ? (
              <span className="text-amber">Ease off a little</span>
            ) : (
              <span className="text-text-dim">Squeeze a bit more…</span>
            )}
          </p>
        </Card>
      ) : done ? (
        <Card className="flex flex-col items-center gap-3 text-center">
          {over ? (
            <>
              <Glyph tone="red"><Feather size={20} /></Glyph>
              <div className="text-[15px] font-semibold text-red">Oops — too much force!</div>
              <p className="text-[13px] text-text-dim">Try easing into the green band more slowly.</p>
            </>
          ) : (
            <WinBurst show stars={score > 280 ? 3 : 2} message="Featherlight touch!" />
          )}
          <Button variant="primary" className="mt-1 w-full" onClick={start}>
            <RotateCcw size={16} /> Try again
          </Button>
        </Card>
      ) : (
        <Card>
          <BestLine drill="gentle" />
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={start}>
            <Play size={18} /> Start grip
          </Button>
        </Card>
      )}
    </DrillShell>
  );
}

function ForceGauge({
  peak, lo, hi, model, inBand, crushed,
}: {
  peak: number; lo: number; hi: number; model: DeviceModel; inBand: boolean; crushed: boolean;
}) {
  const max = model.forceHigh;
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const color = crushed ? "var(--red)" : peak > hi ? "var(--amber)" : "var(--green)";
  return (
    <div className="mt-3">
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-surface-3">
        {/* green band marker */}
        <div
          className="absolute inset-y-0 bg-green/20"
          style={{ left: w(lo), width: `calc(${w(hi)} - ${w(lo)})` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
          style={{ width: w(peak), background: `rgb(${color})` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-text-faint">
        <span>0</span>
        <span className={cn(inBand && "font-semibold text-green")}>target band</span>
        <span className="tnum">{Math.round(peak)}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Drill 3 — Slip Catch                                                       */
/* ════════════════════════════════════════════════════════════════════════ */
const SLIP_TANGENTIAL = 60; // tangential reading that counts as a slip event

function SlipDrill({ model }: { model: DeviceModel }) {
  const { positions, touch } = useThrottledFrame();
  const setPositions = useStore((s) => s.setPositions);
  const recordRound = usePlayStore((s) => s.recordRound);

  type Phase = "idle" | "holding" | "slipping" | "result";
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0); // best reaction this run (ms)
  const [lastReact, setLastReact] = useState(0);
  const slipAt = useRef(0);
  const baseGrip = useRef(0);

  const start = () => {
    setPhase("holding");
    setRound(1);
    setScore(0);
    setBest(0);
    setLastReact(0);
    scheduleSlip();
    setPositions([0, 0, 0, 0, 0, 0]);
  };

  const slipTimer = useRef<number | undefined>(undefined);
  const scheduleSlip = useCallback(() => {
    setPhase("holding");
    const delay = 1400 + Math.random() * 2600;
    slipTimer.current = window.setTimeout(() => {
      baseGrip.current = useStore.getState().targets.reduce((a, b) => a + b, 0);
      slipAt.current = performance.now();
      setPhase("slipping");
    }, delay);
  }, []);

  useEffect(() => () => clearTimeout(slipTimer.current), []);

  // detect the user's reaction during the slip window: either a clamp-down
  // (positions increase) or a tangential spike from the synthesized slip.
  useEffect(() => {
    if (phase !== "slipping") return;
    const grip = positions.reduce((a, b) => a + b, 0);
    const tang = touch.reduce((m, t) => Math.max(m, t?.tangential ?? 0), 0);
    const reacted = grip > baseGrip.current + 220 || tang > SLIP_TANGENTIAL * 2;
    if (reacted) {
      const rt = Math.round(performance.now() - slipAt.current);
      const gained = Math.max(20, 600 - rt);
      setLastReact(rt);
      setBest((b) => (b === 0 ? rt : Math.min(b, rt)));
      setScore((s) => s + gained);
      nextRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, touch, phase]);

  // missed-the-catch timeout
  useEffect(() => {
    if (phase !== "slipping") return;
    const id = window.setTimeout(() => nextRound(), 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  const nextRound = () => {
    if (round >= 4) {
      const stars = best > 0 && best < 350 ? 3 : best > 0 && best < 600 ? 2 : score > 0 ? 1 : 0;
      recordRound({ drill: "slip", score, timeMs: best, stars, won: score > 0 });
      setPhase("result");
    } else {
      setRound((r) => r + 1);
      scheduleSlip();
    }
  };

  const slipping = phase === "slipping";

  return (
    <DrillShell positions={positions} touch={touch} model={model}>
      <Card>
        <div className="flex items-center gap-3">
          <Glyph tone="amber"><Zap size={20} /></Glyph>
          <div>
            <SectionLabel>Slip Catch</SectionLabel>
            <p className="mt-0.5 text-[13px] text-text-dim">
              Hold steady — when the object starts to slip, clamp down fast to catch it.
            </p>
          </div>
        </div>
      </Card>

      {phase === "idle" && (
        <Card>
          <BestLine drill="slip" />
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={start}>
            <Play size={18} /> Start
          </Button>
        </Card>
      )}

      {(phase === "holding" || phase === "slipping") && (
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Round {round}/4</SectionLabel>
            <span className="text-[12px] tnum text-text-faint">Score {score}</span>
          </div>
          <motion.div
            key={phase}
            initial={{ scale: 0.96, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "mt-4 flex h-[120px] flex-col items-center justify-center gap-1 rounded-2xl border text-center",
              slipping
                ? "border-red/30 bg-red/10"
                : "border-line/10 bg-surface-2",
            )}
          >
            {slipping ? (
              <>
                <Zap className="text-red animate-pulse" size={28} />
                <div className="text-[18px] font-semibold text-red">Slipping — catch it!</div>
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 animate-pulse-dot rounded-full bg-green" />
                <div className="text-[14px] text-text-dim">Hold steady… stay ready</div>
              </>
            )}
          </motion.div>
          {lastReact > 0 && !slipping && (
            <p className="mt-3 text-center text-[13px] text-green">
              Caught in <span className="font-semibold tnum">{lastReact}ms</span>!
            </p>
          )}
        </Card>
      )}

      {phase === "result" && (
        <Card className="flex flex-col items-center gap-3 text-center">
          <WinBurst
            show={score > 0}
            stars={best > 0 && best < 350 ? 3 : best > 0 && best < 600 ? 2 : 1}
            message="Quick hands!"
          />
          {score === 0 && <div className="text-[15px] font-semibold text-text">Stay sharp — try again!</div>}
          <div className="text-[13px] text-text-dim">
            {best > 0 && (
              <>Best reaction <span className="font-semibold text-accent tnum">{best}ms</span> · </>
            )}
            <span className="font-semibold text-accent">{score}</span> points
          </div>
          <Button variant="primary" className="mt-1 w-full" onClick={start}>
            <RotateCcw size={16} /> Play again
          </Button>
        </Card>
      )}
    </DrillShell>
  );
}

/* ── Shared small pieces ─────────────────────────────────────────────────── */
function Glyph({ tone, children }: { tone: "accent" | "green" | "amber" | "red"; children: React.ReactNode }) {
  const map = {
    accent: "bg-accent/12 text-accent",
    green: "bg-green/12 text-green",
    amber: "bg-amber/12 text-amber",
    red: "bg-red/12 text-red",
  } as const;
  return <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", map[tone])}>{children}</div>;
}

const DRILL_LABEL: Record<DrillKey, string> = {
  target: "Hit the Target",
  gentle: "Gentle Grip",
  slip: "Slip Catch",
};

function BestLine({ drill }: { drill: DrillKey }) {
  const best = usePlayStore((s) => s.best[drill]);
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="flex items-center gap-1.5 text-text-dim">
        <Trophy size={14} className="text-amber" /> Best
      </span>
      <span className="tnum font-semibold">
        {best.bestScore > 0 ? `${best.bestScore} pts` : "—"}
        {best.bestTimeMs > 0 && drill === "slip" && (
          <span className="font-normal text-text-faint"> · {best.bestTimeMs}ms</span>
        )}
      </span>
    </div>
  );
}

/* ── Session summary ─────────────────────────────────────────────────────── */
function SessionSummary() {
  const stars = usePlayStore((s) => s.stars);
  const bestStreak = usePlayStore((s) => s.bestStreak);
  const sessions = usePlayStore((s) => s.sessions);
  const resetProgress = usePlayStore((s) => s.resetProgress);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionLabel>Your progress</SectionLabel>
        {sessions.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm("Reset all arcade progress?")) resetProgress();
            }}
          >
            <Trash2 size={14} /> Reset
          </Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <Stat icon={<Star size={15} />} tone="amber" value={stars} label="Total stars" />
        <Stat icon={<Flame size={15} />} tone="accent" value={bestStreak} label="Best streak" />
        <Stat icon={<Trophy size={15} />} tone="green" value={sessions.length} label="Rounds played" />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {sessions.length === 0 ? (
          <EmptyState>No rounds yet — pick a drill above and play!</EmptyState>
        ) : (
          sessions.slice(0, 6).map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface-2 px-3 py-2"
            >
              <span className="flex-1 truncate text-[13px] font-medium">{DRILL_LABEL[e.drill]}</span>
              <StarRow count={e.stars} />
              <span className="w-[64px] shrink-0 text-right text-[13px] tnum text-accent">{e.score} pts</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function Stat({
  icon, value, label, tone,
}: { icon: React.ReactNode; value: number; label: string; tone: "accent" | "green" | "amber" }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-line/10 bg-surface-2 py-3">
      <Glyph tone={tone}>{icon}</Glyph>
      <span className="text-[20px] font-semibold tnum leading-none">{value}</span>
      <span className="text-[11px] text-text-faint">{label}</span>
    </div>
  );
}

function Connecting() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3 text-text-faint">
        <span className="h-2.5 w-2.5 animate-pulse-dot rounded-full bg-accent" />
        <p className="text-sm">Connecting to your hand…</p>
      </div>
    </div>
  );
}
