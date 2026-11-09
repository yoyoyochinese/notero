import { beforeEach, expect, test, vi } from "vitest";

// Vault stand-in: path -> mtime; createFile records what it wrote.
const files = new Map<string, number>();
const written: Record<string, string> = {};
vi.mock("../vault", () => ({
  listDir: async (dir: string) =>
    [...files.keys()].filter((p) => p.startsWith(dir + "/")).map((p) => ({ name: p.slice(dir.length + 1), isFile: true })),
  mtimeOf: async (p: string) => files.get(p) ?? null,
  createFile: async (dir: string, ext: string, content: string, base: string) => {
    const p = `${dir}/${base}.${ext}`;
    files.set(p, 99);
    written[p] = content;
    return p;
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ message: vi.fn() }));

const { useUI } = await import("../store");
const { usePapers } = await import("../papers");
const { showPaper } = await import("./showPaper");

beforeEach(() => {
  files.clear();
  useUI.setState({ citekey: null, notePath: null, canvasPath: null });
  usePapers.setState({ papers: { p1: { citekey: "p1", title: "Paper One", authors: [], sha256: "", addedAt: "", highlights: [] } } });
});

test("opens the paper's most recently edited note", async () => {
  files.set("papers/p1/notes/a.md", 1).set("papers/p1/notes/b.md", 5);
  await showPaper("p1");
  expect(useUI.getState()).toMatchObject({ citekey: "p1", notePath: "papers/p1/notes/b.md" });
});

test("creates <citekey>.md with the title when the paper has no note", async () => {
  await showPaper("p1");
  expect(useUI.getState().notePath).toBe("papers/p1/notes/p1.md");
  expect(written["papers/p1/notes/p1.md"]).toBe("# Paper One\n\n");
});

test("replaces another paper's note, keeps a free note", async () => {
  files.set("papers/p1/notes/a.md", 1);
  useUI.setState({ notePath: "papers/p2/notes/x.md" });
  await showPaper("p1");
  expect(useUI.getState().notePath).toBe("papers/p1/notes/a.md");

  useUI.setState({ notePath: "notes/Ideas.md" });
  await showPaper("p1");
  expect(useUI.getState()).toMatchObject({ citekey: "p1", notePath: "notes/Ideas.md" });
});

test("shows the paper's canvas if it has one; a canvas from canvases/ stays", async () => {
  files.set("papers/p1/p1.canvas", 1);
  useUI.setState({ canvasPath: "papers/p2/p2.canvas" });
  await showPaper("p1");
  expect(useUI.getState().canvasPath).toBe("papers/p1/p1.canvas");

  useUI.setState({ canvasPath: "canvases/Map.canvas" });
  await showPaper("p1");
  expect(useUI.getState().canvasPath).toBe("canvases/Map.canvas");

  files.delete("papers/p1/p1.canvas");
  useUI.setState({ canvasPath: "papers/p2/p2.canvas" });
  await showPaper("p1");
  expect(useUI.getState().canvasPath).toBeNull(); // created when the Canvas tab is shown
});
