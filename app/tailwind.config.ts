import type { Config } from "tailwindcss";

/**
 * Semantic, theme-able design tokens.
 * Every color resolves to a CSS variable (space-separated RGB triplet) defined
 * in src/styles/index.css for both light and dark themes. Components only ever
 * reference semantic names (bg, surface, accent…), never raw hexes — so a
 * per-device re-skin or white-label is a token swap, not a refactor.
 */
const withVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: withVar("--bg"),
        "bg-elev": withVar("--bg-elev"),
        surface: withVar("--surface"),
        "surface-2": withVar("--surface-2"),
        "surface-3": withVar("--surface-3"),
        line: withVar("--line"),
        "line-strong": withVar("--line-strong"),
        text: withVar("--text"),
        "text-dim": withVar("--text-dim"),
        "text-faint": withVar("--text-faint"),
        accent: withVar("--accent"),
        "accent-soft": withVar("--accent-soft"),
        "accent-ink": withVar("--accent-ink"),
        amber: withVar("--amber"),
        green: withVar("--green"),
        red: withVar("--red"),
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "SF Pro Display", "SF Pro Text",
          "Inter", "Segoe UI", "system-ui", "sans-serif",
        ],
        mono: [
          "ui-monospace", "SF Mono", "SFMono-Regular", "Menlo",
          "JetBrains Mono", "monospace",
        ],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "24px",
      },
      boxShadow: {
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 1px 2px rgb(0 0 0 / 0.18), 0 8px 24px -12px rgb(0 0 0 / 0.5)",
        pop: "0 12px 40px -12px rgb(0 0 0 / 0.55)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.35), 0 8px 30px -8px rgb(var(--accent) / 0.4)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        ease: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.9)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease both",
        rise: "rise 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
