// In-memory library, loaded from papers/*/paper.json. Every change is written straight back.
import { message } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import type { Paper, PaperFile } from "./types";
import { ConflictError, listDir, readJson, writeJson } from "./vault";

type State = {
  papers: Record<string, Paper>;
  load: () => Promise<void>;
  /** Adds a paper whose folder (with paper.pdf) already exists, writing its paper.json. */
  add: (citekey: string, file: PaperFile) => Promise<void>;
  update: (citekey: string, fn: (p: PaperFile) => PaperFile) => Promise<void>;
  remove: (citekey: string) => void;
};

const mtimes: Record<string, number | null> = {};
// Writes per paper run one after another, so each checks against the mtime of the previous one.
const chains: Record<string, Promise<unknown>> = {};
const jsonPath = (ck: string) => `papers/${ck}/paper.json`;
const strip = ({ citekey: _, ...file }: Paper): PaperFile => file;

export const usePapers = create<State>((set, get) => ({
  papers: {},

  load: async () => {
    const papers: Record<string, Paper> = {};
    // All paper.json reads in flight at once: startup is bound by IPC round trips, not by work.
    await Promise.all(
      (await listDir("papers"))
        .filter((e) => e.isDirectory)
        .map(async (e) => {
          try {
            const { data, mtime } = await readJson<PaperFile>(jsonPath(e.name));
            papers[e.name] = { ...data, citekey: e.name };
            mtimes[e.name] = mtime;
          } catch (err) {
            console.warn(`skipping papers/${e.name}:`, err);
          }
        }),
    );
    set({ papers });
  },

  add: async (citekey, file) => {
    mtimes[citekey] = await writeJson(jsonPath(citekey), file, null);
    set((s) => ({ papers: { ...s.papers, [citekey]: { ...file, citekey } } }));
  },

  update: async (citekey, fn) => {
    const old = get().papers[citekey];
    const next = fn(strip(old));
    set((s) => ({ papers: { ...s.papers, [citekey]: { ...next, citekey } } }));
    const run = (chains[citekey] ?? Promise.resolve()).then(async () => {
      mtimes[citekey] = await writeJson(jsonPath(citekey), next, mtimes[citekey]);
    });
    chains[citekey] = run.catch(() => {});
    try {
      await run;
    } catch (err) {
      set((s) => ({ papers: { ...s.papers, [citekey]: old } }));
      if (err instanceof ConflictError)
        message(`${err.message}. Your change was not saved; reopen the vault to reload.`, { kind: "warning" });
      throw err;
    }
  },

  /** Drops a paper from memory; the caller moves its folder to the trash. */
  remove: (citekey) =>
    set((s) => {
      const { [citekey]: _, ...rest } = s.papers;
      return { papers: rest };
    }),
}));
