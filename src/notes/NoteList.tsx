// The .md files of one vault folder: open, create, rename (double-click), delete.
import { ask, message } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { useUI } from "../store";
import { createFile, listDir, moveFile, trash } from "../vault";
import "./notes.css";

const fail = (err: unknown) => message(String(err), { kind: "error" });

export function NoteList({ dir }: { dir: string }) {
  const notePath = useUI((s) => s.notePath);
  const [names, setNames] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const entries = await listDir(dir);
    setNames(entries.filter((e) => e.isFile && e.name.endsWith(".md")).map((e) => e.name).sort((a, b) => a.localeCompare(b)));
  }, [dir]);

  // Also on notePath changes: notes get created elsewhere too ([[links]], "Insert into note").
  useEffect(() => {
    refresh().catch(fail);
  }, [refresh, notePath]);

  async function create() {
    const path = await createFile(dir, "md");
    useUI.getState().openNote(path);
    setRenaming(path.slice(dir.length + 1));
    await refresh();
  }

  async function rename(name: string, input: string) {
    setRenaming(null);
    const base = input.trim().replace(/\.md$/i, "");
    if (!base || `${base}.md` === name) return;
    if (base.includes("/") || base.startsWith(".")) return message("A note name cannot contain “/” or start with “.”.");
    const from = `${dir}/${name}`;
    const to = `${dir}/${base}.md`;
    if (!(await moveFile(from, to))) return message(`A note named “${base}” already exists.`);
    if (useUI.getState().notePath === from) useUI.setState({ notePath: to });
    await refresh();
  }

  async function remove(name: string) {
    const path = `${dir}/${name}`;
    if (!(await ask(`Move “${name.slice(0, -3)}” to the Trash?`, { kind: "warning" }))) return;
    await trash(path);
    if (useUI.getState().notePath === path) useUI.setState({ notePath: null });
    await refresh();
  }

  return (
    <div className="note-list">
      <div className="note-list-head">
        <button onClick={() => create().catch(fail)}>New note</button>
      </div>
      <ul>
        {names.map((name) => (
          <li key={name} aria-current={notePath === `${dir}/${name}`}>
            {renaming === name ? (
              <input
                autoFocus
                defaultValue={name.slice(0, -3)}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => rename(name, e.target.value).catch(fail)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.currentTarget.value = name.slice(0, -3);
                  if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                }}
              />
            ) : (
              <button
                className="note-list-name"
                title="Double-click to rename"
                onClick={() => useUI.getState().openNote(`${dir}/${name}`)}
                onDoubleClick={() => setRenaming(name)}
              >
                {name.slice(0, -3)}
              </button>
            )}
            <button className="note-list-delete" title="Move to Trash" onClick={() => remove(name).catch(fail)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {names.length === 0 && <p className="empty">No notes yet.</p>}
    </div>
  );
}
