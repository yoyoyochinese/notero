// @vitest-environment happy-dom
// Regression: markdown() included pasteURLAsLink (select text, paste a URL -> [text](url)); our language must too.
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expect, test, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ message: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const { language } = await import("./MarkdownEditor");

function pasteOverSelection(ext: Extension) {
  const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: "see paper here", extensions: ext, selection: { anchor: 4, head: 9 } }) });
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: { getData: () => "https://arxiv.org/abs/1234.5678" } });
  view.contentDOM.dispatchEvent(ev);
  const out = view.state.doc.toString();
  view.destroy();
  return out;
}

test("pasting a URL over selected text makes a link", () => {
  expect(pasteOverSelection(language)).toBe("see [paper](https://arxiv.org/abs/1234.5678) here");
});
