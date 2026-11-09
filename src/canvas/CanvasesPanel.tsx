// Sidebar "Canvases" tab: canvases/*.canvas with new, rename and delete.
import { ask, message } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { useUI } from "../store";
import { createFile, listDir, moveFile, trash } from "../vault";
import "./canvas.css";

const base = (name: string) => name.slice(0, -".canvas".length);

export function CanvasesPanel() {
  const canvasPath = useUI((s) => s.canvasPath);
  const [names, setNames] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);

  const refresh = async () =>
    setNames(
      (await listDir("canvases"))
        .filter((e) => e.isFile && e.name.endsWith(".canvas"))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b)),
    );
  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    const path = await createFile("canvases", "canvas", '{"nodes":[],"edges":[]}\n');
    await refresh();
    useUI.getState().openCanvas(path);
  }

  async function rename(name: string, input: string) {
    setRenaming(null);
    const next = input.trim().replace(/\.canvas$/, "");
    if (!next || next === base(name)) return;
    if (next.includes("/") || next.startsWith("."))
      return message("A canvas name can't contain “/” or start with “.”.", { kind: "warning" });
    const from = `canvases/${name}`;
    const to = `canvases/${next}.canvas`;
    if (!(await moveFile(from, to))) return message(`“${next}.canvas” already exists.`, { kind: "warning" });
    if (useUI.getState().canvasPath === from) useUI.setState({ canvasPath: to });
    refresh();
  }

  async function remove(name: string) {
    if (!(await ask(`Move “${base(name)}” to the Trash?`, { kind: "warning" }))) return;
    const path = `canvases/${name}`;
    try {
      await trash(path);
    } catch (err) {
      return message(`Could not move “${base(name)}” to the Trash: ${err}`, { kind: "error" });
    }
    if (useUI.getState().canvasPath === path) useUI.setState({ canvasPath: null });
    refresh();
  }

  return (
    <div className="canvas-panel">
      <button onClick={create}>New canvas</button>
      {names.length === 0 && <p className="empty">No canvases yet.</p>}
      <ul className="canvas-list">
        {names.map((name) => {
          const path = `canvases/${name}`;
          return (
            <li key={name} className={path === canvasPath ? "active" : undefined}>
              {renaming === name ? (
                <input
                  autoFocus
                  defaultValue={base(name)}
                  onBlur={(e) => rename(name, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") e.currentTarget.value = base(name);
                    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                  }}
                />
              ) : (
                <button
                  className="canvas-name"
                  onClick={() => useUI.getState().openCanvas(path)}
                  onDoubleClick={() => setRenaming(name)}
                >
                  {base(name)}
                </button>
              )}
              <button className="canvas-action" onClick={() => setRenaming(name)}>
                Rename
              </button>
              <button className="canvas-action" onClick={() => remove(name)}>
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
