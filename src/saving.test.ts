// Regression tests for the save path (review of Wave 0): races, conflicts, rename.
// Drives the real useFileDoc with a minimal hooks runtime, over an in-memory plugin-fs.
import { beforeEach, expect, test, vi } from "vitest";

const F = vi.hoisted(() => {
  const files = new Map<string, { text: string; mtime: number }>();
  const st = { clock: 1000, caseInsensitive: false, afterRead: null as null | ((p: string) => void), gateRename: null as null | Promise<void> };
  const key = (p: string) => (st.caseInsensitive ? [...files.keys()].find((k) => k.toLowerCase() === p.toLowerCase()) ?? p : p);
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const fs = {
    exists: async (p: string) => (await tick(), files.has(key(p))),
    stat: async (p: string) => (await tick(), { mtime: new Date(files.get(key(p))!.mtime) }),
    readTextFile: async (p: string) => {
      await tick();
      const t = files.get(key(p))!.text;
      st.afterRead?.(p);
      return t;
    },
    writeTextFile: async (p: string, text: string) => (await tick(), void files.set(p, { text, mtime: ++st.clock })),
    rename: async (a: string, b: string) => {
      await tick();
      if (st.gateRename) await st.gateRename;
      const f = files.get(a);
      if (!f) throw new Error(`ENOENT ${a}`);
      files.delete(key(b));
      files.set(b, f);
      files.delete(a);
    },
    mkdir: async () => {},
    readDir: async () => [],
  };
  const external = (p: string, text: string) => files.set(p, { text, mtime: ++st.clock });
  return { files, st, fs, external };
});
const H = vi.hoisted(() => {
  let slots: any[] = [];
  let i = 0;
  let effects: (() => void)[] = [];
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((x, j) => Object.is(x, b[j]));
  return {
    reset() {
      slots = [];
      effects = [];
    },
    begin() {
      i = 0;
    },
    useState(init: unknown) {
      const s = (slots[i++] ??= { v: init });
      return [s.v, (u: any) => (s.v = typeof u === "function" ? u(s.v) : u)];
    },
    useRef(init: unknown) {
      return (slots[i++] ??= { current: init });
    },
    useCallback(fn: unknown, deps: unknown[]) {
      const k = i++;
      if (slots[k] && same(slots[k].deps, deps)) return slots[k].fn;
      slots[k] = { fn, deps };
      return fn;
    },
    useEffect(fn: () => any, deps: unknown[]) {
      const k = i++;
      const s = slots[k];
      if (s && same(s.deps, deps)) return;
      slots[k] = { deps, eff: true };
      effects.push(() => {
        s?.cleanup?.();
        slots[k].cleanup = fn();
      });
    },
    flush() {
      effects.splice(0).forEach((f) => f());
    },
    unmount() {
      slots.forEach((s) => s?.eff && s.cleanup?.());
    },
  };
});
vi.mock("react", () => H);
vi.mock("@tauri-apps/plugin-fs", () => F.fs);
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), message: vi.fn(), ask: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
vi.stubGlobal("window", globalThis);

const { files, st, external } = F;
const { moveFile, openVault, readText, writeText, ConflictError } = await import("./vault");
const { useFileDoc } = await import("./useFileDoc");
const { usePapers } = await import("./papers");
const render = (p: string) => {
  H.begin();
  const r = useFileDoc(p);
  H.flush();
  return r;
};
const settle = () => vi.advanceTimersByTimeAsync(50);
const gate = () => {
  let open!: () => void;
  st.gateRename = new Promise<void>((r) => (open = r));
  return () => {
    st.gateRename = null;
    open();
  };
};

beforeEach(async () => {
  vi.useRealTimers();
  files.clear();
  Object.assign(st, { gateRename: null, afterRead: null, caseInsensitive: false });
  H.reset();
  await openVault("/v");
  files.set("/v/a.md", { text: "orig", mtime: ++st.clock });
  vi.useFakeTimers();
});

test("conflict: 'Discard mine and reload' cancels the queued autosave", async () => {
  render("a.md");
  await settle();
  external("/v/a.md", "THEIRS");
  render("a.md").setText("mine");
  await vi.advanceTimersByTimeAsync(1100);
  expect(render("a.md").status).toBe("conflict");
  render("a.md").setText("mine 2");
  render("a.md").reload();
  await vi.advanceTimersByTimeAsync(1100);
  expect(files.get("/v/a.md")!.text).toBe("THEIRS");
  expect(render("a.md").text).toBe("THEIRS");
});

test("conflict on close keeps the edits in a conflict copy", async () => {
  files.set("/v/notes/a.md", { text: "orig", mtime: ++st.clock });
  render("notes/a.md");
  await settle();
  external("/v/notes/a.md", "THEIRS");
  render("notes/a.md").setText("my edits");
  H.unmount();
  await settle();
  expect(files.get("/v/notes/a.md")!.text).toBe("THEIRS");
  expect(files.get("/v/notes/a (conflict).md")?.text).toBe("my edits");
});

test("close during an in-flight save writes the latest text, no false conflict", async () => {
  render("a.md");
  await settle();
  render("a.md").setText("v1");
  const open = gate();
  await vi.advanceTimersByTimeAsync(1000);
  render("a.md").setText("v2");
  H.unmount();
  open();
  await settle();
  expect(files.get("/v/a.md")!.text).toBe("v2");
  expect(files.has("/v/a (conflict).md")).toBe(false);
});

test("status stays dirty while an edit typed during a save is unsaved", async () => {
  render("a.md");
  await settle();
  render("a.md").setText("v1");
  const open = gate();
  await vi.advanceTimersByTimeAsync(1000);
  render("a.md").setText("v2");
  open();
  await settle();
  expect(render("a.md").status).toBe("dirty");
  await vi.advanceTimersByTimeAsync(1100);
  expect(render("a.md").status).toBe("saved");
  expect(files.get("/v/a.md")!.text).toBe("v2");
});

test("rename flushes pending edits first", async () => {
  render("a.md");
  await settle();
  render("a.md").setText("unsaved");
  vi.useRealTimers();
  await moveFile("a.md", "b.md");
  expect(files.get("/v/b.md")!.text).toBe("unsaved");
});

test("two quick paper updates both land, no false conflict", async () => {
  vi.useRealTimers();
  await usePapers.getState().add("p", { title: "T", authors: [], sha256: "x", addedAt: "", highlights: [] });
  const { update } = usePapers.getState();
  await Promise.all([update("p", (p) => ({ ...p, title: "first" })), update("p", (p) => ({ ...p, venue: "second" }))]);
  const disk = JSON.parse(files.get("/v/papers/p/paper.json")!.text);
  expect([disk.title, disk.venue]).toEqual(["first", "second"]);
});

test("a write between stat and read becomes a conflict, not a silent overwrite", async () => {
  vi.useRealTimers();
  st.afterRead = (p) => {
    st.afterRead = null;
    external(p, "THEIRS");
  };
  const { text, mtime } = await readText("a.md");
  await expect(writeText("a.md", text + " + mine", mtime)).rejects.toBeInstanceOf(ConflictError);
});

test("case-only rename works on case-insensitive APFS", async () => {
  vi.useRealTimers();
  st.caseInsensitive = true;
  files.set("/v/notes/Untitled.md", { text: "", mtime: 1 });
  expect(await moveFile("notes/Untitled.md", "notes/untitled.md")).toBe(true);
});
