import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri expects a fixed dev port and relative asset paths in the build.
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 1420,
    strictPort: false,
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    target: "es2021",
    sourcemap: false,
  },
});
