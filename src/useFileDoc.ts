// Loads a vault text file and autosaves edits 1 s after typing stops, refusing to
// overwrite a file another app changed meanwhile (status "conflict").
// One instance = one file: switch files by remounting (key={path}).
import { message } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConflictError, flushers, readText, uniquePath, writeText } from "./vault";

export type DocStatus = "loading" | "saved" | "dirty" | "conflict" | "error";
const DELAY = 1000;

export function useFileDoc(path: string) {
  const [text, setTextState] = useState<string | null>(null);
  const [status, setStatus] = useState<DocStatus>("loading");
  const mtime = useRef<number | null>(null);
  const pending = useRef<string | null>(null); // latest text not yet on disk
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number>(undefined);
  const alive = useRef(true);

  // Writes are queued so each one checks against the mtime the previous one produced.
  const write = useCallback(
    (force = false) => {
      clearTimeout(timer.current);
      queue.current = queue.current.then(async () => {
        const t = pending.current;
        if (t === null) return;
        try {
          mtime.current = await writeText(path, t, force ? undefined : mtime.current);
          if (pending.current === t) pending.current = null;
          if (alive.current && pending.current === null) setStatus("saved");
        } catch (err) {
          if (!(err instanceof ConflictError)) console.error(err);
          if (alive.current) setStatus(err instanceof ConflictError ? "conflict" : "error");
          else await rescue(path, t); // editor already closed: nobody can resolve it, keep a copy
        }
      });
      return queue.current;
    },
    [path],
  );

  const load = useCallback(async () => {
    clearTimeout(timer.current);
    pending.current = null;
    setStatus("loading");
    await queue.current;
    try {
      const r = await readText(path);
      mtime.current = r.mtime;
      setTextState(r.text);
      setStatus("saved");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    load();
    const flush = () => write();
    flushers.add(flush);
    return () => {
      alive.current = false;
      flushers.delete(flush);
      write();
    };
  }, [load, write]);

  const setText = useCallback(
    (t: string) => {
      setTextState(t);
      setStatus((s) => (s === "conflict" ? s : "dirty"));
      pending.current = t;
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => write(), DELAY);
    },
    [write],
  );

  return {
    text,
    setText,
    status,
    /** Conflict resolution: drop local edits and re-read the file. */
    reload: load,
    /** Conflict resolution: write our version over the other app's. */
    overwrite: () => write(true),
  };
}

/** Saves edits that could not be written next to the file as "<name> (conflict).<ext>". */
async function rescue(path: string, text: string) {
  const m = /^(.*)\/([^/]+)\.([^./]+)$/.exec(path);
  if (!m) return console.error("unsaved edits lost for", path);
  try {
    const copy = await uniquePath(m[1], `${m[2]} (conflict)`, m[3]);
    await writeText(copy, text, null);
    message(`${path} was changed elsewhere. Your unsaved edits were saved as ${copy}.`, { kind: "warning" });
  } catch (err) {
    console.error("unsaved edits lost for", path, err);
  }
}
