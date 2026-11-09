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
    // All paper.json reads in flight at once (startup is bound by IPC round trips), but the
    // results are added in listing order so ties in the library sort don't reshuffle per launch.
    const dirs = (await listDir("papers")).filter((e) => e.isDirectory).map((e) => e.name);
    const read = await Promise.all(
      dirs.map((ck) =>
        readJson<PaperFile>(jsonPath(ck)).catch((err) => void console.warn(`skipping papers/${ck}:`, err)),
      ),
    );
    const papers: Record<string, Paper> = {};
    dirs.forEach((ck, i) => {
      const r = read[i];
      if (!r) return;
      papers[ck] = { ...r.data, citekey: ck };
      mtimes[ck] = r.mtime;
    });
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

// Dev only: this module holds state (a store, the vault root, a queue). A hot update would leave old and
// new instances side by side (e.g. a drop imported into the old store), so reload the page instead.
import.meta.hot?.accept(() => location.reload());
