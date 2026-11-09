// Minimal list of a paper's notes; the coordinator replaces it with the notes worker's NoteList.
import { useEffect, useState } from "react";
import { useUI } from "../store";
import { createFile, listDir } from "../vault";

export function PaperNotesStandIn({ citekey }: { citekey: string }) {
  const dir = `papers/${citekey}/notes`;
  const [names, setNames] = useState<string[] | null>(null);

  useEffect(() => {
    listDir(dir).then(
      (es) => setNames(es.filter((e) => e.isFile && e.name.endsWith(".md")).map((e) => e.name).sort()),
      (err) => (console.error(err), setNames([])),
    );
  }, [dir]);

  function openNote(path: string) {
    useUI.getState().openPaper(citekey);
    useUI.getState().openNote(path);
  }

  return (
    <div className="lib-notes">
      {names?.length === 0 && <div className="lib-meta">No notes</div>}
      {names?.map((n) => (
        <button key={n} className="lib-note" onClick={() => openNote(`${dir}/${n}`)}>
          {n.slice(0, -3)}
        </button>
      ))}
      <button onClick={async () => openNote(await createFile(dir, "md"))}>New note</button>
    </div>
  );
}
