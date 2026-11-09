// @vitest-environment happy-dom
// Regression: a parent that hands `value` back a few renders late (canvas cards via React Flow)
// must not be treated as an outside change — that reset the doc and sent typing to position 0.
import type { EditorView } from "@codemirror/view";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ message: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("katex", () => ({ default: { render: vi.fn() } })); // happy-dom runs in quirks mode, which KaTeX refuses
const { MarkdownEditor } = await import("./MarkdownEditor");

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise((r) => setTimeout(r, 0));

test("a lagging echo of our own text doesn't move the cursor", async () => {
  const viewRef: { current: EditorView | null } = { current: null };
  function Parent() {
    const [text, setText] = useState("hello world");
    const late = (t: string) => setTimeout(() => setTimeout(() => act(() => setText(t)), 0), 0);
    return <MarkdownEditor value={text} onChange={late} viewRef={viewRef} />;
  }
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => createRoot(host).render(<Parent />));
  const v = viewRef.current!;
  const type = (ch: string) => {
    const at = v.state.selection.main.head;
    v.dispatch({ changes: { from: at, insert: ch }, selection: { anchor: at + ch.length }, userEvent: "input.type" });
  };
  v.dispatch({ selection: { anchor: 5 } });
  type(",");
  await tick();
  type("!");
  for (let i = 0; i < 3; i++) await tick();
  type("?");
  for (let i = 0; i < 3; i++) await tick();
  expect(v.state.doc.toString()).toBe("hello,!? world");
});

test("vim j/k step through every line, including a formula's hidden source lines", async () => {
  const { Vim, getCM } = await import("@replit/codemirror-vim");
  const viewRef: { current: EditorView | null } = { current: null };
  const doc = ["before", "$$", "E = mc^2", "$$", "after $x$", "last"].join("\n");
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => createRoot(host).render(<MarkdownEditor value={doc} onChange={() => {}} viewRef={viewRef} />));
  const v = viewRef.current!;
  const line = () => v.state.doc.lineAt(v.state.selection.main.head).number;
  const walk = (key: string) => Array.from({ length: 5 }, () => (Vim.handleKey(getCM(v)!, key, "user"), line()));
  expect(walk("j")).toEqual([2, 3, 4, 5, 6]);
  expect(walk("k")).toEqual([5, 4, 3, 2, 1]);
});

test("insert-mode arrow keys stop on a formula's lines instead of jumping over the widget", async () => {
  const { Vim, getCM } = await import("@replit/codemirror-vim");
  const viewRef: { current: EditorView | null } = { current: null };
  const doc = ["before", "$$", "E = mc^2", "$$", "after"].join("\n");
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => createRoot(host).render(<MarkdownEditor value={doc} onChange={() => {}} viewRef={viewRef} />));
  const v = viewRef.current!;
  Vim.handleKey(getCM(v)!, "i", "user");
  // No layout in happy-dom: stand in for CodeMirror's vertical motion skipping the rendered block (line 1 → 5).
  const { EditorSelection } = await import("@codemirror/state");
  v.moveVertically = (r, forward) => EditorSelection.cursor(v.state.doc.line(forward ? 5 : 1).from);
  const press = (key: string) => v.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  const line = () => v.state.doc.lineAt(v.state.selection.main.head).number;
  press("ArrowDown");
  expect(line()).toBe(2);
  v.dispatch({ selection: { anchor: v.state.doc.line(5).from } });
  press("ArrowUp");
  expect(line()).toBe(4);
});
