import { useCallback, useEffect, useRef, useState } from "react";
import {
  Video, VideoOff, Hand, Circle, Square, Play, Trash2, Download,
  Crosshair, Check, ShieldAlert, Camera as CameraIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  useCameraStore, applyCalibration, classify,
  type Recording, type Calibration,
} from "@/lib/cameraStore";
import { useHandCamera, type CameraStatus } from "@/hooks/useHandCamera";
import { HandSmoother } from "@/lib/handTracking";
import { HandVisual } from "@/components/HandVisual";
import { Button } from "@/components/ui/Button";
import { SubNav } from "@/components/ui/SubNav";
import { SectionLabel, Card, EmptyState } from "@/components/ui/Section";
import { downloadFile, framesToCSV, uid } from "@/lib/download";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "mirror", label: "Mirror" },
  { key: "record", label: "Record" },
  { key: "gestures", label: "Gestures" },
  { key: "calibrate", label: "Calibrate" },
];

export function Camera() {
  const { model, setPositions, touch } = useStore();
  const cam = useCameraStore();
  const [tab, setTab] = useState("mirror");

  // live frame plumbing (refs so the frame callback stays stable)
  const smoother = useRef(new HandSmoother(cam.alpha));
  const liveRef = useRef<number[]>([0, 0, 0, 0, 0, 0]);
  const mirroringRef = useRef(false);
  const recRef = useRef<{ t: number; pos: number[] }[] | null>(null);
  const recStart = useRef(0);
  const gesturesRef = useRef(cam.gestures);
  const calRef = useRef<Calibration | null>(cam.calibration);
  const uiClock = useRef(0);
  // mirror send rate-limit: at most ~30 Hz, and only on meaningful change, so we
  // never flood the serial link faster than the hand can move.
  const lastSent = useRef<number[] | null>(null);
  const lastSendT = useRef(0);

  const [mirroring, setMirroring] = useState(false);
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [prediction, setPrediction] = useState<{ label: string; confidence: number } | null>(null);

  useEffect(() => { smoother.current.setResponsiveness(cam.alpha); }, [cam.alpha]);
  useEffect(() => { gesturesRef.current = cam.gestures; }, [cam.gestures]);
  useEffect(() => { calRef.current = cam.calibration; }, [cam.calibration]);

  const onFrame = useCallback(({ positions }: { positions: number[] }) => {
    const sm = smoother.current.update(positions);
    liveRef.current = sm;

    if (mirroringRef.current) {
      const out = applyCalibration(sm, calRef.current);
      const now = performance.now();
      const prev = lastSent.current;
      const changed = !prev || out.some((v, i) => Math.abs(v - prev[i]) > 6);
      if (changed && now - lastSendT.current > 33) {
        setPositions(out);
        lastSent.current = out;
        lastSendT.current = now;
      }
    }

    if (recRef.current) recRef.current.push({ t: performance.now() - recStart.current, pos: sm });

    const now = performance.now();
    if (now - uiClock.current > 66) {
      uiClock.current = now;
      setLive(sm);
      if (gesturesRef.current.length) setPrediction(classify(sm, gesturesRef.current, 3));
    }
  }, [setPositions]);

  const handCam = useHandCamera(onFrame);

  const toggleMirror = () => {
    const next = !mirroring;
    setMirroring(next);
    mirroringRef.current = next;
    if (!next) setPositions([0, 0, 0, 0, 0, 0]);
  };

  const startRecording = () => {
    recRef.current = [];
    recStart.current = performance.now();
    setRecording(true);
  };
  const stopRecording = () => {
    const frames = recRef.current ?? [];
    recRef.current = null;
    setRecording(false);
    if (frames.length > 4) {
      const d = new Date();
      cam.addRecording({
        id: uid("rec"),
        name: `Recording ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`,
        ts: Date.now(),
        frames,
      });
    }
  };

  if (!model) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden p-7">
      <div className="mb-5 flex items-center justify-between">
        <SubNav items={TABS} active={tab} onChange={setTab} layoutId="camera-subnav" />
        {handCam.status === "live" && (
          <TrackPill tracked={handCam.tracked} />
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Stage handCam={handCam} />

        <div className="flex min-w-0 flex-col gap-5">
          {tab === "mirror" && (
            <MirrorPanel
              status={handCam.status}
              mirroring={mirroring}
              onToggleMirror={toggleMirror}
              alpha={cam.alpha}
              setAlpha={cam.setAlpha}
              live={live}
              touch={touch}
              model={model}
              calibrated={!!cam.calibration}
            />
          )}
          {tab === "record" && (
            <RecordPanel
              status={handCam.status}
              recording={recording}
              start={startRecording}
              stop={stopRecording}
              count={recRef.current?.length ?? 0}
              recordings={cam.recordings}
              onDelete={cam.deleteRecording}
              fingers={model.fingers.map((f) => f.key)}
            />
          )}
          {tab === "gestures" && (
            <GesturePanel
              status={handCam.status}
              prediction={prediction}
              gestures={cam.gestures}
              onCapture={(label: string) => cam.addGesture({ label, pos: liveRef.current })}
              onClear={cam.clearGestures}
              onSendPose={() => prediction && setPositions(liveRef.current)}
            />
          )}
          {tab === "calibrate" && (
            <CalibratePanel
              status={handCam.status}
              liveRef={liveRef}
              calibration={cam.calibration}
              setCalibration={cam.setCalibration}
              fingers={model.fingers.map((f) => f.label)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shared video stage ─────────────────────────────────────────────────── */
function Stage({ handCam }: { handCam: ReturnType<typeof useHandCamera> }) {
  const { videoRef, canvasRef, status, start } = handCam;
  return (
    <div className="card relative flex min-h-[320px] items-center justify-center overflow-hidden p-0">
      <div className="relative aspect-video w-full">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
          style={{ opacity: status === "live" ? 1 : 0 }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />
        {status !== "live" && <StageOverlay status={status} error={handCam.error} onStart={start} />}
      </div>
    </div>
  );
}

function StageOverlay({
  status, error, onStart,
}: { status: CameraStatus; error: string; onStart: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-surface/60">
      <div className="flex max-w-[320px] flex-col items-center text-center">
        {status === "denied" ? (
          <>
            <ShieldAlert size={30} className="mb-3 text-amber" />
            <p className="text-[14px] font-medium">Camera access blocked</p>
            <p className="mt-1 text-[13px] text-text-faint">
              Allow camera access in your system settings, then start again.
            </p>
          </>
        ) : status === "error" ? (
          <>
            <VideoOff size={30} className="mb-3 text-red" />
            <p className="text-[14px] font-medium">Camera unavailable</p>
            <p className="mt-1 text-[13px] text-text-faint">{error || "No camera was found."}</p>
          </>
        ) : (
          <>
            <CameraIcon size={30} className="mb-3 text-accent" />
            <p className="text-[14px] font-medium">Use your camera to drive the hand</p>
            <p className="mt-1 text-[13px] text-text-faint">
              Your video stays on this device. Hold your hand to the camera once it’s on.
            </p>
          </>
        )}
        <Button
          variant="primary"
          className="mt-5"
          onClick={onStart}
          disabled={status === "starting"}
        >
          <Video size={16} />
          {status === "starting" ? "Starting…" : status === "idle" ? "Start camera" : "Try again"}
        </Button>
      </div>
    </div>
  );
}

function TrackPill({ tracked }: { tracked: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
        tracked ? "bg-green/12 text-green" : "bg-surface-3/60 text-text-faint",
      )}
    >
      <Hand size={13} />
      {tracked ? "Hand tracked" : "Show your hand"}
    </div>
  );
}

/* ── Mirror ──────────────────────────────────────────────────────────────── */
function MirrorPanel({
  status, mirroring, onToggleMirror, alpha, setAlpha, live, touch, model, calibrated,
}: any) {
  const off = status !== "live";
  return (
    <>
      <Card>
        <SectionLabel>Live mirror</SectionLabel>
        <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
          When mirroring is on, the hand copies your movements in real time.
          {calibrated ? " Calibration is applied." : " Calibrate for a closer fit."}
        </p>
        <Button
          variant={mirroring ? "danger" : "primary"}
          size="lg"
          className="mt-4 w-full"
          disabled={off}
          onClick={onToggleMirror}
        >
          {mirroring ? <VideoOff size={18} /> : <Video size={18} />}
          {mirroring ? "Stop mirroring" : "Mirror to hand"}
        </Button>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-text-dim">Smoothing</span>
            <span className="tnum text-text-faint">{alpha.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0.1} max={1} step={0.05} value={alpha}
            onChange={(e) => setAlpha(Number(e.target.value))}
            className="slider w-full"
            style={{ ["--pct" as string]: `${((alpha - 0.1) / 0.9) * 100}%` }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-text-faint">
            <span>Smoother</span><span>More responsive</span>
          </div>
        </div>
      </Card>
      <Card className="flex flex-col items-center">
        <SectionLabel className="self-start">What’s being sent</SectionLabel>
        <div className="h-[220px] w-full max-w-[260px]">
          <HandVisual positions={live} touch={touch} forceWarn={model.forceWarn} forceHigh={model.forceHigh} />
        </div>
      </Card>
    </>
  );
}

/* ── Record ──────────────────────────────────────────────────────────────── */
function RecordPanel({
  status, recording, start, stop, count, recordings, onDelete, fingers,
}: {
  status: CameraStatus; recording: boolean; start: () => void; stop: () => void;
  count: number; recordings: Recording[]; onDelete: (id: string) => void; fingers: string[];
}) {
  const { setPositions } = useStore();
  const [replaying, setReplaying] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const replay = (rec: Recording) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setReplaying(rec.id);
    rec.frames.forEach((f) => {
      timers.current.push(window.setTimeout(() => setPositions(f.pos), f.t));
    });
    const dur = rec.frames[rec.frames.length - 1]?.t ?? 0;
    timers.current.push(window.setTimeout(() => setReplaying(null), dur + 200));
  };

  return (
    <>
      <Card>
        <SectionLabel>Record a motion</SectionLabel>
        <p className="mt-2 text-[13px] text-text-dim">
          Capture your hand motion from the camera, then replay it on the device any time.
        </p>
        <Button
          variant={recording ? "danger" : "primary"}
          size="lg"
          className="mt-4 w-full"
          disabled={status !== "live"}
          onClick={recording ? stop : start}
        >
          {recording ? <Square size={16} /> : <Circle size={16} />}
          {recording ? `Stop · ${count} frames` : "Start recording"}
        </Button>
      </Card>
      <Card>
        <SectionLabel>Saved recordings</SectionLabel>
        <div className="mt-3 flex flex-col gap-2">
          {recordings.length === 0 && <EmptyState>No recordings yet.</EmptyState>}
          {recordings.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{r.name}</div>
                <div className="text-[11px] text-text-faint">
                  {r.frames.length} frames · {((r.frames[r.frames.length - 1]?.t ?? 0) / 1000).toFixed(1)}s
                </div>
              </div>
              <IconBtn title="Replay" active={replaying === r.id} onClick={() => replay(r)}>
                <Play size={15} />
              </IconBtn>
              <IconBtn
                title="Export CSV"
                onClick={() => downloadFile(`${r.name}.csv`, framesToCSV(r.frames, fingers), "text/csv")}
              >
                <Download size={15} />
              </IconBtn>
              <IconBtn title="Delete" onClick={() => onDelete(r.id)}>
                <Trash2 size={15} />
              </IconBtn>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ── Gestures ────────────────────────────────────────────────────────────── */
function GesturePanel({
  status, prediction, gestures, onCapture, onClear, onSendPose,
}: any) {
  const [label, setLabel] = useState("");
  const counts: Record<string, number> = {};
  for (const g of gestures) counts[g.label] = (counts[g.label] ?? 0) + 1;

  return (
    <>
      <Card>
        <SectionLabel>Live prediction</SectionLabel>
        <div className="mt-3 flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent">
            <Hand size={24} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[22px] font-semibold tracking-[-0.01em]">
              {prediction ? prediction.label : gestures.length ? "—" : "No gestures yet"}
            </div>
            <div className="text-[12px] text-text-faint">
              {prediction
                ? `${Math.round(prediction.confidence * 100)}% match`
                : "Capture a few labeled samples to start recognizing."}
            </div>
          </div>
        </div>
        <Button
          variant="secondary" size="sm" className="mt-3"
          disabled={!prediction}
          onClick={onSendPose}
        >
          Send current shape to hand
        </Button>
      </Card>
      <Card>
        <SectionLabel>Teach a gesture</SectionLabel>
        <div className="mt-3 flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label, e.g. grasp"
            className="focus-ring flex-1 rounded-xl border border-line/10 bg-surface-2 px-3 py-2 text-[13px] outline-none"
          />
          <Button
            variant="primary" size="md"
            disabled={status !== "live" || !label.trim()}
            onClick={() => onCapture(label.trim())}
          >
            Capture
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {Object.keys(counts).length === 0 && <EmptyState>No samples captured.</EmptyState>}
          {Object.entries(counts).map(([l, c]) => (
            <div key={l} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface-2 px-3 py-2">
              <span className="flex-1 text-[13px] font-medium">{l}</span>
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-dim">{c} samples</span>
              <IconBtn title="Remove" onClick={() => onClear(l)}>
                <Trash2 size={14} />
              </IconBtn>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ── Calibrate ──────────────────────────────────────────────────────────── */
function CalibratePanel({
  status, liveRef, calibration, setCalibration, fingers,
}: {
  status: CameraStatus;
  liveRef: React.MutableRefObject<number[]>;
  calibration: Calibration | null;
  setCalibration: (c: Calibration | null) => void;
  fingers: string[];
}) {
  const [draft, setDraft] = useState<{ min?: number[]; max?: number[] }>({});
  const live = status === "live";

  const capture = (which: "min" | "max") =>
    setDraft((d) => ({ ...d, [which]: [...liveRef.current] }));

  const save = () => {
    if (draft.min && draft.max) setCalibration({ min: draft.min, max: draft.max });
  };

  return (
    <>
      <Card>
        <SectionLabel>Calibrate your range</SectionLabel>
        <p className="mt-2 text-[13px] text-text-dim">
          Capture your hand fully open, then fully closed. We map that range to the device for a
          natural mirror.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          <CalStep
            n={1} title="Open your hand" done={!!draft.min}
            disabled={!live} onCapture={() => capture("min")}
          />
          <CalStep
            n={2} title="Make a fist" done={!!draft.max}
            disabled={!live} onCapture={() => capture("max")}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" className="flex-1" disabled={!draft.min || !draft.max} onClick={save}>
            <Check size={16} /> Save calibration
          </Button>
          {calibration && (
            <Button variant="ghost" onClick={() => { setCalibration(null); setDraft({}); }}>
              Reset
            </Button>
          )}
        </div>
      </Card>
      {calibration && (
        <Card>
          <SectionLabel>Current mapping</SectionLabel>
          <div className="mt-3 flex flex-col gap-2">
            {fingers.map((f, i) => (
              <div key={f} className="flex items-center gap-3 text-[12px]">
                <span className="w-[68px] text-text-dim">{f}</span>
                <span className="tnum text-text-faint">{calibration.min[i]}</span>
                <div className="h-1 flex-1 rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent/50" />
                </div>
                <span className="tnum text-text-faint">{calibration.max[i]}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function CalStep({
  n, title, done, disabled, onCapture,
}: { n: number; title: string; done: boolean; disabled: boolean; onCapture: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface-2 px-3 py-2.5">
      <div className={cn("grid h-7 w-7 place-items-center rounded-full text-[12px] font-semibold",
        done ? "bg-green/15 text-green" : "bg-surface-3 text-text-dim")}>
        {done ? <Check size={14} /> : n}
      </div>
      <span className="flex-1 text-[13px] font-medium">{title}</span>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={onCapture}>
        <Crosshair size={14} /> Capture
      </Button>
    </div>
  );
}

function IconBtn({
  children, title, active, onClick,
}: { children: React.ReactNode; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg transition-colors",
        active ? "bg-accent/15 text-accent" : "text-text-faint hover:bg-surface-3 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
