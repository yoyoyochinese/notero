// Highlight geometry: selection client rects -> page-relative fractions (DECISIONS 22), and back.
import type { Highlight, Rect } from "../types";

/** Anything shaped like a DOMRect. */
export type Box = { left: number; top: number; width: number; height: number };

export const newHighlightId = () =>
  "hl-" + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Unions boxes on the same line that touch or nearly touch (gap under half a line height, so word
 * spaces merge but column gutters don't). Works in any units; returns rects sorted top to bottom.
 */
export function mergeLines(rects: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const r of [...rects].sort((a, b) => a.x1 - b.x1)) {
    const h = r.y2 - r.y1;
    const m = out.find((o) => {
      const overlap = Math.min(o.y2, r.y2) - Math.max(o.y1, r.y1);
      return overlap >= 0.5 * Math.min(h, o.y2 - o.y1) && r.x1 <= o.x2 + 0.5 * h;
    });
    if (!m) out.push({ ...r });
    else Object.assign(m, { x1: Math.min(m.x1, r.x1), y1: Math.min(m.y1, r.y1), x2: Math.max(m.x2, r.x2), y2: Math.max(m.y2, r.y2) });
  }
  return out.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Client rects of a selection on one page -> merged page fractions (0-1, origin top-left). */
export function toPageRects(page: Box, rects: Box[]): Rect[] {
  const px = rects
    .map((r) => ({
      x1: Math.max(r.left, page.left),
      y1: Math.max(r.top, page.top),
      x2: Math.min(r.left + r.width, page.left + page.width),
      y2: Math.min(r.top + r.height, page.top + page.height),
    }))
    // Empty boxes come from line breaks; very tall ones from pdf.js's full-page endOfContent filler.
    .filter((r) => r.x2 > r.x1 && r.y2 > r.y1 && r.y2 - r.y1 < 0.1 * page.height);
  return mergeLines(px).map((r) => ({
    x1: clamp((r.x1 - page.left) / page.width),
    y1: clamp((r.y1 - page.top) / page.height),
    x2: clamp((r.x2 - page.left) / page.width),
    y2: clamp((r.y2 - page.top) / page.height),
  }));
}

/** The topmost (last drawn) highlight on `page` covering the point (page fractions). */
export const hitTest = (hs: Highlight[], page: number, x: number, y: number) =>
  hs.filter((h) => h.page === page && h.rects.some((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)).pop();

/** Reading order: page, then top, then left. */
export const byPosition = (a: Highlight, b: Highlight) =>
  a.page - b.page || (a.rects[0]?.y1 ?? 0) - (b.rects[0]?.y1 ?? 0) || (a.rects[0]?.x1 ?? 0) - (b.rects[0]?.x1 ?? 0);
