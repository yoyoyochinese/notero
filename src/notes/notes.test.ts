import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { expect, test } from "vitest";
import { paragraphInsert } from "./insert";
import { parseWikilink, resolveNote } from "./links";
import { decorate, language } from "./MarkdownEditor";

test("parseWikilink", () => {
  expect(parseWikilink("a")).toEqual({ name: "a", label: "a" });
  expect(parseWikilink("a|b")).toEqual({ name: "a", label: "b" });
  expect(parseWikilink("a#heading")).toEqual({ name: "a", label: "a#heading" });
  expect(parseWikilink("a#h|b|c")).toEqual({ name: "a", label: "b|c" });
  expect(parseWikilink(" dir/My Note.md ")).toEqual({ name: "My Note", label: "dir/My Note.md" });
});

test("resolveNote", () => {
  const paths = ["papers/x2024/notes/Idea.md", "notes/idea.md", "notes/Other.md", "papers/a2020/notes/Idea.md"];
  expect(resolveNote("Idea", paths)).toBe("papers/a2020/notes/Idea.md"); // exact case beats notes/idea.md
  expect(resolveNote("IDEA", paths)).toBe("notes/idea.md"); // case-insensitive: notes/ sorts first
  expect(resolveNote("other", paths)).toBe("notes/Other.md");
  expect(resolveNote("Missing", paths)).toBeNull();
});

test("paragraphInsert", () => {
  const q = "> quote";
  const apply = (doc: string, pos: number) => {
    const { from, insert } = paragraphInsert(doc, pos, q);
    return doc.slice(0, from) + insert + doc.slice(from);
  };
  expect(apply("", 0)).toBe("> quote\n\n");
  expect(apply("abc", 3)).toBe("abc\n\n> quote\n\n");
  expect(apply("abc def\nnext", 2)).toBe("abc def\n\n> quote\n\nnext"); // mid-line: after the line
  expect(apply("abc\n", 4)).toBe("abc\n\n> quote\n\n");
  expect(apply("a\n\nb", 2)).toBe("a\n\n> quote\n\nb");
  expect(apply("a\n\n\nb", 3)).toBe("a\n\n> quote\n\nb");
  expect(apply("abc", 0)).toBe("> quote\n\nabc");
});

test("live preview hides markup and renders math except on the cursor line", () => {
  const doc = "# H **b** [[N|alias]] $x$ $5 and $6\n\n$$\ny\n$$\n\ncursor **here**";
  const state = EditorState.create({ doc, extensions: [language], selection: { anchor: doc.length } });
  ensureSyntaxTree(state, doc.length, 5000);
  const seen: string[] = [];
  for (const it = decorate(state, true).iter(); it.value; it.next()) {
    const v = it.value.spec;
    seen.push(`${doc.slice(it.from, it.to)}:${v.widget ? "math" : (v.class ?? "hide")}`);
  }
  expect(seen).toEqual([
    ":cm-md-h1",
    "# :hide",
    "**:hide",
    "**b**:cm-md-strong",
    "**:hide",
    "[[N|:hide",
    "alias:cm-md-link",
    "]]:hide",
    "$x$:math",
    "$$\ny\n$$:math",
    "**:cm-md-mark", // cursor line: raw
    "**here**:cm-md-strong",
    "**:cm-md-mark",
  ]);
});
