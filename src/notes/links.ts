// What happens when a rendered link in a note is clicked (decisions 13, 14).
import { message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { usePapers } from "../papers";
import { parseHighlightLink } from "../quote";
import { useUI } from "../store";
import { listDir, writeText } from "../vault";

/** "Name#heading|alias" (the text between [[ and ]]) → note name "Name" and the text to display. */
export function parseWikilink(inner: string) {
  const bar = inner.indexOf("|");
  const target = bar < 0 ? inner : inner.slice(0, bar);
  const path = target.split("#")[0].trim();
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  return { name, label: (bar < 0 ? target : inner.slice(bar + 1)).trim() };
}

/**
 * Vault path of the note called `name`: exact file-name match first, else case-insensitive.
 * Several matches → the first by path order, so free notes (notes/) win over paper notes.
 */
export function resolveNote(name: string, paths: string[]) {
  const base = (p: string) => p.slice(p.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  const sorted = [...paths].sort();
  const lower = name.toLowerCase();
  return sorted.find((p) => base(p) === name) ?? sorted.find((p) => base(p).toLowerCase() === lower) ?? null;
}

/** Every note in the vault: notes/*.md and papers/<ck>/notes/*.md. */
async function notePaths() {
  const dirs = ["notes"];
  for (const e of await listDir("papers")) if (e.isDirectory) dirs.push(`papers/${e.name}/notes`);
  const paths: string[] = [];
  for (const d of dirs) for (const e of await listDir(d)) if (e.isFile && e.name.endsWith(".md")) paths.push(`${d}/${e.name}`);
  return paths;
}

/** Opens the note a [[wikilink]] points at, creating notes/<name>.md if there is none. */
export async function openWikilink(inner: string) {
  const { name } = parseWikilink(inner);
  if (!name) return;
  let path = resolveNote(name, await notePaths());
  if (!path) {
    path = `notes/${name}.md`;
    await writeText(path, "", null);
  }
  useUI.getState().openNote(path);
}

/** Follows a Markdown link target: notero:// jumps the PDF, http(s) opens the browser. */
export function followLink(href: string) {
  const hl = parseHighlightLink(href);
  if (hl) {
    const page = usePapers.getState().papers[hl.citekey]?.highlights.find((h) => h.id === hl.id)?.page;
    if (page) useUI.getState().jumpTo(hl.citekey, page, hl.id);
    else message("This highlight no longer exists.");
  } else if (/^https?:\/\//i.test(href)) openUrl(href);
}
