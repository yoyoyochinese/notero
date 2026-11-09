// How a highlight appears in Markdown (notes and canvas cards), and its notero:// link.
import type { Author, Highlight, HighlightColor, Paper } from "./types";

export function authorLabel(authors: Author[]) {
  const f = authors.map((a) => a.family);
  if (f.length === 0) return "Unknown";
  if (f.length === 1) return f[0];
  if (f.length === 2) return `${f[0]} & ${f[1]}`;
  return `${f[0]} et al.`;
}

export const highlightLink = (citekey: string, id: string) => `notero://${citekey}/${id}`;

export function parseHighlightLink(href: string) {
  const m = /^notero:\/\/([^/\s]+)\/(hl-[0-9a-f]+)$/.exec(href);
  return m ? { citekey: m[1], id: m[2] } : null;
}

/**
 * > quoted text
 * > — [Smith et al. 2024, p.3](notero://smith2024attention/hl-1a2b3c4d)
 *
 * comment (only if there is one)
 */
export function formatQuote(paper: Paper, h: Highlight) {
  const text = h.text.replace(/\s+/g, " ").trim();
  const cite = `${authorLabel(paper.authors)}${paper.year ? ` ${paper.year}` : ""}, p.${h.page}`.replace(/[[\]]/g, "\\$&");
  const out = `> ${text}\n> — [${cite}](${highlightLink(paper.citekey, h.id)})`;
  return h.comment.trim() ? `${out}\n\n${h.comment.trim()}` : out;
}

/** JSON Canvas preset color for a highlight card ("1" red … "6" purple). */
export const canvasColor: Record<HighlightColor, string> = {
  red: "1",
  yellow: "3",
  green: "4",
  blue: "5",
  purple: "6",
};

/** MIME type set alongside text/plain (= formatQuote) when dragging a highlight. */
export const HIGHLIGHT_MIME = "application/x-notero-highlight"; // JSON: { citekey, id }
