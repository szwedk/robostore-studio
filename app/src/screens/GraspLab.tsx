import { useEffect, useRef, useState } from "react";
import { Hand, Zap, Square, Target, Activity, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { HandVisual } from "@/components/HandVisual";
import { Button } from "@/components/ui/Button";
import { SubNav } from "@/components/ui/SubNav";
import { SectionLabel, Card } from "@/components/ui/Section";
import { cn } from "@/lib/cn";

/* Actuator index (0..5) → fingertip touch index (0..4). Mirrors the engine's
 * ACTUATOR_TO_TOUCH; thumb_aux (actuator 1) has no sensor and is excluded. */
const ACTUATOR_TO_TOUCH: Record<number, number> = { 0: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

interface Grip {
  key: string;
  label: string;
  hint: string;
  /** Sensor-bearing actuators driven by the closed loop. */
  fingers: number[];
}

const GRIPS: Grip[] = [
  { key: "pinch", label: "Pinch", hint: "Thumb + index", fingers: [0, 2] },
  { key: "tripod", label: "Tripod", hint: "Thumb + index + middle", fingers: [0, 2, 3] },
  { key: "power", label: "Power", hint: "All four + thumb", fingers: [0, 2, 3, 4, 5] },
];

interface GraspStatus {
  armed: boolean;
  forceTarget: number;
  fingers: number[];
  kp: number;
  force: number[];
  tangential: number[];
  slip: boolean[];
}

export function GraspLab() {
  const model = useStore((s) => s.model);
  const send = useStore((s) => s.send);
  const sendPose = useStore((s) => s.sendPose);

  const [gripKey, setGripKey] = useState("tripod");
  const [forceTarget, setForceTarget] = useState(700);
  const [kp, setKp] = useState(0.05);

  // High-rate telemetry throttled to ~20 Hz to avoid re-render storms.
  const [status, setStatus] = useState<GraspStatus | null>(null);
  const [positions, setPositions] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const clock = useRef(0);

  useEffect(() => {
    const unsub = useStore.subscribe((s) => {
      const now = performance.now();
      if (now - clock.current < 50) return;
      clock.current = now;
      setStatus((s.features?.grasp as GraspStatus) ?? null);
      setPositions(s.positions);
    });
    return unsub;
  }, []);

  if (!model) return <Connecting />;

  const grip = GRIPS.find((g) => g.key === gripKey)!;
  const armed = !!status?.armed;
  const touch = useStore.getState().touch;

  const grasp = () =>
    send({
      type: "grasp_close",
      fingers: grip.fingers,
      force_target: forceTarget,
      gains: { kp },
    });
  const release = () => {
    send({ type: "grasp_release" });
    sendPose("open");
  };

  // Per-finger force tracking for the active grip, for plots + the margin gauge.
  const tracked = grip.fingers
    .map((act) => ({ act, ti: ACTUATOR_TO_TOUCH[act] }))
    .filter((f) => f.ti != null);

  const forces = tracked.map(({ ti }) => status?.force?.[ti] ?? 0);
  const meanForce = forces.length ? forces.reduce((a, b) => a + b, 0) / forces.length : 0;
  // Grip margin: how close the weakest contact is to the target (0..1).
  const minForce = forces.length ? Math.min(...forces) : 0;
  const margin = forceTarget > 0 ? Math.min(1, minForce / forceTarget) : 0;
  const anySlip = tracked.some(({ ti }) => status?.slip?.[ti]);

  return (
    <div className="grid h-full grid-cols-1 gap-5 overflow-y-auto p-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
      {/* ── Hand + live tactile workbench ──────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <section className="card relative flex flex-1 flex-col overflow-hidden p-6">
          <div className="flex items-start justify-between">
            <div>
              <SectionLabel>Grasp Lab</SectionLabel>
              <p className="mt-1 text-[12px] text-text-faint">
                Closed-loop force control with a slip reflex.
              </p>
            </div>
            <ArmedPill armed={armed} slip={anySlip} />
          </div>

          <div className="relative mx-auto my-2 h-[300px] w-full max-w-[380px] flex-1">
            <HandVisual
              positions={positions}
              touch={touch}
              forceWarn={model.forceWarn}
              forceHigh={model.forceHigh}
            />
          </div>

          <MarginGauge margin={margin} active={armed} />
        </section>

        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Contact force vs target</SectionLabel>
            <span className="text-[11px] tnum text-text-faint">
              target {forceTarget}
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {tracked.map(({ act, ti }) => (
              <ForceBar
                key={act}
                label={model.fingers[act]?.label ?? `F${act}`}
                value={status?.force?.[ti] ?? 0}
                target={forceTarget}
                high={model.forceHigh}
                slip={!!status?.slip?.[ti]}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <SectionLabel>Grip</SectionLabel>
          <div className="mt-3">
            <SubNav
              items={GRIPS.map((g) => ({ key: g.key, label: g.label }))}
              active={gripKey}
              onChange={setGripKey}
              layoutId="grasp-grip"
            />
          </div>
          <p className="mt-3 text-[13px] text-text-dim">{grip.hint}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {grip.fingers.map((act) => (
              <span
                key={act}
                className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-dim"
              >
                {model.fingers[act]?.short ?? act}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <SectionLabel>Tuning</SectionLabel>
          <SliderRow
            icon={<Target size={14} />}
            label="Target force"
            value={forceTarget}
            display={String(forceTarget)}
            min={50}
            max={model.forceHigh}
            step={10}
            onChange={setForceTarget}
            disabled={armed}
          />
          <SliderRow
            icon={<Activity size={14} />}
            label="Loop gain (kp)"
            value={kp}
            display={kp.toFixed(3)}
            min={0.01}
            max={0.2}
            step={0.005}
            onChange={setKp}
            disabled={armed}
          />
          <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
            Each finger squeezes until its fingertip reaches the target force, then
            holds. If the object starts to slip, the grip tightens automatically.
          </p>
        </Card>

        <Card>
          <SectionLabel>Run</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={grasp}
              disabled={armed}
            >
              <Zap size={18} /> Grasp
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={release}
              disabled={!armed}
            >
              <Square size={16} /> Release
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Mean force" value={Math.round(meanForce)} accent={armed} />
            <Stat label="Grip margin" value={`${Math.round(margin * 100)}%`} accent={armed} />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────── */
function ArmedPill({ armed, slip }: { armed: boolean; slip: boolean }) {
  const label = slip ? "Slip caught" : armed ? "Armed" : "Idle";
  const tone = slip
    ? "bg-amber/12 text-amber"
    : armed
    ? "bg-green/12 text-green"
    : "bg-surface-3/60 text-text-faint";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
        tone,
      )}
    >
      {slip ? <AlertTriangle size={13} /> : <Hand size={13} />}
      {label}
    </div>
  );
}

function MarginGauge({ margin, active }: { margin: number; active: boolean }) {
  const pct = Math.round(margin * 100);
  const color = !active ? "var(--surface-3)" : margin >= 0.95 ? "var(--green)" : "var(--amber)";
  return (
    <div className="mt-2">
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-text-faint">Grip margin</span>
        <span className="tnum text-text-dim">{active ? `${pct}%` : "—"}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{ width: `${active ? pct : 0}%`, background: `rgb(${color})` }}
        />
      </div>
    </div>
  );
}

function ForceBar({
  label,
  value,
  target,
  high,
  slip,
}: {
  label: string;
  value: number;
  target: number;
  high: number;
  slip: boolean;
}) {
  const scale = Math.max(high, target);
  const pct = Math.min(100, (value / scale) * 100);
  const targetPct = Math.min(100, (target / scale) * 100);
  const reached = value >= target * 0.9;
  const color = slip ? "var(--amber)" : reached ? "var(--green)" : "var(--accent)";
  return (
    <div className="flex items-center gap-3">
      <span className="w-[64px] shrink-0 text-[13px] font-medium text-text-dim">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{ width: `${pct}%`, background: `rgb(${color})` }}
        />
        {/* target marker */}
        <span
          className="absolute top-0 h-full w-[2px] bg-text/40"
          style={{ left: `${targetPct}%` }}
        />
      </div>
      <span className="w-[42px] shrink-0 text-right text-[12px] tnum text-text-faint">
        {Math.round(value)}
      </span>
    </div>
  );
}

function SliderRow({
  icon,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("mt-4", disabled && "opacity-50")}>
      <div className="mb-2 flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-1.5 text-text-dim">
          {icon}
          {label}
        </span>
        <span className="tnum text-text-faint">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider w-full"
        style={{ ["--pct" as string]: `${pct}%` }}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent: boolean }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] text-text-faint">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[20px] font-semibold tnum leading-none",
          accent ? "text-text" : "text-text-faint",
        )}
      >
        {value}
      </div>
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
