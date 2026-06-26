import { useEffect, useRef, useState } from "react";
import {
  Play, Square, Trash2, Download, Plus, Copy, Check, Circle,
  Brain, Repeat,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  useDevStore, classifyFeatures, type SeqStep, type Sequence,
} from "@/lib/devStore";
import { pca2d } from "@/lib/pca";
import { runUserCode, type RunHandle } from "@/lib/codeRunner";
import { downloadFile, framesToCSV, uid } from "@/lib/download";
import { Button } from "@/components/ui/Button";
import { SubNav } from "@/components/ui/SubNav";
import { SectionLabel, Card, EmptyState } from "@/components/ui/Section";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "code", label: "Code" },
  { key: "data", label: "Data" },
  { key: "classifier", label: "Classifier" },
  { key: "sequencer", label: "Sequencer" },
  { key: "api", label: "API" },
];

const LABEL_COLORS = ["var(--accent)", "var(--amber)", "var(--green)", "var(--red)", "#a78bfa", "#f472b6"];

export function Develop() {
  const [tab, setTab] = useState("code");
  const { model } = useStore();
  if (!model) return null;
  return (
    <div className="flex h-full flex-col overflow-hidden p-7">
      <div className="mb-5">
        <SubNav items={TABS} active={tab} onChange={setTab} layoutId="dev-subnav" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "code" && <CodePanel />}
        {tab === "data" && <DataPanel fingers={model.fingers.map((f) => f.key)} />}
        {tab === "classifier" && <ClassifierPanel />}
        {tab === "sequencer" && <SequencerPanel poses={Object.keys(model.poses)} />}
        {tab === "api" && <ApiPanel />}
      </div>
    </div>
  );
}

