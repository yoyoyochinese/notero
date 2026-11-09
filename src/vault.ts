// All file access goes through here. Paths passed in are vault-relative ("papers/x/paper.json").
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readDir, readTextFile, rename, stat, writeTextFile } from "@tauri-apps/plugin-fs";

const KEY = "notero.vaultPath";
let root = "";

export const savedVault = () => localStorage.getItem(KEY);
export const abs = (rel: string) => `${root}/${rel}`;

export async function openVault(dir: string) {
  for (const d of ["papers", "notes", "canvases"]) await mkdir(`${dir}/${d}`, { recursive: true });
  root = dir;
  localStorage.setItem(KEY, dir);
}

export async function chooseVault(): Promise<string | null> {
  const dir = await open({ directory: true, recursive: true, title: "Choose a vault folder" });
  if (typeof dir !== "string") return null;
  await openVault(dir);
  return dir;
}

/** Thrown when a file changed on disk since we last read or wrote it. */
export class ConflictError extends Error {
  constructor(public path: string) {
    super(`${path} was changed by another app`);
  }
}

export async function mtimeOf(rel: string): Promise<number | null> {
  if (!(await exists(abs(rel)))) return null;
  return (await stat(abs(rel))).mtime?.getTime() ?? null;
}

export async function readText(rel: string) {
  // mtime first: a write landing between the two calls then causes a false conflict, not a silent overwrite.
  const mtime = await mtimeOf(rel);
  return { text: await readTextFile(abs(rel)), mtime };
}

/**
 * Atomic write (temp file + rename). Returns the new mtime.
 * expectedMtime: the mtime from our last read/write (null = file must not exist yet).
 * Omit it to skip the conflict check, e.g. when the user chose to overwrite.
 */
export async function writeText(rel: string, text: string, expectedMtime?: number | null) {
  if (expectedMtime !== undefined && (await mtimeOf(rel)) !== expectedMtime) throw new ConflictError(rel);
  const i = rel.lastIndexOf("/");
  const tmp = abs(`${rel.slice(0, i + 1)}.${rel.slice(i + 1)}.${crypto.randomUUID().slice(0, 8)}.tmp`);
  await writeTextFile(tmp, text);
  await rename(tmp, abs(rel));
  return mtimeOf(rel);
}

export async function readJson<T>(rel: string) {
  const { text, mtime } = await readText(rel);
  return { data: JSON.parse(text) as T, mtime };
}

export const writeJson = (rel: string, data: unknown, expectedMtime?: number | null) =>
  writeText(rel, JSON.stringify(data, null, 2) + "\n", expectedMtime);

/** Visible entries of a vault folder (dotfiles skipped). Missing folder = empty. */
export async function listDir(rel: string) {
  if (!(await exists(abs(rel)))) return [];
  return (await readDir(abs(rel))).filter((e) => !e.name.startsWith("."));
}

/** First free "<dir>/<base>.<ext>", then "<base> 1.<ext>", "<base> 2.<ext>"... (Obsidian style). */
export async function uniquePath(dir: string, base: string, ext: string) {
  for (let n = 0; ; n++) {
    const rel = `${dir}/${n ? `${base} ${n}` : base}.${ext}`;
    if (!(await exists(abs(rel)))) return rel;
  }
}

/** Creates "<dir>/Untitled.<ext>" (or the next free name) and returns its path. */
export async function createFile(dir: string, ext: string, content = "") {
  await mkdir(abs(dir), { recursive: true });
  const rel = await uniquePath(dir, "Untitled", ext);
  await writeText(rel, content, null);
  return rel;
}

/** Open documents register a flush here so their pending edits land before a file is moved or trashed. */
export const flushers = new Set<() => Promise<unknown>>();
export const flushAll = () => Promise.all([...flushers].map((f) => f()));

/** Renames/moves a file; refuses to replace an existing one. Returns false if the target exists. */
export async function moveFile(from: string, to: string) {
  // APFS is case-insensitive: "a.md" -> "A.md" is a rename, not a collision.
  if (from.toLowerCase() !== to.toLowerCase() && (await exists(abs(to)))) return false;
  await flushAll();
  await rename(abs(from), abs(to));
  return true;
}

export async function trash(rel: string) {
  await flushAll();
  await invoke<void>("move_to_trash", { path: abs(rel) });
}
