import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export interface SubNavItem {
  key: string;
  label: string;
  badge?: number;
}

export function SubNav({
  items,
  active,
  onChange,
  layoutId = "subnav",
}: {
  items: SubNavItem[];
  active: string;
  onChange: (key: string) => void;
  layoutId?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-surface-2 p-1">
      {items.map((item) => {
        const on = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              on ? "text-text" : "text-text-dim hover:text-text",
            )}
          >
            {on && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-surface-3 shadow-card"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold text-accent">
                  {item.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
