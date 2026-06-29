import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, ShieldOff, OctagonX, Activity, Save, Trash2, Check,
  Gauge, Hand as HandIcon, Power,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  useGuardianStore, DEFAULT_ENVELOPE, type Envelope, type FittingProfile,
} from "@/lib/guardianStore";
import { HandVisual } from "@/components/HandVisual";
import { Button } from "@/components/ui/Button";
import { SectionLabel, Card, EmptyState } from "@/components/ui/Section";
import { cn } from "@/lib/cn";

/** Shape the engine reports back under frame.features.guardian. */
interface GuardianStatus {
  enabled: boolean;
  estopped: boolean;
  min: number[];
  max: number[];
  slew: number;
  maxForce: number;
  trips: number;
  tripped: boolean[];
  force: number[];
}

interface TripEvent {
  id: number;
  finger: string;
  force: number;
  t: number;
}

export function Guardian() {
  const model = useStore((s) => s.model);
  const positions = useStore((s) => s.positions);
  const touch = useStore((s) => s.touch);
  const send = useStore((s) => s.send);

  const envelope = useGuardianStore((s) => s.envelope);
  const setEnvelope = useGuardianStore((s) => s.setEnvelope);
  const setLimit = useGuardianStore((s) => s.setLimit);
  const profiles = useGuardianStore((s) => s.profiles);
  const activeProfile = useGuardianStore((s) => s.activeProfile);
  const saveProfile = useGuardianStore((s) => s.saveProfile);
  const applyProfile = useGuardianStore((s) => s.applyProfile);
  const deleteProfile = useGuardianStore((s) => s.deleteProfile);

  // Live engine status (throttled out of the high-rate frame stream).
  const [status, setStatus] = useState<GuardianStatus | null>(null);
  const [trips, setTrips] = useState<TripEvent[]>([]);
  const lastTripCount = useRef(0);
  const lastTripped = useRef<boolean[]>([]);
  const uiClock = useRef(0);
  const tripId = useRef(0);

  // Push the persisted envelope to the engine on mount and whenever it changes,
  // so the safety layer always matches what the UI shows.
  useEffect(() => {
    send({ type: "set_limits", ...envelope });
  }, [envelope, send]);

  // Subscribe to the raw frame for the live envelope/trip readout, throttled.
  useEffect(() => {
    const unsub = useStore.subscribe((s) => {
      const g = s.frame?.features?.guardian as GuardianStatus | undefined;
      if (!g) return;
      const now = performance.now();

      // Detect new trips immediately (independent of the UI throttle).
      if (g.trips > lastTripCount.current && model) {
        const prev = lastTripped.current;
        const names = model.fingers;
        g.tripped.forEach((t, i) => {
          if (t && !prev[i]) {
            tripId.current += 1;
            const ev: TripEvent = {
              id: tripId.current,
              finger: names[i]?.label ?? `Finger ${i}`,
              force: g.force[i] ?? 0,
              t: Date.now(),
            };
            setTrips((list) => [ev, ...list].slice(0, 24));
          }
        });
        lastTripCount.current = g.trips;
      }
      lastTripped.current = g.tripped;

      if (now - uiClock.current > 60) {
        uiClock.current = now;
        setStatus(g);
      }
    });
    return unsub;
  }, [model]);

  if (!model) return <Connecting />;

  const estopped = status?.estopped ?? false;
  const enabled = envelope.enabled;

  const toggleEstop = () => send({ type: "estop", on: !estopped });

  return (
    <div className="grid h-full grid-cols-1 gap-5 overflow-y-auto p-7 lg:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
      {/* ── E-stop + status + hand ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <EStopCard estopped={estopped} onToggle={toggleEstop} />

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="card relative flex flex-col overflow-hidden p-6"
        >
          <div className="flex items-center justify-between">
            <SectionLabel>Protected hand</SectionLabel>
            <EnvelopeBadge enabled={enabled} estopped={estopped} />
          </div>
          <div className="relative mx-auto my-2 h-[240px] w-full max-w-[300px]">
            <HandVisual
              positions={positions}
              touch={touch}
              forceWarn={model.forceWarn}
              forceHigh={model.forceHigh}
            />
          </div>
          <StatusStrip status={status} envelope={envelope} />
        </motion.section>

        <TripLog trips={trips} totalTrips={status?.trips ?? 0} onClear={() => setTrips([])} />
      </div>

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Safety envelope</SectionLabel>
            <EnableToggle
              enabled={enabled}
              onToggle={() => setEnvelope({ enabled: !enabled })}
            />
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
            Constrain how far and how fast each finger may travel, and cap fingertip
            force. The hand can never move outside this envelope while it’s armed.
          </p>

          <div className={cn("mt-4 transition-opacity", enabled ? "" : "opacity-50")}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-faint">
                Travel range
              </span>
              <span className="text-[11px] text-text-faint">0 open · 1000 closed</span>
            </div>
            <div className="flex flex-col gap-3">
              {model.fingers.map((f, i) => (
                <RangeRow
                  key={f.key}
                  label={f.label}
                  min={envelope.min[i]}
                  max={envelope.max[i]}
                  disabled={!enabled}
                  onMin={(v) => setLimit("min", i, v)}
                  onMax={(v) => setLimit("max", i, v)}
                />
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionLabel>Limits</SectionLabel>
          <div className="mt-4 flex flex-col gap-5">
            <SliderRow
              icon={<HandIcon size={15} />}
              label="Max grip force"
              hint={envelope.maxForce === 0 ? "Off" : `${envelope.maxForce} u`}
              value={envelope.maxForce}
              min={0}
              max={model.forceHigh}
              step={50}
              disabled={!enabled}
              onChange={(v) => setEnvelope({ maxForce: v })}
              footL="No ceiling"
              footR={`${model.forceHigh} u`}
            />
            <SliderRow
              icon={<Gauge size={15} />}
              label="Speed cap (slew)"
              hint={envelope.slew === 0 ? "Unlimited" : `${envelope.slew}/frame`}
              value={envelope.slew}
              min={0}
              max={200}
              step={5}
              disabled={!enabled}
              onChange={(v) => setEnvelope({ slew: v })}
              footL="Unlimited"
              footR="Slowest"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() => setEnvelope(DEFAULT_ENVELOPE)}
          >
            Reset to defaults
          </Button>
        </Card>

        <ProfilesCard
          profiles={profiles}
          activeProfile={activeProfile}
          onSave={saveProfile}
          onApply={(id) => {
            const env = applyProfile(id);
            if (env) send({ type: "set_limits", ...env });
          }}
          onDelete={deleteProfile}
        />
      </div>
    </div>
  );
}

/* ── E-stop ──────────────────────────────────────────────────────────────── */
function EStopCard({ estopped, onToggle }: { estopped: boolean; onToggle: () => void }) {
  return (
    <section
      className={cn(
        "card relative overflow-hidden p-6 transition-colors",
        estopped ? "border-red/40 bg-red/[0.06]" : "",
      )}
    >
      <div className="flex items-center justify-between">
        <SectionLabel>Emergency stop</SectionLabel>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            estopped ? "bg-red/15 text-red" : "bg-green/12 text-green",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              estopped ? "bg-red animate-pulse-dot" : "bg-green",
            )}
          />
          {estopped ? "STOPPED" : "Live"}
        </span>
      </div>

      <button
        onClick={onToggle}
        className={cn(
          "group mt-4 flex w-full items-center justify-center gap-3 rounded-2xl py-6 font-semibold",
          "transition-all duration-150 focus-ring no-drag active:scale-[0.985]",
          estopped
            ? "bg-surface-3 text-text hover:bg-surface-2 border border-line/15"
            : "bg-red text-white shadow-[0_10px_40px_-12px_rgb(var(--red)/0.8)] hover:brightness-110",
        )}
      >
        {estopped ? <Power size={26} /> : <OctagonX size={26} />}
        <span className="text-[19px] tracking-[-0.01em]">
          {estopped ? "Release & resume" : "EMERGENCY STOP"}
        </span>
      </button>
      <p className="mt-3 text-center text-[12px] text-text-faint">
        {estopped
          ? "Hand is held fully open. Release to resume commands."
          : "Instantly opens the hand and holds it until released."}
      </p>
    </section>
  );
}

/* ── Status pieces ─────────────────────────────────────────────────────────── */
function EnvelopeBadge({ enabled, estopped }: { enabled: boolean; estopped: boolean }) {
  if (estopped)
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-red/15 px-2.5 py-1 text-[11px] font-semibold text-red">
        <ShieldOff size={13} /> E-stop
      </span>
    );
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        enabled ? "bg-green/12 text-green" : "bg-surface-3/60 text-text-faint",
      )}
    >
      {enabled ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
      {enabled ? "Armed" : "Disarmed"}
    </span>
  );
}

