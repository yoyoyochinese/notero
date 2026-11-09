import { expect, test } from "vitest";
import type { Highlight } from "../types";
import { byPosition, hitTest, mergeLines, newHighlightId, toPageRects } from "./geometry";

const page = { left: 100, top: 50, width: 600, height: 800 };
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

test("id format", () => {
  expect(newHighlightId()).toMatch(/^hl-[0-9a-f]{8}$/);
  expect(newHighlightId()).not.toBe(newHighlightId());
});

test("client rects become page fractions", () => {
  expect(toPageRects(page, [box(160, 130, 300, 16)])).toEqual([{ x1: 0.1, y1: 0.1, x2: 0.6, y2: 0.12 }]);
});

test("rects are clipped to the page; empty and page-tall ones dropped", () => {
  expect(toPageRects(page, [box(40, 130, 120, 16)])).toEqual([{ x1: 0, y1: 0.1, x2: 0.1, y2: 0.12 }]);
  expect(toPageRects(page, [box(200, 130, 0, 16), box(100, 50, 600, 800), box(800, 130, 50, 16)])).toEqual([]);
});

test("word fragments and duplicate span/text boxes on one line merge", () => {
  const merged = toPageRects(page, [
    box(400, 130, 100, 16), // out of order
    box(160, 130, 100, 16),
    box(264, 131, 130, 15), // 4px word gap, slightly different baseline
    box(160, 130, 100, 16), // same box twice (span + its text node)
  ]);
  expect(merged).toEqual([{ x1: 0.1, y1: 0.1, x2: 2 / 3, y2: 0.12 }]);
});

test("separate lines and separate columns stay separate, sorted top to bottom", () => {
  const r = mergeLines([
    { x1: 0, y1: 20, x2: 100, y2: 30 },
    { x1: 0, y1: 0, x2: 100, y2: 10 },
    { x1: 130, y1: 0, x2: 200, y2: 10 }, // 30-unit gutter > half the line height
  ]);
  expect(r).toEqual([
    { x1: 0, y1: 0, x2: 100, y2: 10 },
    { x1: 130, y1: 0, x2: 200, y2: 10 },
    { x1: 0, y1: 20, x2: 100, y2: 30 },
  ]);
});

const hl = (id: string, pg: number, x1: number, y1: number): Highlight => ({
  id,
  page: pg,
  rects: [{ x1, y1, x2: x1 + 0.2, y2: y1 + 0.02 }],
  text: "",
  color: "yellow",
  comment: "",
  createdAt: "",
});

test("hit test and reading order", () => {
  const hs = [hl("a", 2, 0.1, 0.5), hl("b", 1, 0.5, 0.1), hl("c", 1, 0.1, 0.1), hl("d", 1, 0.15, 0.1)];
  expect(hitTest(hs, 1, 0.2, 0.11)?.id).toBe("d");
  expect(hitTest(hs, 2, 0.2, 0.11)).toBeUndefined();
  expect([...hs].sort(byPosition).map((h) => h.id)).toEqual(["c", "d", "b", "a"]);
});
