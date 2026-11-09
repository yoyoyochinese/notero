// @vitest-environment happy-dom
// Regression: opening a .canvas file that isn't valid JSON must show "not a valid JSON Canvas" (decision 35),
// not crash the React root.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ message: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../vault", () => ({
  readText: vi.fn(async () => ({ text: "{ not json", mtime: 1 })),
  writeText: vi.fn(async () => 2),
  uniquePath: vi.fn(),
  listDir: vi.fn(async () => []),
  flushers: new Set(),
  ConflictError: class extends Error {},
}));
const { CanvasEditor } = await import("./CanvasEditor");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

test("invalid canvas shows the error message instead of crashing", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const errors: unknown[] = [];
  const root = createRoot(host, { onUncaughtError: (e) => errors.push(e) });
  await act(async () => root.render(<CanvasEditor path="canvases/x.canvas" />));
  await act(async () => new Promise((r) => setTimeout(r, 10)));
  expect(errors).toEqual([]);
  expect(host.textContent).toContain("not a valid JSON Canvas");
});
