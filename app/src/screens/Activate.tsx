import { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";
import { useLicense } from "@/lib/license";
import { brand } from "@/brand.config";
import { Button } from "@/components/ui/Button";

/** Format raw input into ROBO-XXXX-XXXX-XXXX as the user types. */
function formatKey(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += 4) groups.push(chars.slice(i, i + 4));
  return groups.join("-");
}

export function Activate() {
  const activate = useLicense((s) => s.activate);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const res = activate(value);
    if (!res.ok) setError(res.reason ?? "That key isn’t valid.");
  };

  return (
    <div className="drag relative grid h-full place-items-center overflow-hidden p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(55% 45% at 50% 0%, rgb(var(--accent)/0.10), transparent 70%)" }}
      />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="no-drag w-full max-w-[460px]"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 grid h-[64px] w-[64px] place-items-center rounded-[20px] bg-accent text-accent-ink shadow-glow">
            <KeyRound size={28} strokeWidth={2.2} />
          </div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Activate {brand.product}</h1>
          <p className="mt-2 max-w-[380px] text-[14px] leading-relaxed text-text-dim">
            Enter the license key from your {brand.device} box or confirmation email. Activation is one
            time and works offline.
          </p>
        </div>

        <div className="mt-7">
          <input
            value={value}
            onChange={(e) => { setValue(formatKey(e.target.value)); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="ROBO-XXXX-XXXX-XXXX"
            spellCheck={false}
            autoFocus
            className="focus-ring w-full rounded-2xl border border-line/12 bg-surface px-4 py-3.5 text-center font-mono text-[16px] tracking-[0.12em] text-text outline-none placeholder:text-text-faint"
          />
          {error && <p className="mt-2 text-center text-[13px] text-red">{error}</p>}
          <Button variant="primary" size="lg" className="mt-4 w-full" disabled={value.length < 19} onClick={submit}>
            Activate <ArrowRight size={18} />
          </Button>
        </div>

        <div className="mt-7 flex flex-col gap-2.5 text-[12px] text-text-faint">
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck size={14} className="text-green" />
            No account or internet required — your key activates locally.
          </div>
          <a
            href={brand.supportUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 text-text-dim transition-colors hover:text-text"
          >
            <HelpCircle size={14} /> Can’t find your key?
          </a>
        </div>
      </motion.div>
    </div>
  );
}
