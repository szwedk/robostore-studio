import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pause, Play, Trash2, Download, Crosshair, Zap, Gauge,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  attachScope, readSamples, sampleCount, clearScope, nowRel,
  setCapturePaused, setMarker, getMarker,
  GROUPS, useScopePrefs, scopeToCSV, scopeToJSON,
  type GroupKey, type ScopeSample,
} from "@/lib/scopeStore";
import { Button } from "@/components/ui/Button";
import { SectionLabel, Card } from "@/components/ui/Section";
import { downloadFile } from "@/lib/download";
import { cn } from "@/lib/cn";

/* Channel palette — distinct, dark-friendly hues. 6 fingers max per group. */
const FINGER_LABELS = ["Thumb", "Thumb Rot", "Index", "Middle", "Ring", "Pinky"];
const TOUCH_LABELS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
const PALETTE = [
  "#5b9dff", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#22d3ee",
];

const WINDOWS = [2, 4, 8, 12];

export function Scope() {
  const model = useStore((s) => s.model);
  const setFinger = useStore((s) => s.send); // we send set_finger via raw send
  const prefs = useScopePrefs();

  const [paused, setPaused] = useState(false);
  const [cursors, setCursors] = useState(false);
  const [liveCount, setLiveCount] = useState(0); // throttled, just for footer

  // Cursor positions in *relative ms*. null = not placed yet.
  const cursorA = useRef<number | null>(null);
  const cursorB = useRef<number | null>(null);
  const dragging = useRef<null | "a" | "b">(null);

  // readout produced by the draw loop, surfaced to React at ~10 Hz
  const [readout, setReadout] = useState<Readout | null>(null);
  const [compass, setCompass] = useState<{ dir: number; mag: number }[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // keep the draw loop reading fresh prefs without restarting rAF
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const cursorsRef = useRef(cursors);
  cursorsRef.current = cursors;

  useEffect(() => attachScope(), []);
  useEffect(() => setCapturePaused(paused), [paused]);

  /* ── Draw loop (decoupled from React) ───────────────────────────────────── */
  useEffect(() => {
    let raf = 0;
    let lastReadout = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;

      const cssW = wrap.clientWidth;
      const cssH = wrap.clientHeight;
      if (cssW < 2 || cssH < 2) return;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const samples = readSamples();
      const win = prefsRef.current.windowS * 1000;
      // Anchor right edge to "now" unless paused (then to the latest sample).
      const tEnd = paused ? (samples.length ? samples[samples.length - 1].t : 0) : nowRel();
      const tStart = tEnd - win;

      const lanes = activeLanes(prefsRef.current.visible);
      drawChart(ctx, cssW, cssH, samples, lanes, tStart, tEnd);

      // cursors
      if (cursorsRef.current) {
        drawCursors(ctx, cssW, cssH, tStart, tEnd, cursorA.current, cursorB.current);
      }
      // step marker
      const m = getMarker();
      if (m != null && m >= tStart && m <= tEnd) {
        const x = ((m - tStart) / win) * cssW;
        ctx.strokeStyle = "rgba(251,191,36,0.7)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const t = performance.now();
      if (t - lastReadout > 90) {
        lastReadout = t;
        setLiveCount(sampleCount());
        // compass from latest sample (tangential dir + magnitude)
        const last = samples[samples.length - 1];
        if (last) {
          setCompass(
            last.direction.map((d, i) => ({ dir: d, mag: last.tangential[i] })),
          );
        }
        if (cursorsRef.current && cursorA.current != null) {
          setReadout(buildReadout(samples, lanes, cursorA.current, cursorB.current));
        } else if (!cursorsRef.current && readoutNonNull.current) {
          setReadout(null);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  // tiny ref to avoid spamming setReadout(null)
  const readoutNonNull = useRef(false);
  readoutNonNull.current = readout != null;

  /* ── Cursor interaction ─────────────────────────────────────────────────── */
  const relAtX = (clientX: number): number => {
    const wrap = wrapRef.current!;
    const r = wrap.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const win = prefs.windowS * 1000;
    let tEnd = nowRel();
    if (paused) {
      const arr = readSamples();
      tEnd = arr.length ? arr[arr.length - 1].t : 0;
    }
    return tEnd - win + frac * win;
  };

  const onCanvasDown = (e: React.MouseEvent) => {
    if (!cursors) return;
    const t = relAtX(e.clientX);
    // pick the nearest existing cursor to drag, else set A then B
    if (cursorA.current == null) {
      cursorA.current = t;
    } else if (cursorB.current == null) {
      cursorB.current = t;
    } else {
      const da = Math.abs(t - cursorA.current);
      const db = Math.abs(t - cursorB.current);
      dragging.current = da <= db ? "a" : "b";
      if (dragging.current === "a") cursorA.current = t;
      else cursorB.current = t;
    }
  };
  const onCanvasMove = (e: React.MouseEvent) => {
    if (!cursors || !dragging.current) return;
    const t = relAtX(e.clientX);
    if (dragging.current === "a") cursorA.current = t;
    else cursorB.current = t;
  };
  const endDrag = () => { dragging.current = null; };

  const resetCursors = () => {
    cursorA.current = null;
    cursorB.current = null;
    setReadout(null);
  };

  /* ── Step response ──────────────────────────────────────────────────────── */
  const [stepFinger, setStepFinger] = useState(2); // index by default
  const [stepValue, setStepValue] = useState(700);
  const doStep = () => {
    setMarker(nowRel());
    setFinger({ type: "set_finger", index: stepFinger, value: stepValue });
  };

  /* ── Export ─────────────────────────────────────────────────────────────── */
  const exportData = (kind: "csv" | "json") => {
    const samples = readSamples();
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    if (kind === "csv") {
      downloadFile(`scope_${stamp}.csv`, scopeToCSV(samples), "text/csv");
    } else {
      downloadFile(`scope_${stamp}.json`, scopeToJSON(samples), "application/json");
    }
  };

  const fingerOpts = useMemo(
    () => (model?.fingers ?? FINGER_LABELS.map((label, i) => ({ key: String(i), label }))),
    [model],
  );

  if (!model) return null;

  const dt =
    readout && readout.tB != null && readout.tA != null
      ? Math.abs(readout.tB - readout.tA)
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden p-7">
      {/* Top controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant={paused ? "primary" : "secondary"}
            size="sm"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
            {paused ? "Resume" : "Freeze"}
          </Button>
          <Button
            variant={cursors ? "primary" : "secondary"}
            size="sm"
            onClick={() => { setCursors((c) => !c); if (cursors) resetCursors(); }}
          >
            <Crosshair size={15} /> Cursors
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { clearScope(); resetCursors(); }}>
            <Trash2 size={15} /> Clear
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* zoom / time window */}
          <div className="inline-flex items-center gap-1 rounded-xl bg-surface-2 p-1">
            <Gauge size={13} className="ml-1.5 text-text-faint" />
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => prefs.setWindowS(w)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors",
                  prefs.windowS === w ? "bg-surface-3 text-text shadow-card" : "text-text-dim hover:text-text",
                )}
              >
                {w}s
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => exportData("csv")}>
            <Download size={15} /> CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportData("json")}>
            JSON
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Chart ──────────────────────────────────────────────────────── */}
        <Card className="flex min-h-0 flex-col p-3">
          <div
            ref={wrapRef}
            className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-bg/50"
          >
            <canvas
              ref={canvasRef}
              className={cn("absolute inset-0 h-full w-full", cursors ? "cursor-col-resize" : "cursor-default")}
              onMouseDown={onCanvasDown}
              onMouseMove={onCanvasMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
            />
            {liveCount === 0 && (
              <div className="absolute inset-0 grid place-items-center text-[13px] text-text-faint">
                Waiting for frames…
              </div>
            )}
          </div>
        </Card>

        {/* ── Side panel ─────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
          {/* Channel groups */}
          <Card>
            <SectionLabel>Channels</SectionLabel>
            <div className="mt-3 flex flex-col gap-1.5">
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => prefs.toggleGroup(g.key)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors",
                    prefs.visible[g.key]
                      ? "border-line/20 bg-surface-2 text-text"
                      : "border-line/10 bg-surface text-text-faint hover:text-text-dim",
                  )}
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full transition-opacity",
                      prefs.visible[g.key] ? "opacity-100" : "opacity-25",
                    )}
                    style={{ background: groupSwatch(g.key) }}
                  />
                  <span className="flex-1 font-medium">{g.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-text-faint">
                    {g.unit}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {/* Step response */}
          <Card>
            <SectionLabel>Step response</SectionLabel>
            <p className="mt-2 text-[12px] leading-relaxed text-text-dim">
              Command a finger and drop a marker to measure rise time against the position trace.
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              <select
                value={stepFinger}
                onChange={(e) => setStepFinger(Number(e.target.value))}
                className="focus-ring rounded-xl border border-line/10 bg-surface-2 px-3 py-2 text-[13px] outline-none"
              >
                {fingerOpts.map((f, i) => (
                  <option key={i} value={i}>{f.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={1000} value={stepValue}
                  onChange={(e) => setStepValue(Number(e.target.value))}
                  className="slider flex-1"
                  style={{ ["--pct" as string]: `${(stepValue / 1000) * 100}%` }}
                />
                <span className="w-[42px] text-right text-[12px] tnum text-text-faint">{stepValue}</span>
              </div>
              <Button variant="primary" size="md" onClick={doStep}>
                <Zap size={15} /> Step &amp; mark
              </Button>
            </div>
          </Card>

          {/* Cursor readout */}
          {cursors && (
            <Card>
              <SectionLabel>Cursor</SectionLabel>
              {readout ? (
                <div className="mt-3 space-y-2.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-text-dim">Δt</span>
                    <span className="tnum font-medium">
                      {dt != null ? `${dt.toFixed(0)} ms` : "place B"}
                    </span>
                  </div>
                  <div className="border-t border-line/10 pt-2 space-y-1">
                    {readout.rows.map((r) => (
                      <div key={r.label} className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-text-dim">
                          <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                          {r.label}
                        </span>
                        <span className="tnum">
                          {r.a}
                          {r.b != null && <span className="text-text-faint"> · {r.b}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-text-faint">
                  Click the chart to place cursor A, then B. Drag to move.
                </p>
              )}
            </Card>
          )}

          {/* Slip compass */}
          <Card>
            <SectionLabel>Slip direction</SectionLabel>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {TOUCH_LABELS.map((lbl, i) => (
                <Compass key={lbl} label={lbl} dir={compass[i]?.dir ?? 0} mag={compass[i]?.mag ?? 0} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-text-faint">
        <span className="tnum">{liveCount} samples buffered</span>
        <span>{paused ? "Frozen" : "Live"} · {prefs.windowS}s window</span>
      </div>
    </div>
  );
}

/* ── Lane / channel resolution ──────────────────────────────────────────────
 * Each visible group becomes a horizontal lane. Within a lane we draw one line
 * per channel, normalized to the lane's value band. */
interface Channel {
  label: string;
  color: string;
  /** pull the value for finger/touch index `i` from a sample */
  get: (s: ScopeSample, i: number) => number;
  /** number of channels */
  n: number;
}
interface Lane {
  key: GroupKey;
  label: string;
  channels: Channel[];
  min: number;
  max: number;
  /** y formatting for cursor readout */
  fmt: (v: number) => string;
}

function activeLanes(visible: Record<GroupKey, boolean>): Lane[] {
  const lanes: Lane[] = [];
  if (visible.positions) {
    lanes.push(posLane("positions", "Positions", (s, i) => s.positions[i] ?? 0));
  }
  if (visible.targets) {
    lanes.push(posLane("targets", "Targets", (s, i) => s.targets[i] ?? 0));
  }
  if (visible.error) {
    lanes.push({
      key: "error",
      label: "Pos error",
      min: -1000,
      max: 1000,
      fmt: (v) => v.toFixed(0),
      channels: FINGER_LABELS.map((label, i) => ({
        label,
        color: PALETTE[i % PALETTE.length],
        n: 6,
        get: (s) => (s.targets[i] ?? 0) - (s.positions[i] ?? 0),
      })),
    });
  }
  if (visible.normal) lanes.push(forceLane("normal", "Normal force", (s, i) => s.normal[i] ?? 0));
  if (visible.tangential) lanes.push(forceLane("tangential", "Tangential", (s, i) => s.tangential[i] ?? 0));
  if (visible.proximity) {
    lanes.push({
      key: "proximity",
      label: "Proximity",
      min: 0,
      max: 1000,
      fmt: (v) => v.toFixed(0),
      channels: TOUCH_LABELS.map((label, i) => ({
        label,
        color: PALETTE[i % PALETTE.length],
        n: 5,
        get: (s) => s.proximity[i] ?? 0,
      })),
    });
  }
  return lanes;
}

function posLane(key: GroupKey, label: string, get: (s: ScopeSample, i: number) => number): Lane {
  return {
    key, label, min: 0, max: 1000, fmt: (v) => v.toFixed(0),
    channels: FINGER_LABELS.map((l, i) => ({
      label: l, color: PALETTE[i % PALETTE.length], n: 6, get,
    })),
  };
}
function forceLane(key: GroupKey, label: string, get: (s: ScopeSample, i: number) => number): Lane {
  return {
    key, label, min: 0, max: 2000, fmt: (v) => v.toFixed(0),
    channels: TOUCH_LABELS.map((l, i) => ({
      label: l, color: PALETTE[i % PALETTE.length], n: 5, get,
    })),
  };
}

/* ── Canvas drawing ─────────────────────────────────────────────────────── */
function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  samples: ScopeSample[],
  lanes: Lane[],
  tStart: number, tEnd: number,
) {
  const padL = 6;
  if (lanes.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Enable a channel group to view signals", w / 2, h / 2);
    ctx.textAlign = "left";
    return;
  }
  const span = tEnd - tStart || 1;
  const gap = 8;
  const laneH = (h - gap * (lanes.length - 1)) / lanes.length;

  lanes.forEach((lane, li) => {
    const y0 = li * (laneH + gap);
    const y1 = y0 + laneH;

    // lane background + baseline grid
    ctx.fillStyle = "rgba(255,255,255,0.018)";
    ctx.fillRect(0, y0, w, laneH);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 2; g++) {
      const gy = y0 + (laneH * g) / 2;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }
    // zero line for error lane
    if (lane.min < 0) {
      const zy = y1 - ((0 - lane.min) / (lane.max - lane.min)) * laneH;
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.moveTo(padL, zy);
      ctx.lineTo(w, zy);
      ctx.stroke();
    }

    // label
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(lane.label.toUpperCase(), padL + 2, y0 + 13);

    // channels
    const range = lane.max - lane.min || 1;
    const yOf = (v: number) => y1 - ((v - lane.min) / range) * laneH;
    const xOf = (t: number) => padL + ((t - tStart) / span) * (w - padL);

    for (let ch = 0; ch < lane.channels.length; ch++) {
      const c = lane.channels[ch];
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let s = 0; s < samples.length; s++) {
        const smp = samples[s];
        if (smp.t < tStart || smp.t > tEnd) continue;
        const x = xOf(smp.t);
        const y = clamp(yOf(c.get(smp, ch)), y0, y1);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

function drawCursors(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  tStart: number, tEnd: number, a: number | null, b: number | null,
) {
  const span = tEnd - tStart || 1;
  const line = (t: number, label: string, color: string) => {
    const x = ((t - tStart) / span) * w;
    if (x < 0 || x > w) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(label, Math.min(x + 3, w - 10), 11);
  };
  if (a != null) line(a, "A", "rgba(91,157,255,0.9)");
  if (b != null) line(b, "B", "rgba(52,211,153,0.9)");
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ── Cursor readout (sampled values at A/B) ─────────────────────────────── */
interface Readout {
  tA: number | null;
  tB: number | null;
  rows: { label: string; color: string; a: string; b: string | null }[];
}
function sampleAt(samples: ScopeSample[], t: number): ScopeSample | null {
  if (samples.length === 0) return null;
  // nearest by time
  let best = samples[0];
  let bestD = Math.abs(best.t - t);
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(samples[i].t - t);
    if (d < bestD) { bestD = d; best = samples[i]; }
  }
  return best;
}
function buildReadout(samples: ScopeSample[], lanes: Lane[], a: number, b: number | null): Readout {
  const sa = sampleAt(samples, a);
  const sb = b != null ? sampleAt(samples, b) : null;
  const rows: Readout["rows"] = [];
  for (const lane of lanes) {
    lane.channels.forEach((c, i) => {
      rows.push({
        label: `${lane.label.split(" ")[0]} ${c.label.split(" ")[0]}`,
        color: c.color,
        a: sa ? lane.fmt(c.get(sa, i)) : "–",
        b: sb ? lane.fmt(c.get(sb, i)) : null,
      });
    });
  }
  return { tA: a, tB: b, rows: rows.slice(0, 12) };
}

/* ── Slip compass ───────────────────────────────────────────────────────── */
function Compass({ label, dir, mag }: { label: string; dir: number; mag: number }) {
  const active = mag > 1;
  // dir is radians; magnitude scaled to needle length
  const len = Math.min(1, mag / 800);
  const cx = 18, cy = 18, r = 14;
  const x = cx + Math.cos(dir) * r * (0.4 + 0.6 * len);
  const y = cy + Math.sin(dir) * r * (0.4 + 0.6 * len);
  const color = active ? "var(--accent)" : "var(--text-faint)";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--line)/0.25)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="1.5" fill={`rgb(${color})`} />
        {active && (
          <line
            x1={cx} y1={cy} x2={x} y2={y}
            stroke={`rgb(${color})`} strokeWidth="1.8" strokeLinecap="round"
          />
        )}
      </svg>
      <span className="text-[9px] text-text-faint">{label.slice(0, 2)}</span>
    </div>
  );
}

function groupSwatch(key: GroupKey): string {
  switch (key) {
    case "positions": return PALETTE[0];
    case "targets": return PALETTE[1];
    case "error": return PALETTE[3];
    case "normal": return PALETTE[2];
    case "tangential": return PALETTE[4];
    case "proximity": return PALETTE[5];
  }
}
