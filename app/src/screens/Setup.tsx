import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hand, Usb, Cpu, Check, ArrowRight, Sparkles, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { brand } from "@/brand.config";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const STEPS = ["Welcome", "Connect", "Ready"];

export function Setup() {
  const [step, setStep] = useState(0);
  const { connected, simulated, ports, listPorts, setPort, useSimulator, completeOnboarding } =
    useStore();

  useEffect(() => {
    if (step === 1) listPorts();
  }, [step, listPorts]);

  return (
    <div className="drag relative grid h-full place-items-center overflow-hidden p-8">
      <BackdropGlow />
      <div className="no-drag relative w-full max-w-[560px]">
        {/* progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step ? "w-7 bg-accent" : i < step ? "w-1.5 bg-accent/60" : "w-1.5 bg-surface-3",
                )}
              />
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && <Welcome onNext={() => setStep(1)} />}
            {step === 1 && (
              <Connect
                ports={ports}
                connected={connected}
                simulated={simulated}
                onPort={setPort}
                onSim={() => useSimulator(true)}
                onRefresh={listPorts}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && <Ready connected={connected} simulated={simulated} onDone={completeOnboarding} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-accent text-accent-ink shadow-glow">
        <Hand size={34} strokeWidth={2.2} />
      </div>
      <h2 className="text-[28px] font-semibold tracking-[-0.02em]">Welcome to {brand.product}</h2>
      <p className="mt-3 max-w-[420px] text-[15px] leading-relaxed text-text-dim">
        Your complete workspace for the <span className="text-text">{brand.device}</span>. Control it in
        real time, mirror your own hand with the camera, learn step by step, and build your own
        gestures and code.
      </p>
      <div className="mt-8 grid w-full grid-cols-3 gap-3">
        {[
          { icon: Hand, label: "Control" },
          { icon: Sparkles, label: "Learn" },
          { icon: Cpu, label: "Develop" },
        ].map((f) => (
          <div key={f.label} className="card flex flex-col items-center gap-2 py-4">
            <f.icon size={20} className="text-accent" />
            <span className="text-[13px] font-medium text-text-dim">{f.label}</span>
          </div>
        ))}
      </div>
      <Button size="lg" variant="primary" className="mt-8 w-full" onClick={onNext}>
        Get started <ArrowRight size={18} />
      </Button>
    </div>
  );
}

function Connect({
  ports,
  connected,
  simulated,
  onPort,
  onSim,
  onRefresh,
  onNext,
}: {
  ports: string[];
  connected: boolean;
  simulated: boolean;
  onPort: (p: string) => void;
  onSim: () => void;
  onRefresh: () => void;
  onNext: () => void;
}) {
  const ready = connected;
  return (
    <div className="flex flex-col">
      <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Connect your hand</h2>
      <p className="mt-2 text-[14px] text-text-dim">
        Plug the {brand.device} into a USB port. We’ll find it automatically — or explore everything in
        Simulator first.
      </p>

      <div className="card mt-6 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-faint">
            Detected ports
          </span>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-[12px] text-text-dim transition-colors hover:text-text"
          >
            <RefreshCw size={13} /> Rescan
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {ports.length === 0 && (
            <div className="rounded-xl border border-dashed border-line/15 px-4 py-5 text-center text-[13px] text-text-faint">
              No hand detected yet. Plug it in and rescan — or continue in Simulator below.
            </div>
          )}
          {ports.map((p) => (
            <button
              key={p}
              onClick={() => onPort(p)}
              className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface-2 px-4 py-3 text-left transition-colors hover:border-accent/40"
            >
              <Usb size={17} className="text-accent" />
              <span className="flex-1 truncate font-mono text-[13px] text-text">{p}</span>
              <ArrowRight size={15} className="text-text-faint" />
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onSim}
        className={cn(
          "mt-3 flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors",
          simulated ? "border-amber/40 bg-amber/10" : "border-line/10 bg-surface-2 hover:border-line/20",
        )}
      >
        <Cpu size={18} className={simulated ? "text-amber" : "text-text-dim"} />
        <div className="flex-1">
          <div className="text-[14px] font-medium">Continue in Simulator</div>
          <div className="text-[12px] text-text-faint">
            A virtual hand — try every feature without hardware.
          </div>
        </div>
        {simulated && <Check size={18} className="text-amber" />}
      </button>

      <div className="mt-6 flex items-center gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              ready ? "bg-green" : "bg-surface-3",
            )}
          />
          <span className="text-text-dim">
            {connected ? (simulated ? "Simulator ready" : "Hand connected") : "Not connected"}
          </span>
        </div>
        <Button
          size="md"
          variant="primary"
          className="ml-auto"
          disabled={!ready}
          onClick={onNext}
        >
          Continue <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}

function Ready({
  connected,
  simulated,
  onDone,
}: {
  connected: boolean;
  simulated: boolean;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
        className="mb-6 grid h-[72px] w-[72px] place-items-center rounded-full bg-green/15 text-green"
      >
        <Check size={36} strokeWidth={2.4} />
      </motion.div>
      <h2 className="text-[26px] font-semibold tracking-[-0.02em]">You’re all set</h2>
      <p className="mt-3 max-w-[400px] text-[15px] leading-relaxed text-text-dim">
        {connected
          ? simulated
            ? "Simulator is running. Jump into Control to move the virtual hand, then explore Camera and Learn."
            : "Your hand is connected and streaming. Head to Control to make your first grasp."
          : "You can connect a hand any time from Setup. For now, explore in Simulator."}
      </p>
      <Button size="lg" variant="primary" className="mt-8 w-full max-w-[280px]" onClick={onDone}>
        Enter Studio <ArrowRight size={18} />
      </Button>
    </div>
  );
}

function BackdropGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 0%, rgb(var(--accent) / 0.10), transparent 70%)",
      }}
    />
  );
}
