import { Moon, Sun, Zap } from "lucide-react";
import { useStore, type Screen } from "@/lib/store";
import { DeviceMenu } from "@/components/DeviceMenu";

const TITLES: Record<Screen, string> = {
  setup: "Setup",
  control: "Control",
  camera: "Camera",
  learn: "Learn",
  develop: "Develop",
};

const SUBTITLES: Record<Screen, string> = {
  setup: "",
  control: "Pose, sense, and move your hand in real time",
  camera: "Mirror, record, and train gestures with your camera",
  learn: "Step-by-step from first grasp to your first script",
  develop: "Scripting, data, classifiers, and the local API",
};

export function TopBar() {
  const { screen, hz, theme, setTheme, connected } = useStore();

  return (
    <header className="drag flex h-[58px] flex-shrink-0 items-center gap-4 border-b border-line/10 px-7">
      <div className="min-w-0">
        <h1 className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">
          {TITLES[screen]}
        </h1>
        {SUBTITLES[screen] && (
          <p className="truncate text-[12px] text-text-faint">{SUBTITLES[screen]}</p>
        )}
      </div>

      <div className="no-drag ml-auto flex items-center gap-2.5">
        {connected && (
          <div className="flex items-center gap-1.5 rounded-full bg-surface-3/60 px-2.5 py-1 text-[12px] text-text-dim">
            <Zap size={12} className="text-accent" />
            <span className="tnum">{hz}</span>
            <span className="text-text-faint">Hz</span>
          </div>
        )}

        <DeviceMenu />

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="grid h-8 w-8 place-items-center rounded-full text-text-dim transition-colors hover:bg-surface-3/60 hover:text-text focus-ring"
          title="Toggle appearance"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
