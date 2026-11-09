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
