// In-memory library, loaded from papers/*/paper.json. Every change is written straight back.
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
const jsonPath = (ck: string) => `papers/${ck}/paper.json`;
const strip = ({ citekey: _, ...file }: Paper): PaperFile => file;

export const usePapers = create<State>((set, get) => ({
  papers: {},

  load: async () => {
    const papers: Record<string, Paper> = {};
    for (const e of await listDir("papers")) {
      if (!e.isDirectory) continue;
      try {
        const { data, mtime } = await readJson<PaperFile>(jsonPath(e.name));
        papers[e.name] = { ...data, citekey: e.name };
        mtimes[e.name] = mtime;
      } catch (err) {
        console.warn(`skipping papers/${e.name}:`, err);
      }
    }
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
    try {
      mtimes[citekey] = await writeJson(jsonPath(citekey), next, mtimes[citekey]);
    } catch (err) {
      set((s) => ({ papers: { ...s.papers, [citekey]: old } }));
      if (err instanceof ConflictError) alert(`${err.message}. Your change was not saved; reopen the vault to reload.`);
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
