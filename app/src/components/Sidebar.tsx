import { motion } from "framer-motion";
import {
  Hand,
  Camera,
  GraduationCap,
  Code2,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useStore, type Screen } from "@/lib/store";
import { brand } from "@/brand.config";
import { cn } from "@/lib/cn";

interface NavItem {
  key: Screen;
  label: string;
  icon: LucideIcon;
  dev?: boolean;
}

const NAV: NavItem[] = [
  { key: "control", label: "Control", icon: Hand },
  { key: "camera", label: "Camera", icon: Camera },
  { key: "learn", label: "Learn", icon: GraduationCap },
  { key: "develop", label: "Develop", icon: Code2, dev: true },
];

export function Sidebar() {
  const { screen, setScreen, developerMode, setDeveloperMode } = useStore();

  return (
    <aside className="flex w-[232px] flex-col border-r border-line/10 bg-bg-elev/40">
      {/* brand lockup */}
      <div className="drag flex items-center gap-3 px-5 pb-4 pt-[34px]">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-ink shadow-[0_4px_14px_-4px_rgb(var(--accent)/0.7)]">
          <Hand size={18} strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">{brand.maker}</div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-faint">
            Studio
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.filter((n) => !n.dev || developerMode).map((item) => {
          const active = screen === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setScreen(item.key)}
              className={cn(
                "no-drag relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium",
                "transition-colors duration-150",
                active ? "text-text" : "text-text-dim hover:text-text",
              )}
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-surface-3 shadow-card"
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                />
              )}
              <item.icon
                size={18}
                strokeWidth={active ? 2.4 : 2}
                className={cn("relative z-10", active && "text-accent")}
              />
              <span className="relative z-10">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <button
          onClick={() => {
            const next = !developerMode;
            setDeveloperMode(next);
            if (!next && screen === "develop") setScreen("control");
          }}
          className={cn(
            "no-drag flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium",
            "text-text-dim transition-colors hover:text-text",
          )}
        >
          <Settings2 size={17} strokeWidth={2} />
          <span>Developer mode</span>
          <span
            className={cn(
              "ml-auto flex h-[18px] w-[30px] items-center rounded-full px-[2px] transition-colors",
              developerMode ? "bg-accent" : "bg-surface-3",
            )}
          >
            <span
              className={cn(
                "h-[14px] w-[14px] rounded-full bg-white shadow transition-transform",
                developerMode && "translate-x-[12px]",
              )}
            />
          </span>
        </button>
      </div>
    </aside>
  );
}