/* ── Code runner ────────────────────────────────────────────────────────── */
function CodePanel() {
  const { code, setCode } = useDevStore();
  const { sendPose, setPositions } = useStore();
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const handle = useRef<RunHandle | null>(null);

  const run = () => {
    setLines([]);
    setRunning(true);
    const h = runUserCode(code, {
      pose: (n) => sendPose(n),
      move: (p) => setPositions(p),
      state: () => useStore.getState().frame,
      onLog: (line) => setLines((l) => [...l, line]),
    });
    handle.current = h;
    h.promise.finally(() => setRunning(false));
  };
  const stop = () => handle.current?.cancel();

  return (
    <div className="grid h-full grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card className="flex flex-col">
        <div className="flex items-center justify-between">
          <SectionLabel>Script</SectionLabel>
          <div className="flex gap-2">
            {running ? (
              <Button size="sm" variant="danger" onClick={stop}><Square size={13} /> Stop</Button>
            ) : (
              <Button size="sm" variant="primary" onClick={run}><Play size={13} /> Run</Button>
            )}
          </div>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="focus-ring mt-3 min-h-[300px] flex-1 resize-none rounded-xl border border-line/10 bg-bg/60 p-4 font-mono text-[13px] leading-relaxed text-text outline-none"
        />
      </Card>
      <Card className="flex flex-col">
        <SectionLabel>Output</SectionLabel>
        <div className="mt-3 flex-1 overflow-y-auto rounded-xl bg-bg/60 p-4 font-mono text-[12px] leading-relaxed">
          {lines.length === 0 ? (
            <span className="text-text-faint">// run the script to see output</span>
          ) : (
            lines.map((l, i) => (
              <div key={i} className={cn(l.startsWith("✗") && "text-red", l.startsWith("✓") && "text-green")}>
                {l}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

/* ── Data recorder + export ─────────────────────────────────────────────── */
interface Frame { t: number; pos: number[]; force: number[] }
function DataPanel({ fingers }: { fingers: string[] }) {
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const buffer = useRef<Frame[]>([]);
  const startTs = useRef(0);
  const lastTs = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const f = useStore.getState().frame;
      if (!f || f.ts === lastTs.current) return;
      lastTs.current = f.ts;
      buffer.current.push({
        t: f.ts - startTs.current,
        pos: f.positions,
        force: f.touch.map((s) => s.normal),
      });
      setCount(buffer.current.length);
    }, 40);
    return () => clearInterval(id);
  }, [recording]);

  const toggle = () => {
    if (recording) { setRecording(false); return; }
    buffer.current = [];
    setCount(0);
    startTs.current = useStore.getState().frame?.ts ?? 0;
    lastTs.current = 0;
    setRecording(true);
  };

  const dur = buffer.current.length ? (buffer.current[buffer.current.length - 1].t / 1000).toFixed(1) : "0.0";
  const kb = Math.round(JSON.stringify(buffer.current).length / 1024);

  const exportJSON = () => downloadFile(`studio_capture_${Date.now()}.json`, JSON.stringify(buffer.current, null, 2));
  const exportCSV = () =>
    downloadFile(
      `studio_capture_${Date.now()}.csv`,
      framesToCSV(
        buffer.current.map((f) => ({ t: f.t, pos: [...f.pos, ...f.force] })),
        [...fingers, "f_thumb", "f_index", "f_middle", "f_ring", "f_pinky"],
      ),
      "text/csv",
    );

  return (
    <div className="mx-auto max-w-[760px]">
      <Card>
        <SectionLabel>Capture stream</SectionLabel>
        <p className="mt-2 text-[13px] text-text-dim">
          Record live positions and fingertip forces, then export for analysis.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[["Frames", count], ["Duration", `${dur}s`], ["Size", `${kb} KB`]].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="text-[22px] font-semibold tnum">{v}</div>
              <div className="text-[11px] text-text-faint">{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant={recording ? "danger" : "primary"} className="flex-1" onClick={toggle}>
            {recording ? <Square size={15} /> : <Circle size={15} />}
            {recording ? "Stop capture" : "Start capture"}
          </Button>
          <Button variant="secondary" disabled={!count} onClick={exportJSON}><Download size={15} /> JSON</Button>
          <Button variant="secondary" disabled={!count} onClick={exportCSV}><Download size={15} /> CSV</Button>
        </div>
      </Card>
    </div>
  );
}

/* ── Classifier (k-NN + PCA) ────────────────────────────────────────────── */
function feature(): number[] {
  const f = useStore.getState().frame;
  if (!f) return [];
  return [...f.positions, ...f.touch.slice(0, 5).map((s) => s.normal)];
}

function ClassifierPanel() {
  const { samples, addSample, clearSamples, k, setK } = useDevStore();
  const [label, setLabel] = useState("");
  const [pred, setPred] = useState<{ label: string; confidence: number } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (samples.length) setPred(classifyFeatures(feature(), samples, k));
    }, 150);
    return () => clearInterval(id);
  }, [samples, k]);

  const counts: Record<string, number> = {};
  samples.forEach((s) => (counts[s.label] = (counts[s.label] ?? 0) + 1));
  const labels = Object.keys(counts);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-5">
        <Card>
          <SectionLabel>Live prediction</SectionLabel>
          <div className="mt-3 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent">
              <Brain size={24} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[22px] font-semibold">{pred ? pred.label : samples.length ? "—" : "Untrained"}</div>
              <div className="text-[12px] text-text-faint">
                {pred ? `${Math.round(pred.confidence * 100)}% · k=${k}` : "Capture labeled samples below."}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[12px] text-text-dim">
            Neighbors (k)
            <input type="number" min={1} max={15} value={k} onChange={(e) => setK(Math.max(1, Number(e.target.value)))}
              className="w-16 rounded-lg border border-line/10 bg-surface-2 px-2 py-1 text-center tnum outline-none focus-ring" />
          </div>
        </Card>
        <Card>
          <SectionLabel>Capture samples</SectionLabel>
          <div className="mt-3 flex gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. grasp"
              className="focus-ring flex-1 rounded-xl border border-line/10 bg-surface-2 px-3 py-2 text-[13px] outline-none" />
            <Button variant="primary" disabled={!label.trim()} onClick={() => addSample({ label: label.trim(), features: feature() })}>
              Capture
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {labels.length === 0 && <EmptyState>No samples yet.</EmptyState>}
            {labels.map((l, i) => (
              <div key={l} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface-2 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${LABEL_COLORS[i % LABEL_COLORS.length]})` }} />
                <span className="flex-1 text-[13px] font-medium">{l}</span>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-dim">{counts[l]}</span>
                <button onClick={() => clearSamples(l)} className="text-text-faint hover:text-text"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="flex flex-col">
        <div className="flex items-center justify-between">
          <SectionLabel>Feature space (PCA)</SectionLabel>
          {samples.length > 0 && (
            <button onClick={() => clearSamples()} className="text-[12px] text-text-faint hover:text-text">Clear all</button>
          )}
        </div>
        <PCAScatter samples={samples} labels={labels} />
      </Card>
    </div>
  );
}

function PCAScatter({ samples, labels }: { samples: { label: string; features: number[] }[]; labels: string[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = (canvas.width = canvas.clientWidth * 2);
    const h = (canvas.height = canvas.clientHeight * 2);
    ctx.clearRect(0, 0, w, h);
    if (samples.length < 2) return;
    const { points } = pca2d(samples.map((s) => s.features));
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 40;
    const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (w - 2 * pad);
    const sy = (y: number) => pad + ((y - minY) / (maxY - minY || 1)) * (h - 2 * pad);
    points.forEach((p, i) => {
      const li = labels.indexOf(samples[i].label);
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 7, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${LABEL_COLORS[li % LABEL_COLORS.length]})`;
      ctx.globalAlpha = 0.85;
      ctx.fill();
    });
  }, [samples, labels]);
  return (
    <div className="mt-3 flex-1">
      {samples.length < 2 ? (
        <EmptyState>Capture at least two samples to see the projection.</EmptyState>
      ) : (
        <canvas ref={ref} className="h-[300px] w-full rounded-xl bg-bg/50" />
      )}
    </div>
  );
}

