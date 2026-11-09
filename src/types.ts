// Shared data model. See DECISIONS.md for the on-disk layout.

export type Author = { family: string; given?: string };

export type HighlightColor = "yellow" | "red" | "green" | "blue" | "purple";

/** Page-relative rectangle: fractions of page width/height, origin top-left. */
export type Rect = { x1: number; y1: number; x2: number; y2: number };

export type Highlight = {
  id: string; // "hl-" + 8 random hex chars
  page: number; // 1-based
  rects: Rect[];
  text: string;
  color: HighlightColor;
  comment: string;
  createdAt: string; // ISO 8601
};

/** Contents of papers/<citekey>/paper.json */
export type PaperFile = {
  title: string;
  authors: Author[];
  year?: number;
  venue?: string;
  doi?: string;
  arxiv?: string;
  sha256: string; // of paper.pdf, for duplicate detection
  addedAt: string; // ISO 8601
  highlights: Highlight[];
};

/** In-memory paper: the citekey is the folder name, not stored in the file. */
export type Paper = PaperFile & { citekey: string };
