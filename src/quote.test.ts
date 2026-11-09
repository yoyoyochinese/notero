import { expect, test } from "vitest";
import { authorLabel, formatQuote, parseHighlightLink } from "./quote";
import type { Highlight, Paper } from "./types";

const paper: Paper = {
  citekey: "vaswani2017attention",
  title: "Attention Is All You Need",
  authors: [{ family: "Vaswani" }, { family: "Shazeer" }, { family: "Parmar" }],
  year: 2017,
  sha256: "x",
  addedAt: "",
  highlights: [],
};
const hl: Highlight = {
  id: "hl-1a2b3c4d",
  page: 3,
  rects: [],
  text: "The Transformer\nfollows this   overall architecture",
  color: "yellow",
  comment: "",
  createdAt: "",
};

test("formats a quote with a link back to the highlight", () => {
  expect(formatQuote(paper, hl)).toBe(
    "> The Transformer follows this overall architecture\n" +
      "> — [Vaswani et al. 2017, p.3](notero://vaswani2017attention/hl-1a2b3c4d)",
  );
});

test("appends the comment and survives missing year", () => {
  const q = formatQuote({ ...paper, year: undefined, authors: [{ family: "A" }, { family: "B" }] }, { ...hl, comment: " key idea " });
  expect(q).toBe("> The Transformer follows this overall architecture\n> — [A & B, p.3](notero://vaswani2017attention/hl-1a2b3c4d)\n\nkey idea");
});

test("link round-trips and rejects other URLs", () => {
  expect(parseHighlightLink("notero://vaswani2017attention/hl-1a2b3c4d")).toEqual({ citekey: "vaswani2017attention", id: "hl-1a2b3c4d" });
  expect(parseHighlightLink("https://example.com")).toBeNull();
  expect(authorLabel([])).toBe("Unknown");
});
