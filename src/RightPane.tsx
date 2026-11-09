import { CanvasEditor } from "./canvas/CanvasEditor";
import { NoteEditor } from "./notes/NoteEditor";
import { useUI } from "./store";

export function RightPane() {
  const { rightTab, setRightTab, notePath, canvasPath } = useUI();
  const path = rightTab === "note" ? notePath : canvasPath;
  return (
    <div className="pane">
      <nav className="tabs">
        <button aria-pressed={rightTab === "note"} onClick={() => setRightTab("note")}>
          Note
        </button>
        <button aria-pressed={rightTab === "canvas"} onClick={() => setRightTab("canvas")}>
          Canvas
        </button>
        <span className="tabs-title">{path?.split("/").pop()}</span>
      </nav>
      <div className="pane-body">
        {!path ? (
          <p className="empty">No {rightTab} open.</p>
        ) : rightTab === "note" ? (
          <NoteEditor key={path} path={path} />
        ) : (
          <CanvasEditor key={path} path={path} />
        )}
      </div>
    </div>
  );
}
