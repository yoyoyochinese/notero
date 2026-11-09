import { useEffect } from "react";
import { CanvasEditor } from "./canvas/CanvasEditor";
import { openPaperCanvas } from "./library/showPaper";
import { NoteEditor } from "./notes/NoteEditor";
import { usePapers } from "./papers";
import { useShallow } from "zustand/react/shallow";
import { useUI } from "./store";
import { createFile } from "./vault";

export function RightPane() {
  const { rightTab, setRightTab, notePath, canvasPath, citekey } = useUI(
    useShallow((s) => ({ rightTab: s.rightTab, setRightTab: s.setRightTab, notePath: s.notePath, canvasPath: s.canvasPath, citekey: s.citekey })),
  );
  const path = rightTab === "note" ? notePath : canvasPath;
  // Canvas tab with a paper open but no canvas: the paper's own canvas, created on first use.
  useEffect(() => {
    if (rightTab === "canvas" && !canvasPath && citekey) openPaperCanvas(citekey).catch(console.error);
  }, [rightTab, canvasPath, citekey]);
  return (
    <div className="pane">
      <nav className="tabs">
        <button aria-pressed={rightTab === "note"} onClick={() => setRightTab("note")}>
          Note
        </button>
        <button aria-pressed={rightTab === "canvas"} onClick={() => setRightTab("canvas")}>
          Canvas
        </button>
        <span className="tabs-title" title={path ?? undefined}>
          {path?.split("/").pop()?.replace(/\.(md|canvas)$/, "")}
        </span>
      </nav>
      <div className="pane-body">
        {!path ? (
          <EmptyRight tab={rightTab} />
        ) : rightTab === "note" ? (
          <NoteEditor key={path} path={path} />
        ) : (
          <CanvasEditor key={path} path={path} />
        )}
      </div>
    </div>
  );
}

function EmptyRight({ tab }: { tab: "note" | "canvas" }) {
  const citekey = useUI((s) => s.citekey);
  const paper = usePapers((s) => (citekey ? s.papers[citekey] : undefined));
  const fail = (err: unknown) => console.error(err);
  if (tab === "canvas")
    return (
      <div className="empty-state">
        <p>No canvas open.</p>
        <button
          className="primary"
          onClick={() => createFile("canvases", "canvas", '{"nodes":[],"edges":[]}\n').then(useUI.getState().openCanvas, fail)}
        >
          New canvas
        </button>
        <button onClick={() => useUI.getState().setSidebarTab("canvases")}>Open a canvas…</button>
      </div>
    );
  return (
    <div className="empty-state">
      <p>No note open.</p>
      {paper && (
        <button
          className="primary"
          onClick={() =>
            createFile(`papers/${paper.citekey}/notes`, "md", `# ${paper.title}\n\n`, paper.citekey).then(useUI.getState().openNote, fail)
          }
        >
          New note for this paper
        </button>
      )}
      <button className={paper ? undefined : "primary"} onClick={() => createFile("notes", "md").then(useUI.getState().openNote, fail)}>
        New free note
      </button>
    </div>
  );
}
