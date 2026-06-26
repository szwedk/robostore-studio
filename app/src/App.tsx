import { useEffect } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { useLicense } from "@/lib/license";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Activate } from "@/screens/Activate";
import { Setup } from "@/screens/Setup";
import { Control } from "@/screens/Control";
import { Camera } from "@/screens/Camera";
import { Learn } from "@/screens/Learn";
import { Develop } from "@/screens/Develop";

export default function App() {
  const { screen, onboarded, theme } = useStore();
  const licensed = useLicense((s) => s.licensed);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
  }, [theme]);

  // Gate 1 — activation. Sellable: the app unlocks with a license key.
  if (!licensed) {
    return (
      <div className="h-screen w-screen bg-bg text-text">
        <Activate />
      </div>
    );
  }

  // Gate 2 — first run owns the whole window, no chrome around onboarding.
  if (!onboarded || screen === "setup") {
    return (
      <div className="h-screen w-screen bg-bg text-text">
        <Setup />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Keyed remount animates each screen in. No exit animation, so screen
            switches are instant and can never wedge mid-transition. */}
        <motion.div
          key={screen}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-0 flex-1"
        >
          {screen === "control" && <Control />}
          {screen === "camera" && <Camera />}
          {screen === "learn" && <Learn />}
          {screen === "develop" && <Develop />}
        </motion.div>
      </main>
    </div>
  );
}