function StatusStrip({
  status,
  envelope,
}: {
  status: GuardianStatus | null;
  envelope: Envelope;
}) {
  const slew = status?.slew ?? envelope.slew;
  const force = status?.maxForce ?? envelope.maxForce;
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      <Stat label="Force cap" value={force > 0 ? `${Math.round(force)}u` : "Off"} />
      <Stat label="Speed cap" value={slew > 0 ? `${slew}/f` : "Free"} />
      <Stat label="Trips" value={String(status?.trips ?? 0)} accent={(status?.trips ?? 0) > 0} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface-2 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-text-faint">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[15px] font-semibold tnum",
          accent ? "text-amber" : "text-text",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ── Trip log ──────────────────────────────────────────────────────────────── */
function TripLog({
  trips,
  totalTrips,
  onClear,
}: {
  trips: { id: number; finger: string; force: number; t: number }[];
  totalTrips: number;
  onClear: () => void;
}) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <SectionLabel>Trip log</SectionLabel>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-text-faint">
            <Activity size={12} /> {totalTrips} total
          </span>
          {trips.length > 0 && (
            <button
              onClick={onClear}
              className="text-[11px] text-text-faint hover:text-text"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex max-h-[180px] flex-col gap-1.5 overflow-y-auto">
        {trips.length === 0 ? (
          <EmptyState>No force trips. The hand is within its force ceiling.</EmptyState>
        ) : (
          trips.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-2 rounded-lg border border-amber/15 bg-amber/[0.06] px-3 py-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              <span className="flex-1 text-[13px] font-medium">
                {ev.finger} over force ceiling
              </span>
              <span className="tnum text-[12px] text-amber">{Math.round(ev.force)}u</span>
              <span className="tnum text-[11px] text-text-faint">
                {new Date(ev.t).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/* ── Controls ──────────────────────────────────────────────────────────────── */
function EnableToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors focus-ring no-drag",
        enabled ? "bg-green" : "bg-surface-3",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function RangeRow({
  label,
  min,
  max,
  disabled,
  onMin,
  onMax,
}: {
  label: string;
  min: number;
  max: number;
  disabled: boolean;
  onMin: (v: number) => void;
  onMax: (v: number) => void;
}) {
  return (
    <div className={cn("flex items-center gap-3 transition-opacity", disabled ? "opacity-50" : "")}>
      <span className="w-[68px] shrink-0 text-[13px] font-medium text-text-dim">{label}</span>
      <div className="flex flex-1 flex-col gap-1.5">
        <input
          type="range"
          min={0}
          max={1000}
          value={min}
          disabled={disabled}
          onChange={(e) => onMin(Math.min(Number(e.target.value), max))}
          className="slider h-[5px] w-full"
          style={{ ["--pct" as string]: `${(min / 1000) * 100}%` }}
          aria-label={`${label} minimum`}
        />
        <input
          type="range"
          min={0}
          max={1000}
          value={max}
          disabled={disabled}
          onChange={(e) => onMax(Math.max(Number(e.target.value), min))}
          className="slider h-[5px] w-full"
          style={{ ["--pct" as string]: `${(max / 1000) * 100}%` }}
          aria-label={`${label} maximum`}
        />
      </div>
      <span className="w-[78px] shrink-0 text-right text-[11px] tnum text-text-faint">
        {min}–{max}
      </span>
    </div>
  );
}

function SliderRow({
  icon,
  label,
  hint,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  footL,
  footR,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (v: number) => void;
  footL: string;
  footR: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("transition-opacity", disabled ? "opacity-50" : "")}>
      <div className="mb-2 flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-2 font-medium text-text-dim">
          <span className="text-text-faint">{icon}</span>
          {label}
        </span>
        <span className="tnum text-text-faint">{hint}</span>
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
      <div className="mt-1 flex justify-between text-[10px] text-text-faint">
        <span>{footL}</span>
        <span>{footR}</span>
      </div>
    </div>
  );
}

/* ── Fitting profiles ─────────────────────────────────────────────────────── */
function ProfilesCard({
  profiles,
  activeProfile,
  onSave,
  onApply,
  onDelete,
}: {
  profiles: FittingProfile[];
  activeProfile: string | null;
  onSave: (name: string) => void;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");

  const save = () => {
    onSave(name.trim());
    setName("");
  };

  return (
    <Card>
      <SectionLabel>Fitting profiles</SectionLabel>
      <p className="mt-2 text-[13px] text-text-dim">
        Save the current envelope as a named profile — one per patient or fitting —
        and apply it in a tap.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && save()}
          placeholder="Profile name, e.g. Patient A"
          className="focus-ring flex-1 rounded-xl border border-line/10 bg-surface-2 px-3 py-2 text-[13px] outline-none"
        />
        <Button variant="primary" disabled={!name.trim()} onClick={save}>
          <Save size={15} /> Save
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {profiles.length === 0 && <EmptyState>No saved profiles yet.</EmptyState>}
        {profiles.map((p) => {
          const active = p.id === activeProfile;
          return (
            <div
              key={p.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-surface-2 px-3 py-2.5 transition-colors",
                active ? "border-accent/40" : "border-line/10",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                  {p.name}
                  {active && <Check size={13} className="shrink-0 text-accent" />}
                </div>
                <div className="text-[11px] text-text-faint">
                  {p.envelope.maxForce > 0 ? `${p.envelope.maxForce}u force` : "no force cap"}
                  {" · "}
                  {p.envelope.slew > 0 ? `${p.envelope.slew}/f` : "free speed"}
                  {" · "}
                  {p.envelope.enabled ? "armed" : "disarmed"}
                </div>
              </div>
              <Button
                size="sm"
                variant={active ? "secondary" : "primary"}
                onClick={() => onApply(p.id)}
              >
                {active ? "Applied" : "Apply"}
              </Button>
              <button
                title="Delete"
                onClick={() => onDelete(p.id)}
                className="grid h-8 w-8 place-items-center rounded-lg text-text-faint transition-colors hover:bg-surface-3 hover:text-text"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
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
