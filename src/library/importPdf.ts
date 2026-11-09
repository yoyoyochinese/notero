// PDF import: copy into papers/<citekey>/paper.pdf with metadata (DECISIONS.md 4–6, 21).
import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { copyFile, mkdir, readFile } from "@tauri-apps/plugin-fs";
import { fetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { usePapers } from "../papers";
import { pdfjs } from "../pdfjs";
import { useUI } from "../store";
import type { PaperFile } from "../types";
import { abs, listDir } from "../vault";
import { findIds, makeCitekey, type Meta, parseArxiv, parseCrossref, splitName } from "./metadata";

/** Import progress, global so the drop hook can live outside the Library panel. */
export const useImports = create<{ pending: number; errors: string[] }>(() => ({ pending: 0, errors: [] }));

export async function importPdfs(paths: string[]) {
  for (const path of paths) {
    useImports.setState((s) => ({ pending: s.pending + 1 }));
    try {
      const { citekey, duplicate } = await importPdf(path);
      if (duplicate) useUI.getState().openPaper(citekey);
    } catch (err) {
      console.error("import failed", path, err);
      useImports.setState((s) => ({ errors: [...s.errors, `${basename(path)}: ${err}`] }));
    } finally {
      useImports.setState((s) => ({ pending: s.pending - 1 }));
    }
  }
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

async function importPdf(path: string): Promise<{ citekey: string; duplicate: boolean }> {
  const bytes = await readFile(path);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const papers = Object.values(usePapers.getState().papers);
  const bySha = papers.find((p) => p.sha256 === sha256);
  if (bySha) return { citekey: bySha.citekey, duplicate: true };

  const meta = await readMeta(bytes, basename(path));
  const dup = papers.find((p) => same(p.doi, meta.doi) || same(p.arxiv, meta.arxiv));
  if (dup) return { citekey: dup.citekey, duplicate: true };

  const taken = new Set((await listDir("papers")).map((e) => e.name));
  const citekey = makeCitekey(meta, basename(path), taken);
  await mkdir(abs(`papers/${citekey}`));
  await copyFile(path, abs(`papers/${citekey}/paper.pdf`));
  const file: PaperFile = { ...meta, sha256, addedAt: new Date().toISOString(), highlights: [] };
  await usePapers.getState().add(citekey, file);
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
    if (!res.ok) throw new Error(`arXiv: HTTP ${res.status}`);
    return parseArxiv(await res.text());
  }
  if (doi) {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, opts);
    if (!res.ok) throw new Error(`CrossRef: HTTP ${res.status}`);
    return parseCrossref(await res.json());
  }
  return null;
}

/** Imports PDFs dropped anywhere on the window. Tauri's drop event is the only way to get file paths. */
export function usePdfDropImport() {
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type !== "drop") return;
      const pdfs = e.payload.paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
      if (!pdfs.length) return;
      useUI.getState().setSidebarTab("library");
      importPdfs(pdfs);
    });
    return () => void unlisten.then((f) => f());
  }, []);
}
