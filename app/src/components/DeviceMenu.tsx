import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cpu, Usb, Check, ChevronDown, RefreshCw, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

/** /dev/cu.usbserial-FTAHKGS21 → usbserial-FTAHKGS21 */
const portLabel = (p: string) => p.split("/").pop() || p;

/**
 * Live device switcher in the top bar. Flip between the Simulator and any
 * connected hand without leaving the app; the engine reconnects on selection.
 */
export function DeviceMenu() {
  const {
    simulated, connected, status, statusDetail, ports, currentPort, selectedDevice,
    useSimulator, setPort, listPorts,
  } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listPorts();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, listPorts]);

  const onSim = selectedDevice === "simulator";
  // Is the device the user selected actually the one streaming right now?
  const live = onSim
    ? simulated && connected
    : !simulated && connected && currentPort === selectedDevice;
  const dot = live ? "bg-green" : status === "error" ? "bg-red" : "bg-amber";
  const label = onSim ? "Simulator" : portLabel(selectedDevice);

  const choose = (target: "sim" | string) => {
    if (target === "sim") useSimulator(true);
    else setPort(target);
    setOpen(false);
  };

  return (
    <div className="no-drag relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors",
          open ? "border-line/20 bg-surface-3" : "border-line/10 bg-surface-3/60 hover:bg-surface-3",
        )}
        title="Switch device"
      >
        <span className={cn("h-2 w-2 rounded-full", dot, !live && "animate-pulse-dot")} />
        {onSim ? <Cpu size={13} className="text-amber" /> : <Usb size={13} className="text-accent" />}
        <span className="max-w-[170px] truncate text-[12px] font-medium text-text-dim">{label}</span>
        <ChevronDown size={13} className={cn("text-text-faint transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="glass absolute right-0 top-[calc(100%+8px)] z-50 w-[268px] rounded-2xl border border-line/10 p-1.5 shadow-pop"
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
              Simulator
            </div>
            <Item
              icon={<Cpu size={15} className="text-amber" />}
              title="Simulator"
              subtitle="Virtual hand — no hardware"
              active={onSim}
              onClick={() => choose("sim")}
            />

            <div className="mt-1 flex items-center justify-between px-2.5 pb-1 pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
                Connected hands
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); listPorts(); }}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-text-dim transition-colors hover:text-text"
              >
                <RefreshCw size={11} /> Rescan
              </button>
            </div>

            {ports.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-[12px] leading-relaxed text-text-faint">
                No hand detected. Plug one in over USB and Rescan.
              </div>
            ) : (
              ports.map((p) => (
                <Item
                  key={p}
                  icon={<Usb size={15} className="text-accent" />}
                  title={portLabel(p)}
                  subtitle={p}
                  mono
                  active={!onSim && selectedDevice === p}
                  connecting={!onSim && selectedDevice === p && !live}
                  onClick={() => choose(p)}
                />
              ))
            )}

            {!live && (
              <div
                className={cn(
                  "mx-1 mt-1 rounded-lg px-2.5 py-1.5 text-[11px]",
                  status === "error" ? "bg-red/10 text-red" : "bg-amber/10 text-amber",
                )}
              >
                {statusDetail || (onSim ? "Starting simulator…" : "Connecting…")}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Item({
  icon, title, subtitle, active, connecting, mono, onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  active: boolean;
  connecting?: boolean;
  mono?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
        active ? "bg-surface-3" : "hover:bg-surface-3/60",
      )}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px] font-medium", mono && "font-mono")}>{title}</span>
        <span className="block truncate text-[11px] text-text-faint">{subtitle}</span>
      </span>
      {connecting ? (
        <Loader2 size={15} className="shrink-0 animate-spin text-amber" />
      ) : active ? (
        <Check size={15} className="shrink-0 text-accent" />
      ) : null}
    </button>
  );
}
