import { beforeEach, expect, test, vi } from "vitest";

// In-memory stand-in for plugin-fs: path -> { text, mtime }.
const files = new Map<string, { text: string; mtime: number }>();
let clock = 1000;
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async (p: string) => files.has(p),
  stat: async (p: string) => ({ mtime: new Date(files.get(p)!.mtime) }),
  readTextFile: async (p: string) => files.get(p)!.text,
  writeTextFile: async (p: string, text: string) => void files.set(p, { text, mtime: ++clock }),
  rename: async (a: string, b: string) => {
    files.set(b, files.get(a)!);
    files.delete(a);
  },
  mkdir: async () => {},
  readDir: async () => [],
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });

const { ConflictError, createFile, openVault, readText, writeText } = await import("./vault");

beforeEach(async () => {
  files.clear();
  await openVault("/v");
});

test("write then read round-trips and leaves no temp file", async () => {
  const m = await writeText("notes/a.md", "hello", null);
  expect(await readText("notes/a.md")).toEqual({ text: "hello", mtime: m });
  expect([...files.keys()]).toEqual(["/v/notes/a.md"]);
});

test("refuses to overwrite a file changed since our last read", async () => {
  const m = await writeText("notes/a.md", "mine", null);
  files.set("/v/notes/a.md", { text: "theirs", mtime: ++clock }); // another app saves
  await expect(writeText("notes/a.md", "mine v2", m)).rejects.toBeInstanceOf(ConflictError);
  expect((await readText("notes/a.md")).text).toBe("theirs");
  await writeText("notes/a.md", "mine v2"); // explicit overwrite skips the check
  expect((await readText("notes/a.md")).text).toBe("mine v2");
});

test("expectedMtime null means the file must not exist yet", async () => {
  await writeText("notes/a.md", "x", null);
  await expect(writeText("notes/a.md", "y", null)).rejects.toBeInstanceOf(ConflictError);
});

test("createFile picks the next free Untitled name", async () => {
  expect(await createFile("notes", "md")).toBe("notes/Untitled.md");
  expect(await createFile("notes", "md")).toBe("notes/Untitled 1.md");
});
