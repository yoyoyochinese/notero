// Pure parts of the import pipeline: ID extraction, API response parsing, citekeys (DECISIONS.md 4, 21).
import type { Author, PaperFile } from "../types";

export type Meta = Pick<PaperFile, "title" | "authors" | "year" | "venue" | "doi" | "arxiv">;

const ARXIV_DOI = /^10\.48550\/arxiv\.(.+)$/i;

/** DOI and arXiv ID found in a page of text. A 10.48550/arXiv.* DOI counts as an arXiv ID. */
export function findIds(text: string): { doi?: string; arxiv?: string } {
  let doi = /\b10\.\d{4,9}\/[^\s"<>]+/.exec(text)?.[0];
  if (doi) {
    // Trailing punctuation belongs to the sentence; a closing bracket only if it is unbalanced.
    const count = (c: string) => doi!.split(c).length - 1;
    for (;;) {
      const last = doi.slice(-1);
      const open = { ")": "(", "]": "[" }[last];
      if (/[.,;:'"]/.test(last) || (open && count(open) < count(last))) doi = doi.slice(0, -1);
      else break;
    }
  }
  const arxiv =
    /\barXiv:\s*(\d{4}\.\d{4,5})/i.exec(text)?.[1] ??
    /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i.exec(text)?.[1] ??
    /\b([a-z]+(?:-[a-z]+)?(?:\.[A-Z]{2})?\/\d{7})/.exec(text)?.[1];
  const fromDoi = doi && ARXIV_DOI.exec(doi)?.[1].replace(/v\d+$/, "");
  if (fromDoi) return { arxiv: fromDoi };
  return { ...(doi && { doi }), ...(arxiv && { arxiv }) };
}

const clean = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** "Ashish Vaswani" -> { family: "Vaswani", given: "Ashish" } */
export function splitName(name: string): Author {
  const parts = clean(name).split(" ");
  const family = parts.pop() ?? "";
  return parts.length ? { family, given: parts.join(" ") } : { family };
}

type CrossrefWork = {
  title?: string[];
  author?: { family?: string; given?: string; name?: string }[];
  issued?: { "date-parts"?: (number | null)[][] };
  "container-title"?: string[];
  DOI?: string;
};

/** Body of https://api.crossref.org/works/<doi>. */
export function parseCrossref(json: { message: CrossrefWork }): Meta {
  const m = json.message;
  return {
    title: clean(m.title?.[0] ?? ""),
    authors: (m.author ?? [])
      .map((a) => (a.family ? { family: a.family, ...(a.given && { given: a.given }) } : { family: a.name ?? "" }))
      .filter((a) => a.family),
    year: m.issued?.["date-parts"]?.[0]?.[0] ?? undefined,
    venue: m["container-title"]?.[0] ? clean(m["container-title"][0]) : undefined,
    doi: m.DOI,
  };
}

/** Body of https://export.arxiv.org/api/query?id_list=<id>; null if the ID is unknown. */
export function parseArxiv(xml: string): Meta | null {
  const entry = new DOMParser().parseFromString(xml, "application/xml").querySelector("entry");
  const get = (tag: string) => entry?.getElementsByTagName(tag)[0]?.textContent ?? undefined;
  const id = /arxiv\.org\/abs\/(.+?)(v\d+)?$/.exec(get("id") ?? "")?.[1];
  if (!entry || !id) return null;
  return {
    title: clean(get("title") ?? ""),
    authors: [...entry.getElementsByTagName("author")].map((a) => splitName(a.getElementsByTagName("name")[0]?.textContent ?? "")),
    year: Number(get("published")?.slice(0, 4)) || undefined,
    venue: get("arxiv:journal_ref") ? clean(get("arxiv:journal_ref")!) : "arXiv",
    doi: get("arxiv:doi"),
    arxiv: id,
  };
}

const STOPWORDS = new Set(["a", "an", "the", "on", "of", "in", "for", "to", "and", "with", "is", "are"]);
const ascii = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Decision 21. `taken` holds the existing folder names under papers/. */
export function makeCitekey(m: Pick<Meta, "title" | "authors" | "year">, filename: string, taken: Set<string>) {
  const family = ascii(m.authors[0]?.family ?? "");
  const word = m.title.split(/\s+/).map(ascii).find((w) => w && !STOPWORDS.has(w)) ?? "";
  const stem = ascii(filename.replace(/\.pdf$/i, "")).slice(0, 40) || "paper";
  const base = family ? `${family}${m.year ?? ""}${word}` : stem;
  let key = base;
  for (let n = 1; taken.has(key); n++) key = base + suffix(n);
  return key;
}

/** 1 -> a, 26 -> z, 27 -> aa */
function suffix(n: number): string {
  return n ? suffix(Math.floor((n - 1) / 26)) + String.fromCharCode(97 + ((n - 1) % 26)) : "";
}
