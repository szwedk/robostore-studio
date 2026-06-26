import { motion } from "framer-motion";
import { Play, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import { HandVisual } from "@/components/HandVisual";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function Control() {
  const { model, positions, targets, touch, deviceInfo, sendPose, runDemo, setFinger } =
    useStore();

  if (!model) return <Connecting />;

  const poseEntries = Object.entries(model.poses);

  return (
    <div className="grid h-full grid-cols-1 gap-5 overflow-y-auto p-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
      {/* ── Hand + sensors ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="card relative flex flex-1 flex-col overflow-hidden p-6"
        >
          <div className="flex items-start justify-between">
            <div>
              <SectionLabel>Live hand</SectionLabel>
              <p className="mt-1 max-w-[280px] truncate text-[12px] text-text-faint">
                {deviceInfo || "Awaiting device…"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => sendPose("open")}>
                <RotateCcw size={14} /> Reset
              </Button>
              <Button size="sm" variant="primary" onClick={runDemo}>
                <Play size={14} /> Run demo
              </Button>
            </div>
          </div>

          <div className="relative mx-auto my-2 h-[340px] w-full max-w-[420px] flex-1">
            <HandVisual
              positions={positions}
              touch={touch}
              forceWarn={model.forceWarn}
              forceHigh={model.forceHigh}
            />
          </div>
        </motion.section>

        <Sensors />
      </div>

      {/* ── Poses + fingers ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <section className="card p-5">
          <SectionLabel>Poses</SectionLabel>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {poseEntries.map(([key, pose]) => (
              <button
                key={key}
                onClick={() => sendPose(key)}
                className={cn(
                  "group flex h-[64px] flex-col items-center justify-center gap-1 rounded-xl",
                  "border border-line/10 bg-surface-2 text-text-dim",
                  "transition-all duration-150 hover:border-accent/40 hover:text-text",
                  "hover:shadow-[0_6px_20px_-10px_rgb(var(--accent)/0.5)] active:scale-[0.97]",
                )}
              >
                <PoseGlyph name={key} />
                <span className="text-[12px] font-medium">{pose.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <SectionLabel>Finger control</SectionLabel>
            <span className="text-[11px] text-text-faint">0 open · 1000 closed</span>
          </div>
          <div className="mt-4 flex flex-col gap-3.5">
            {model.fingers.map((f, i) => (
              <FingerRow
                key={f.key}
                label={f.label}
                value={Math.round(targets[i] ?? 0)}
                max={model.posMax}
                onChange={(v) => setFinger(i, v)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-faint">
      {children}
    </span>
  );
}

function FingerRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[68px] shrink-0 text-[13px] font-medium text-text-dim">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider flex-1"
        style={{ ["--pct" as string]: `${(value / max) * 100}%` }}
      />
      <span className="w-[42px] shrink-0 text-right text-[12px] tnum text-text-faint">
        {value}
      </span>
    </div>
  );
}

function Sensors() {
  const { model, touch } = useStore();
  if (!model) return null;
  return (
    <section className="card p-5">
      <SectionLabel>Tactile sensors</SectionLabel>
      <div className="mt-3 grid grid-cols-5 gap-2.5">
        {model.touchFingers.map((finger, i) => {
          const s = touch[i];
          const normal = s?.normal ?? 0;
          const band =
            normal >= model.forceHigh ? "high" : normal >= model.forceWarn ? "warn" : "ok";
          const color =
            band === "high" ? "var(--red)" : band === "warn" ? "var(--amber)" : "var(--green)";
          const active = (s?.status ?? 0) > 0;
          const pct = Math.min(100, (normal / model.forceHigh) * 100);
          return (
            <div
              key={finger}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border bg-surface-2 p-2.5 transition-colors",
                active ? "border-line/20" : "border-line/10",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                  {finger.slice(0, 2)}
                </span>
                <span
                  className="h-1.5 w-1.5 rounded-full transition-all"
                  style={{
                    background: active ? `rgb(${color})` : "rgb(var(--surface-3))",
                    boxShadow: active ? `0 0 6px rgb(${color})` : "none",
                  }}
                />
              </div>
              <span
                className="text-[18px] font-semibold tnum leading-none transition-colors"
                style={{ color: normal > 1 ? `rgb(${color})` : "rgb(var(--text-faint))" }}
              >
                {Math.round(normal)}
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{ width: `${pct}%`, background: `rgb(${color})` }}
                />
              </div>
              <span className="text-[9px] text-text-faint">
                prox {Math.round(s?.proximity ?? 0)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Minimal abstract glyph per pose — a 3-bar curl indicator, no emoji. */
function PoseGlyph({ name }: { name: string }) {
  const curls: Record<string, number[]> = {
    open: [0, 0, 0, 0],
    fist: [1, 1, 1, 1],
    point: [0, 1, 1, 1],
    peace: [0, 0, 1, 1],
    pinch: [0.5, 1, 1, 1],
    ok: [0.7, 0, 0, 0],
    gun: [0, 1, 1, 1],
    claw: [0.5, 0.5, 0.5, 0.5],
    relax: [0.3, 0.3, 0.3, 0.3],
    three: [0, 0, 0, 1],
    rock: [0, 1, 1, 0],
    thumbs: [1, 1, 1, 1],
  };
  const c = curls[name] ?? [0, 0, 0, 0];
  return (
    <svg width="26" height="16" viewBox="0 0 26 16" className="text-current opacity-70">
      {c.map((curl, i) => {
        const h = 13 - curl * 9;
        return (
          <rect
            key={i}
            x={3 + i * 6}
            y={14 - h}
            width="3.4"
            height={h}
            rx="1.7"
            fill="currentColor"
          />
        );
      })}
    </svg>
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
