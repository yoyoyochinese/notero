import type { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { DocStatusBar } from "../DocStatusBar";
import { useUI } from "../store";
import { useFileDoc } from "../useFileDoc";
import { paragraphInsert } from "./insert";
import { MarkdownEditor } from "./MarkdownEditor";
import "./notes.css";

export function NoteEditor({ path }: { path: string }) {
  const doc = useFileDoc(path);
  const view = useRef<EditorView | null>(null);
  const insert = useUI((s) => s.insert);
  const loaded = doc.text !== null;

  // "Insert into note" (decision 29): runs once the editor exists, i.e. after the file loaded.
  useEffect(() => {
    const v = view.current;
    if (!insert || !v) return;
    const { from, insert: text } = paragraphInsert(v.state.doc.toString(), v.state.selection.main.to, insert.text);
    v.dispatch({ changes: { from, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true });
    v.focus();
    useUI.getState().clearInsert();
  }, [insert, loaded]);

  return (
    <div className="note-editor">
      <DocStatusBar doc={doc} />
      {loaded && <MarkdownEditor value={doc.text!} onChange={doc.setText} viewRef={view} />}
    </div>
  );
}
