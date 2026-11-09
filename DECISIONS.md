# Decisions

Every worker reads this before starting. Numbered; never renumber. Phase: G = grilling with the user, W0/W1/W2 = waves.

## Product (user, 2026-11-09, G)

1. **Platform**: Tauri 2 + React + TypeScript, macOS first. UI English only.
2. **Storage = vault folder of plain files** (Obsidian-compatible), no database:
   ```
   vault/papers/<citekey>/paper.pdf
   vault/papers/<citekey>/paper.json      metadata + highlights (src/types.ts PaperFile)
   vault/papers/<citekey>/notes/*.md      any number of notes per paper
   vault/notes/*.md                       free notes (not tied to a paper)
   vault/canvases/*.canvas                JSON Canvas, global (span papers)
   ```
   A note belongs to a paper only by living in its folder (no frontmatter).
3. **One vault**, chosen on first launch, path remembered (localStorage).
4. **Metadata pipeline**: DOI / arXiv ID from first-page text → CrossRef / arXiv API → else PDF embedded metadata → else filename; user can edit afterwards.
5. **Adding PDFs**: drag & drop onto the window or file dialog; the PDF is **copied** into the vault.
6. **Duplicates**: same DOI, arXiv ID or sha256 as an existing paper → don't add, open the existing one.
7. **Deleting a paper** moves its whole folder to the macOS Trash.
8. **Library list**: title, authors, year, venue; sortable; text filter. No collections/tags/BibTeX yet.
9. **Layout**: collapsible left sidebar with tabs Library / Notes / Canvases; PDF centre, Note/Canvas tabs right; draggable splitter, 50/50 default; opening a paper collapses the sidebar. Opening a free note or canvas keeps the current PDF.
10. **PDF viewer**: pdf.js. Highlights stored in paper.json, the PDF is never modified.
11. **Highlights**: text-selection only, 5 colours (yellow, red, green, blue, purple). Select text → popup (colour, comment, insert into note). Click highlight → edit comment / colour / delete. Toggleable highlight list in the PDF pane: click to jump, drag into a note or canvas.
12. **Notes**: CodeMirror 6 live preview (Obsidian style): headings, emphasis, links, inline code, math (KaTeX). No image paste yet.
13. **Highlight quote in Markdown** (see `src/quote.ts` formatQuote):
    ```md
    > quoted text
    > — [Smith et al. 2024, p.3](notero://smith2024attention/hl-1a2b3c4d)
    ```
    Clicking the link in the app jumps the PDF to the highlight. In Obsidian it is just a quote.
14. **`[[Note name]]` links**: click opens the note (resolved by file name anywhere in the vault); creates it in `notes/` if missing. No autocomplete/backlinks yet.
15. **Canvas**: React Flow, saved as JSON Canvas (`.canvas`, opens in Obsidian). Cards: Markdown text card, embedded note (file node), highlight quote card (stored as a plain text node, so Obsidian shows it). Edge labels. No groups / web-link cards yet.
16. **Saving**: autosave 1 s after typing stops; atomic write (temp file + rename); before saving check the file's mtime and, if another app changed it, don't overwrite — warn and let the user choose. No live reload of external changes yet.
17. **Highlights → notes/canvas ship in the MVP** (the core value of the app).
18. **Tech**: Tauri plugins fs / http / dialog, no custom Rust except `move_to_trash`. zustand for state, react-resizable-panels for the splitter. Follow OS light/dark; PDF pages stay white.
19. **Tests**: vitest for pure logic only (citekey, DOI/arXiv extraction, quote/link format, JSON Canvas conversion, mtime conflict check). UI checked by running the app. No E2E yet.
20. **Process**: Wave 0 (coordinator: foundation) → Wave 1 (4 parallel workers) → Wave 2 (integration) → fresh-context review after each wave. Branch `feat/mvp` off `master`, worktree per worker, no push.

## Coordinator (W0, 2026-11-09)

