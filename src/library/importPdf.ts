// PDF import: copy into papers/<citekey>/paper.pdf with metadata (DECISIONS.md 4–6, 21).
import { useEffect } from "react";
import { mkdir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import { fetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { usePapers } from "../papers";
import { pdfjs } from "../pdfjs";
import { useUI } from "../store";
import type { PaperFile } from "../types";
import { abs, listDir } from "../vault";
import { showPaper } from "./showPaper";
import { findIds, makeCitekey, type Meta, parseArxiv, parseCrossref, splitName } from "./metadata";

/** Import progress, global so the drop hook can live outside the Library panel. */
export const useImports = create<{ pending: number; errors: string[] }>(() => ({ pending: 0, errors: [] }));

/** A path from the file dialog, or a File dropped on the window (no path, just its bytes). */
type Source = string | File;
const nameOf = (src: Source) => (typeof src === "string" ? src.slice(src.lastIndexOf("/") + 1) : src.name);

// One import at a time across all calls: the duplicate check and citekey choice only see finished imports.
let queue = Promise.resolve();
export const importPdfs = (sources: Source[]) => (queue = queue.then(() => importAll(sources)));

async function importAll(paths: Source[]) {
  for (const path of paths) {
    useImports.setState((s) => ({ pending: s.pending + 1 }));
    try {
      const { citekey } = await importPdf(path);
      // A single PDF (new or already in the library) opens; a batch just lands in the list.
      if (paths.length === 1) await showPaper(citekey);
    } catch (err) {
      console.error("import failed", path, err);
      useImports.setState((s) => ({ errors: [...s.errors, `${nameOf(path)}: ${err}`] }));
    } finally {
      useImports.setState((s) => ({ pending: s.pending - 1 }));
    }
  }
}

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

async function importPdf(src: Source): Promise<{ citekey: string; duplicate: boolean }> {
  const bytes = typeof src === "string" ? await readFile(src) : new Uint8Array(await src.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const papers = Object.values(usePapers.getState().papers);
  const bySha = papers.find((p) => p.sha256 === sha256);
  if (bySha) return { citekey: bySha.citekey, duplicate: true };

  const meta = await readMeta(bytes.slice(), nameOf(src)); // pdf.js detaches the buffer it is given
  const dup = papers.find((p) => same(p.doi, meta.doi) || same(p.arxiv, meta.arxiv));
  if (dup) return { citekey: dup.citekey, duplicate: true };

  const taken = new Set((await listDir("papers")).map((e) => e.name));
  const citekey = makeCitekey(meta, nameOf(src), taken);
  await mkdir(abs(`papers/${citekey}`));
  try {
    await writeFile(abs(`papers/${citekey}/paper.pdf`), bytes);
    const file: PaperFile = { ...meta, sha256, addedAt: new Date().toISOString(), highlights: [] };
    await usePapers.getState().add(citekey, file);
  } catch (err) {
    // Don't leave a folder without paper.json: invisible in the library, yet holding the citekey.
    await remove(abs(`papers/${citekey}`), { recursive: true }).catch(() => {});
    throw err;
  }
  return { citekey, duplicate: false };
}

/** DOI/arXiv from page 1 (or 2) → online lookup → PDF info dict → filename. */
async function readMeta(bytes: Uint8Array, filename: string): Promise<Meta> {
  const task = pdfjs.getDocument({ data: bytes });
  try {
    const doc = await task.promise;
    let ids = findIds(await pageText(doc, 1));
    if (!ids.doi && !ids.arxiv && doc.numPages > 1) ids = findIds(await pageText(doc, 2));
    const online = await lookup(ids).catch((err) => (console.warn("metadata lookup failed", err), null));
    if (online?.title) return online;

    const info = (await doc.getMetadata()).info as { Title?: string; Author?: string };
    // ponytail: PDF Author fields have no standard format; assumes "Given Family" separated by , ; or "and".
    const authors = (info.Author ?? "").split(/\s*(?:[,;&]|\band\b)\s*/).filter(Boolean).map(splitName);
    return { ...ids, title: info.Title?.trim() || filename.replace(/\.pdf$/i, ""), authors };
  } finally {
    task.destroy();
  }
}

async function pageText(doc: pdfjs.PDFDocumentProxy, n: number) {
  const { items } = await (await doc.getPage(n)).getTextContent();
  return items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : "") : "")).join("");
}

// The arXiv ID wins over a DOI: the arXiv stamp is always the paper itself, a DOI on page 1 may be a citation.
async function lookup({ doi, arxiv }: { doi?: string; arxiv?: string }): Promise<Meta | null> {
  const opts = { connectTimeout: 10_000, signal: AbortSignal.timeout(20_000) };
  if (arxiv) {
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxiv)}`, opts);
    if (!res.ok && !doi) throw new Error(`arXiv: HTTP ${res.status}`);
    const meta = res.ok ? parseArxiv(await res.text()) : null;
    if (meta || !doi) return meta; // unknown arXiv ID: fall through to the DOI
  }
  if (doi) {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, opts);
    if (!res.ok) throw new Error(`CrossRef: HTTP ${res.status}`);
    return parseCrossref(await res.json());
  }
  return null;
}

/**
 * Imports PDFs dropped anywhere on the window. Tauri's own drop handler is off (dragDropEnabled: false):
 * on macOS it swallows every drag, so highlight drags inside the app could never drop.
 * Capture phase, so the note editor and canvas never see file drops.
 */
export function usePdfDropImport() {
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // otherwise WebKit navigates to the dropped file
      e.dataTransfer!.dropEffect = "copy";
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const pdfs = [...e.dataTransfer!.files].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
      if (!pdfs.length) return;
      useUI.getState().setSidebarTab("library");
      importPdfs(pdfs);
    };
    window.addEventListener("dragover", over, true);
    window.addEventListener("drop", drop, true);
    return () => {
      window.removeEventListener("dragover", over, true);
      window.removeEventListener("drop", drop, true);
    };
  }, []);
}
