# Notes worker — Wave 1 report (commit 641e387), condensed by coordinator

All of section 3 done; 11 tests, tsc, build pass; app not run. Uses plugin-dialog ask/message.
- Live preview: markup hidden / math rendered except on cursor/selection lines, only while the editor has focus (so canvas cards don't show line 1 raw). readOnly = all rendered. Headings, bold/italic/code, links, wikilinks (name/alias), `$…$`, `$$…$$`, `$$` blocks (KaTeX; `$5 and $6` stays plain), blockquotes. Own lezer rules + decorations, no new lib.
- Links (handler inside MarkdownEditor, so canvas cards get it): `[[Name]]` → notes/ + papers/*/notes/ (exact case, then case-insensitive, first sorted path → free notes win), else create `notes/Name.md`; notero:// → jumpTo (missing highlight → message); http(s) → openUrl.
- Insert: own paragraph; mid-line cursor → after that line.
- NoteList: sorted, open highlighted, New note → Untitled + rename mode, rename (double-click, Enter/blur/Escape; refuses `/` and leading `.`), delete (ask → trash → close), refresh after actions and when open note changes.
- Files: `src/notes/{MarkdownEditor.tsx, NoteEditor.tsx, NoteList.tsx, NotesPanel.tsx, links.ts, insert.ts, notes.css, notes.test.ts}`; dep `@codemirror/commands` declared (already transitive).
- MarkdownEditor props: `value`, `onChange` (user edits only), `readOnly?` (runtime-changeable), `className?` (appended to "md-editor"; use "nodrag nowheel" in React Flow), `viewRef?`. Sizes to content.
- Proposals: flush before rename (done centrally); PDF drop handler must only act on file drops.
- Open (conservative): insert in freshly opened note goes to top (cursor at 0) — end of note is a one-liner; `[x](other.md)` links do nothing; `[[a#heading]]` doesn't scroll; case-only rename refused (now fixed centrally).
- Not done: setext heading markup; `$$` in blockquote; GFM (tables, strikethrough, autolinks); decorations recomputed for whole doc on cursor move.
