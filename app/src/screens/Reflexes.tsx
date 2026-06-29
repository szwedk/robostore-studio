import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Zap, RotateCcw, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  useReflexStore,
  blankRule,
  type Reflex,
  type ReflexSignal,
  type ReflexOp,
  type ReflexAction,
} from "@/lib/reflexStore";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Section";
import { cn } from "@/lib/cn";

const SIGNALS: { value: ReflexSignal; label: string; touchOnly: boolean }[] = [
  { value: "proximity", label: "Proximity", touchOnly: true },
  { value: "normal", label: "Grip force", touchOnly: true },
  { value: "tangential", label: "Slip force", touchOnly: true },
  { value: "position", label: "Position", touchOnly: false },
];

const ACTIONS: { value: ReflexAction; label: string }[] = [
  { value: "tighten", label: "Tighten" },
  { value: "loosen", label: "Loosen" },
  { value: "set", label: "Set to" },
  { value: "pose", label: "Strike pose" },
  { value: "open", label: "Open hand" },
];

// touch sensors only exist on the five fingertips (no thumb-rotation actuator)
const TOUCH_ACTUATORS = new Set([0, 2, 3, 4, 5]);

export function Reflexes() {
  const model = useStore((s) => s.model);
  const connected = useStore((s) => s.connected);
  const send = useStore((s) => s.send);
  const { rules, addRule, updateRule, updateWhen, updateThen, toggleRule, deleteRule, resetStarters } =
    useReflexStore();

  // Push the full rule list to the engine whenever it changes (and on connect).
  const lastSent = useRef("");
  useEffect(() => {
    const payload = JSON.stringify(rules);
    if (payload === lastSent.current && lastSent.current) return;
    lastSent.current = payload;
    send({ type: "set_rules", rules });
  }, [rules, send, connected]);

  // Re-send once the device (re)connects so a fresh engine picks up our rules.
  useEffect(() => {
    if (connected) send({ type: "set_rules", rules });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Live "which rules are firing" — read off the frame at ~15Hz to stay smooth.
  const active = useLiveActive();

  if (!model) return <Connecting />;

  const fingers = model.fingers;
  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="flex h-full flex-col overflow-hidden p-7">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/12 text-accent">
              <Zap size={18} />
            </div>
            <div>
              <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Reflexes</h1>
              <p className="text-[12px] text-text-faint">
                Automatic if-this-then-that rules that run on the hand itself.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={resetStarters} title="Restore starter rules">
            <RotateCcw size={14} /> Starters
          </Button>
          <Button size="sm" variant="primary" onClick={() => addRule(blankRule())}>
            <Plus size={15} /> New reflex
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-[12px] text-text-faint">
        <span className="rounded-full bg-surface-2 px-2.5 py-1">
          {enabledCount} active · {rules.length} total
        </span>
        {!connected && (
          <span className="rounded-full bg-amber/10 px-2.5 py-1 text-amber">
            Hand offline — rules apply once connected
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {rules.length === 0 && (
          <EmptyState>
            No reflexes yet. Add one, or restore the friendly starter set.
          </EmptyState>
        )}
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            firing={active.includes(rule.id)}
            fingers={fingers}
            poses={model.poses}
            posMax={model.posMax}
            onToggle={() => toggleRule(rule.id)}
            onDelete={() => deleteRule(rule.id)}
            onName={(name) => updateRule(rule.id, { name })}
            onWhen={(p) => updateWhen(rule.id, p)}
            onThen={(p) => updateThen(rule.id, p)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── live firing read ─────────────────────────────────────────────────────── */
function useLiveActive(): string[] {
  const [active, setActive] = useState<string[]>([]);
  const clock = useRef(0);
  useEffect(() => {
    // Throttle to ~15Hz so a 30Hz frame stream never causes a re-render storm.
    const unsub = useStore.subscribe((s) => {
      const now = performance.now();
      if (now - clock.current < 66) return;
      clock.current = now;
      const ids = (s.frame?.features?.["reflexes"] as { active?: string[] } | undefined)?.active ?? [];
      setActive((prev) =>
        prev.length === ids.length && prev.every((v, i) => v === ids[i]) ? prev : ids,
      );
    });
    return unsub;
  }, []);
  return active;
}

/* ── one rule card ────────────────────────────────────────────────────────── */
function RuleCard({
  rule,
  firing,
  fingers,
  poses,
  posMax,
  onToggle,
  onDelete,
  onName,
  onWhen,
  onThen,
}: {
  rule: Reflex;
  firing: boolean;
  fingers: { key: string; label: string }[];
  poses: Record<string, { label: string }>;
  posMax: number;
  onToggle: () => void;
  onDelete: () => void;
  onName: (name: string) => void;
  onWhen: (p: Partial<Reflex["when"]>) => void;
  onThen: (p: Partial<Reflex["then"]>) => void;
}) {
  const signalMeta = SIGNALS.find((s) => s.value === rule.when.signal);
  const touchOnly = signalMeta?.touchOnly ?? false;

  // When a touch signal is chosen but the actuator has no sensor, snap to a valid one.
  const fingerChoices = fingers
    .map((f, i) => ({ ...f, i }))
    .filter((f) => (touchOnly ? TOUCH_ACTUATORS.has(f.i) : true));

  const { action } = rule.then;
  const needsFinger = action === "tighten" || action === "loosen" || action === "set";

  return (
    <Card
      className={cn(
        "transition-colors",
        rule.enabled ? "" : "opacity-60",
        firing && "border-accent/50 shadow-[0_0_0_1px_rgb(var(--accent)/0.4),0_8px_30px_-12px_rgb(var(--accent)/0.55)]",
      )}
    >
      <div className="flex items-center gap-3">
        <Toggle on={rule.enabled} onClick={onToggle} />
        <input
          value={rule.name}
          onChange={(e) => onName(e.target.value)}
          className="focus-ring min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 text-[14px] font-medium outline-none hover:bg-surface-2/60 focus:bg-surface-2"
          placeholder="Rule name"
        />
        <FiringPill firing={firing} />
        <button
          title="Delete rule"
          onClick={onDelete}
          className="grid h-8 w-8 place-items-center rounded-lg text-text-faint transition-colors hover:bg-red/10 hover:text-red"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2 rounded-xl border border-line/10 bg-surface-2 p-3">
        <Chip>When</Chip>
        <Select
          value={rule.when.signal}
          onChange={(v) => {
            const meta = SIGNALS.find((s) => s.value === v);
            const patch: Partial<Reflex["when"]> = { signal: v as ReflexSignal };
            // keep finger valid for touch-only signals
            if (meta?.touchOnly && !TOUCH_ACTUATORS.has(rule.when.finger)) patch.finger = 2;
            onWhen(patch);
          }}
          options={SIGNALS.map((s) => ({ value: s.value, label: s.label }))}
        />
        <Chip>on</Chip>
        <Select
          value={String(rule.when.finger)}
          onChange={(v) => onWhen({ finger: Number(v) })}
          options={fingerChoices.map((f) => ({ value: String(f.i), label: f.label }))}
        />
        <Select
          value={rule.when.op}
          onChange={(v) => onWhen({ op: v as ReflexOp })}
          options={[
            { value: ">", label: "is above" },
            { value: "<", label: "is below" },
          ]}
        />
        <NumberInput
          value={rule.when.value}
          step={rule.when.signal === "position" ? 50 : 50}
          max={rule.when.signal === "position" ? posMax : 3000}
          onChange={(v) => onWhen({ value: v })}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line/10 bg-surface-2 p-3">
        <Chip tone="accent">
          <ArrowRight size={12} className="-ml-0.5" /> Then
        </Chip>
        <Select
          value={rule.then.action}
          onChange={(v) => onThen({ action: v as ReflexAction })}
          options={ACTIONS.map((a) => ({ value: a.value, label: a.label }))}
        />
        {needsFinger && (
          <Select
            value={String(rule.then.finger ?? 2)}
            onChange={(v) => onThen({ finger: Number(v) })}
            options={fingers.map((f, i) => ({ value: String(i), label: f.label }))}
          />
        )}
        {(action === "tighten" || action === "loosen") && (
          <>
            <Chip>by</Chip>
            <NumberInput
              value={rule.then.delta ?? 120}
              step={20}
              max={posMax}
              onChange={(v) => onThen({ delta: v })}
            />
          </>
        )}
        {action === "set" && (
          <>
            <Chip>to</Chip>
            <NumberInput
              value={rule.then.value ?? 1000}
              step={50}
              max={posMax}
              onChange={(v) => onThen({ value: v })}
            />
          </>
        )}
        {action === "pose" && (
          <Select
            value={rule.then.pose ?? Object.keys(poses)[0] ?? "open"}
            onChange={(v) => onThen({ pose: v })}
            options={Object.entries(poses).map(([key, p]) => ({ value: key, label: p.label }))}
          />
        )}
      </div>
    </Card>
  );
}

/* ── small controls ───────────────────────────────────────────────────────── */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={cn(
        "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200",
        on ? "bg-accent" : "bg-surface-3",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
          on ? "left-[19px]" : "left-[3px]",
        )}
      />
    </button>
  );
}

function FiringPill({ firing }: { firing: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
        firing ? "bg-accent/15 text-accent" : "text-text-faint",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-all",
          firing ? "animate-pulse-dot bg-accent" : "bg-surface-3",
        )}
      />
      {firing ? "Firing" : "Idle"}
    </span>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wider",
        tone === "accent" ? "text-accent" : "text-text-faint",
      )}
    >
      {children}
    </span>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus-ring h-8 rounded-lg border border-line/10 bg-surface-3 px-2.5 text-[13px] font-medium text-text outline-none transition-colors hover:border-line/20"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  step = 50,
  max = 3000,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={0}
      max={max}
      step={step}
      onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
      className="focus-ring h-8 w-[78px] rounded-lg border border-line/10 bg-surface-3 px-2.5 text-[13px] tnum text-text outline-none transition-colors hover:border-line/20"
    />
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