/* ── Sequencer ──────────────────────────────────────────────────────────── */
function SequencerPanel({ poses }: { poses: string[] }) {
  const { sequences, addSequence, deleteSequence } = useDevStore();
  const { sendPose } = useStore();
  const [steps, setSteps] = useState<SeqStep[]>([
    { id: uid("s"), pose: "open", hold: 600 },
    { id: uid("s"), pose: "fist", hold: 800 },
  ]);
  const [name, setName] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const play = (seq: SeqStep[], id: string) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(id);
    let t = 0;
    seq.forEach((s) => {
      timers.current.push(window.setTimeout(() => sendPose(s.pose), t));
      t += s.hold;
    });
    timers.current.push(window.setTimeout(() => setPlaying(null), t + 100));
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <div className="flex items-center justify-between">
          <SectionLabel>Build a sequence</SectionLabel>
          <Button size="sm" variant="primary" onClick={() => play(steps, "draft")}>
            <Play size={13} /> Play
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface-2 px-3 py-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-3 text-[11px] tnum text-text-dim">{i + 1}</span>
              <select value={s.pose} onChange={(e) => setSteps((st) => st.map((x) => x.id === s.id ? { ...x, pose: e.target.value } : x))}
                className="rounded-lg border border-line/10 bg-bg/60 px-2 py-1.5 text-[13px] outline-none focus-ring">
                {poses.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-1.5 text-[12px] text-text-faint">
                <input type="number" min={100} step={100} value={s.hold}
                  onChange={(e) => setSteps((st) => st.map((x) => x.id === s.id ? { ...x, hold: Number(e.target.value) } : x))}
                  className="w-20 rounded-lg border border-line/10 bg-bg/60 px-2 py-1 text-right tnum outline-none focus-ring" />
                ms
              </div>
              <button onClick={() => setSteps((st) => st.filter((x) => x.id !== s.id))} className="text-text-faint hover:text-red"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setSteps((st) => [...st, { id: uid("s"), pose: poses[0], hold: 600 }])}
          className="mt-2 flex items-center gap-1.5 text-[13px] text-accent hover:underline">
          <Plus size={14} /> Add step
        </button>
        <div className="mt-4 flex gap-2 border-t border-line/10 pt-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sequence name"
            className="focus-ring flex-1 rounded-xl border border-line/10 bg-surface-2 px-3 py-2 text-[13px] outline-none" />
          <Button variant="secondary" disabled={!name.trim() || !steps.length}
            onClick={() => { addSequence({ id: uid("seq"), name: name.trim(), steps }); setName(""); }}>
            Save
          </Button>
        </div>
      </Card>
      <Card>
        <SectionLabel>Saved sequences</SectionLabel>
        <div className="mt-3 flex flex-col gap-2">
          {sequences.length === 0 && <EmptyState>Build and save a sequence to reuse it.</EmptyState>}
          {sequences.map((seq: Sequence) => (
            <div key={seq.id} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface-2 px-3 py-2.5">
              <Repeat size={15} className="text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{seq.name}</div>
                <div className="text-[11px] text-text-faint">{seq.steps.length} steps</div>
              </div>
              <button onClick={() => play(seq.steps, seq.id)} className={cn("grid h-8 w-8 place-items-center rounded-lg",
                playing === seq.id ? "bg-accent/15 text-accent" : "text-text-faint hover:bg-surface-3 hover:text-text")}>
                <Play size={15} />
              </button>
              <button onClick={() => deleteSequence(seq.id)} className="grid h-8 w-8 place-items-center rounded-lg text-text-faint hover:bg-surface-3 hover:text-text">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── API ────────────────────────────────────────────────────────────────── */
function ApiPanel() {
  const py = `import asyncio, json, aiohttp

async def main():
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect("ws://127.0.0.1:8765/ws") as ws:
            await ws.send_str(json.dumps({"type": "pose", "name": "fist"}))
            async for msg in ws:
                data = json.loads(msg.data)
                if data.get("type") == "state":
                    print(data["positions"], [t["normal"] for t in data["touch"]])

asyncio.run(main())`;
  const js = `const ws = new WebSocket("ws://127.0.0.1:8765/ws");
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === "state") console.log(m.positions);
};
ws.onopen = () => ws.send(JSON.stringify({ type: "pose", name: "open" }));`;

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5">
      <Card>
        <SectionLabel>Local engine</SectionLabel>
        <p className="mt-2 text-[13px] text-text-dim">
          The UI and your code share one local WebSocket. No cloud, no account.
        </p>
        <CopyRow value="ws://127.0.0.1:8765/ws" />
      </Card>
      <Snippet title="Python" code={py} />
      <Snippet title="JavaScript" code={js} />
      <Card>
        <SectionLabel>Messages</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
          {[
            ["→ pose", "{type:'pose', name}"],
            ["→ set_positions", "{type, positions:[6]}"],
            ["→ set_finger", "{type, index, value}"],
            ["→ demo", "{type:'demo'}"],
            ["← state", "positions, targets, touch[5], ts"],
            ["← connection", "status, detail"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
              <span className="font-mono text-accent">{k}</span>
              <span className="font-mono text-text-faint">{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionLabel>{title}</SectionLabel>
        <CopyButton value={code} />
      </div>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-bg/60 p-4 font-mono text-[12px] leading-relaxed text-text-dim">{code}</pre>
    </Card>
  );
}

function CopyRow({ value }: { value: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
      <span className="flex-1 font-mono text-[13px] text-text">{value}</span>
      <CopyButton value={value} />
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-2.5 py-1.5 text-[12px] text-text-dim transition-colors hover:text-text"
    >
      {done ? <Check size={13} className="text-green" /> : <Copy size={13} />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}
