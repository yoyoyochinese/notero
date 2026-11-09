// Regression: papers load in parallel, but in listing order, so ties in the Library sort stay put across launches.
import { expect, test, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ message: vi.fn() }));
const delays: Record<string, number> = { a: 20, b: 0 }; // a's IPC answers last
vi.mock("./vault", () => ({
  listDir: vi.fn(async () => [{ name: "a", isDirectory: true }, { name: "b", isDirectory: true }]),
  readJson: vi.fn(async (p: string) => {
    const ck = p.split("/")[1];
    await new Promise((r) => setTimeout(r, delays[ck]));
    return { data: { title: "Same", authors: [], year: 2020, addedAt: "", highlights: [] }, mtime: 1 };
  }),
  writeJson: vi.fn(),
  ConflictError: class extends Error {},
}));
const { usePapers } = await import("./papers");

test("library order follows the folder listing, not IPC completion", async () => {
  await usePapers.getState().load();
  const keys = Object.keys(usePapers.getState().papers);
  expect(keys).toEqual(["a", "b"]);
});
