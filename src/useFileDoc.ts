// Loads a vault text file and autosaves edits 1 s after typing stops, refusing to
// overwrite a file another app changed meanwhile (status "conflict").
import { useCallback, useEffect, useRef, useState } from "react";
import { ConflictError, readText, writeText } from "./vault";

export type DocStatus = "loading" | "saved" | "dirty" | "conflict" | "error";
const DELAY = 1000;

export function useFileDoc(path: string | null) {
  const [text, setTextState] = useState<string | null>(null);
  const [status, setStatus] = useState<DocStatus>("loading");
  const mtime = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  const timer = useRef<number>(undefined);

  const save = useCallback(async (p: string, t: string, check = true) => {
    pending.current = null;
    try {
      mtime.current = await writeText(p, t, check ? mtime.current : undefined);
      setStatus((s) => (s === "dirty" || !check ? "saved" : s));
    } catch (err) {
      if (err instanceof ConflictError) setStatus("conflict");
      else {
        console.error(err);
        setStatus("error");
      }
    }
  }, []);

  const load = useCallback(async (p: string) => {
    setStatus("loading");
    try {
      const r = await readText(p);
      mtime.current = r.mtime;
      setTextState(r.text);
      setStatus("saved");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    load(path);
    return () => {
      // Flush unsaved edits of the file we are leaving.
      clearTimeout(timer.current);
      if (pending.current !== null) save(path, pending.current);
    };
  }, [path, load, save]);

  const setText = useCallback(
    (t: string) => {
      if (!path) return;
      setTextState(t);
      setStatus((s) => (s === "conflict" ? s : "dirty"));
      pending.current = t;
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (pending.current !== null) save(path, pending.current);
      }, DELAY);
    },
    [path, save],
  );

  return {
    text,
    setText,
    status,
    /** Conflict resolution: drop local edits and re-read the file. */
    reload: () => path && load(path),
    /** Conflict resolution: write our version over the other app's. */
    overwrite: () => path && text !== null && save(path, text, false),
  };
}