21. **Citekey** = `<first author family name><year><first title word>`, lowercased ASCII (diacritics stripped, non-alphanumerics dropped), skipping title stopwords (a, an, the, on, of, in, for, to, and, with, is, are). Missing year → omitted; no author → derived from the filename. Taken → append `a`, `b`, … The citekey is fixed at import; editing metadata later does not rename the folder.
22. **Highlight position**: page (1-based) + rects as page-relative fractions (0–1, origin top-left) + selected text. Highlight id = `hl-` + 8 random hex chars.
23. **New notes and canvases** are named `Untitled.md` / `Untitled.canvas`, then `Untitled 1`, `Untitled 2`… (`createFile` in `src/vault.ts`).
24. **Rename / delete** of notes and canvases from the sidebar: rename in place (does not update `[[links]]` pointing at it); delete moves to Trash.
25. **Quote format** includes the highlight's comment as a paragraph after the quote, if any. Author label: `A`, `A & B`, `A et al.`.
26. **Highlight quote card on the canvas** = a JSON Canvas text node whose text is `formatQuote(...)`, coloured with the preset matching the highlight colour (`canvasColor` in `src/quote.ts`). No special node type, so it round-trips through Obsidian.
27. **Embedded note card** (file node) shows the note read-only (rendered); an "Open" action opens it in the Note tab for editing.
28. **Dragging a highlight** sets `text/plain` = formatQuote output and `application/x-notero-highlight` = `{"citekey","id"}` JSON. Drop targets: the note editor (plain text drop) and the canvas (creates a quote card).
29. **"Insert into note"** calls `useUI.requestInsert(markdown)`; if no note is open, first create one in the paper's `notes/` folder and open it. NoteEditor inserts at the cursor and calls `clearInsert()`.
30. **Shared modules owned by the coordinator** (workers propose changes, don't edit): `src/types.ts`, `src/vault.ts`, `src/papers.ts`, `src/store.ts`, `src/useFileDoc.ts`, `src/DocStatusBar.tsx`, `src/quote.ts`, `src/pdfjs.ts`, `src/App.tsx`, `src/RightPane.tsx`, `src/App.css`, `package.json`, `src-tauri/**`.
31. **Workers do not run `tauri dev` / cargo** (each worktree would rebuild Rust). Verification = `bun run test`, `bunx tsc --noEmit`, `bun run build`. The coordinator runs the app at integration.

## Wave 1 workers' defaults, accepted by the coordinator (W1, 2026-11-09)

32. **Metadata**: arXiv ID wins over a DOI found on page 1 (a page-1 DOI may be a cited paper's); arXiv IDs stored without version; arXiv venue = journal ref, else `arXiv`; embedded PDF metadata never supplies a year.
33. **Highlights**: a selection spanning pages is cut at the end of the first page; "Comment" / "Insert into note" from the selection popup create a yellow highlight.
34. **Wikilink resolution**: exact-case match first, then case-insensitive; on duplicates the first sorted path wins (free notes before paper notes).
35. **Canvas**: the file is never rewritten just by opening it; invalid JSON is shown as an error and never saved over; groups and link nodes render as plain movable boxes and round-trip unchanged.
36. **Confirm/alert** use the native plugin-dialog `ask` / `message` (WKWebView `window.confirm` is unreliable).

## Coordinator (W1 review fixes and W2 integration, 2026-11-09)

37. **Unsaved edits are never dropped**: if a document is closed while it can't be saved (conflict or error), the text is written next to it as `<name> (conflict).<ext>` and the user is told. Rename / delete first flush every open document.
38. **fs scope** allows dot path segments (`requireLiteralLeadingDot: false`, needed for the atomic-write temp files) and denies `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/Library/Keychains`.
39. **`move_to_trash`** only accepts canonical paths under `$HOME` or `/Volumes` whose parent folder is `papers`, `notes` or `canvases`.
40. **Dropping a PDF anywhere** imports it and switches the sidebar to the Library tab (where progress and errors show).
41. **Opening a paper's note** (`papers/<ck>/notes/…`) also shows that paper in the PDF pane. Free notes keep the current PDF (decision 9).
42. **Insert into note** goes at the cursor; if the cursor was never placed (still at position 0) it is appended at the end.
43. **Canvas text cards** render read-only (draggable) until double-clicked; editing ends when the card is deselected. Delete/Backspace removes canvas cards only while the canvas was the last thing clicked.

44. **Imports run one at a time** (single queue), so duplicate detection and citekey choice always see finished imports. A failed import leaves no folder behind. An unconfirmed arXiv ID never blocks the DOI lookup.
45. **Quit and window close flush unsaved edits first** (including an open highlight comment); if the webview doesn't answer within 3 s the app quits anyway.
46. **Deleting a paper closes its open note.** Canvas file cards only open vault-relative paths (no `..`, no absolute paths).
47. **fs scope also denies** `~/Library/LaunchAgents` and shell startup files (`.zshrc`, `.zprofile`, `.bashrc`, `.bash_profile`, `.profile`).

## Open

1. **CSP** (`tauri.conf.json` has `"csp": null`). Recommended: add a strict CSP (`default-src 'self'`, plus what pdf.js workers, KaTeX fonts and Tauri IPC need). Needs a check in the running app, so not applied blind. — coordinator recommendation, awaiting the user.
2. **Auto-open a newly imported paper?** Recommended: yes when a single PDF is added, no for multiple. — asked 2026-11-09, awaiting the user.
3. **Hands-on check of the running app** (drag & drop of highlights into notes/canvas vs Tauri's file-drop handler, selection rects, live CrossRef/arXiv, quit flush). — needs the user.
