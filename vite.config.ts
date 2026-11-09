import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// KaTeX's CSS lists woff2, woff and ttf for every font; WebKit only ever loads woff2, so the rest
// would just sit in the app bundle (~700 KB). Runs before Vite resolves the CSS url()s.
const katexWoff2Only = {
  name: "katex-woff2-only",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (/katex.*\.css$/.test(id)) return code.replace(/,\s*url\([^)]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, "");
  },
};

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), katexWoff2Only],
  // Agent worktrees live under .claude/; don't pick up their copies of the tests.
  test: { exclude: ["**/node_modules/**", ".claude/**"] },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
