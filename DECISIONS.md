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

## User feedback after the first hands-on use (2026-11-09)

48. **The sidebar no longer collapses when a paper opens** (user: "pdfを開くと、一覧を見れなくなります"; supersedes that part of decision 9). It is hidden/shown with the button in its header (a 40 px rail with the same button when hidden) or ⌘\.
49. **Opening a paper from the library** (or importing a single PDF) shows its most recently edited note; a paper without notes gets `papers/<ck>/notes/<citekey>.md` starting with `# <title>` (user: "noteがない場合は、一つ自動的に作成"). A free note that is open stays open (decision 9); following a `notero://` link never switches notes.
50. **Q33 — a single imported PDF opens** (new or already in the library); importing several opens nothing (supersedes decision 6 for batches).
51. **Q34 — CSP on.** Production: `default-src 'self' ipc: http://ipc.localhost; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'none'`, with Tauri's style nonce injection disabled (CodeMirror/KaTeX set inline styles; a nonce would void `'unsafe-inline'`). `devCsp` adds the Vite preamble and HMR socket. Verified against the production build in Chromium: inline scripts blocked; PDF, text layer, KaTeX fonts, CodeMirror and React Flow work.
52. **UI conventions**: every pane header is 40 px with the same tab/button style; list rows (Library, Notes, Canvases) share hover/selected styles; notes and cards use the UI's proportional font (code stays monospace), the Note tab has a 760 px measure; `-`/`*`/`+` list markers render as bullets; PDF pages sit on a grey "desk" with gaps; empty panes offer the next action. The React Flow attribution stays (its authors ask to keep it without a Pro subscription).

## User feedback round 2 (2026-11-09)

53. **Q35 (a) — one canvas per paper**: `papers/<ck>/<ck>.canvas`, created the first time the Canvas tab is shown with that paper open (or from "Canvas" in the paper's library row). Opening a paper shows its canvas unless a canvas from `canvases/` is open (those span papers and stay, like free notes). Cross-paper canvases are still made in the Canvases tab.
54. **Q36 — the highlight list is the sidebar's 4th tab, "Highlights"** (the open paper's highlights), so the PDF keeps its width. The PDF header's "Highlights N" button toggles that tab; click jumps and flashes, drag into a note/canvas as before (decision 28).
55. **Resizable sidebar** (user request): a collapsible panel in the same splitter group as PDF and notes, 200–560 px (default 280), keeps its pixel width when the window resizes, can be dragged shut; layout remembered (localStorage). Tabs show icons, with the label on the active tab (all labels from 420 px).
56. **Theme: Ayu Mirage** (user request), always — replaces following the OS light/dark (that part of decision 18). Colours from the official `ayu` package (`themes/mirage.yaml`): editor bg `#242936`, UI bg `#1f2430`, fg `#cccac2`, muted `#707a8c`, accent `#ffcc66`, links `#5ccfe6`, selection `#409fff40`. Canvas presets 1–6 use Ayu's red/orange/yellow/green/cyan/purple. PDF pages stay white.
57. **Canvas colours** (user: "背景色を変えられるように"): each canvas has a background colour, saved in the `.canvas` as `"notero": { "background": … }` (our namespace; Obsidian ignores it). Presets are 22 % tints of the theme background (full-strength presets made cards unreadable); a colour from the native picker is used as is. Selected cards and arrows can be coloured too (the JSON Canvas `color` field Obsidian uses).

58. **`dragDropEnabled: false`** on the window. With Tauri's drop handler on, wry swallows every native drag on macOS (`perform_drag_operation` returns before WebKit), so in-app HTML5 drops (highlight → note/canvas) never fired — confirmed in wry 0.57 source and by the user. PDFs dropped on the window are now imported from the HTML5 `File` (bytes, no path); this also lifts the fs-scope limit on where a dropped PDF may come from. Supersedes the drop mechanism in decisions 5 and 40.

## Optimization phase (2026-11-09)

Measured first (harness benchmark on the production build: 300 papers, 3000-line note, 300-card canvas; release app idle footprint), then changed only what the numbers pointed at.

59. **Canvas**: no serialisation while a card is being dragged (the drop writes once); the flow isn't re-rendered for its own saves (`memo`); a drag cut short by closing the canvas is still saved; below 45 % zoom cards show plain text instead of a CodeMirror instance each; the opening viewport is computed from the file (React Flow's `fitView` first rendered every card at zoom 1).
60. **Fewer IPC round trips**: `mtimeOf` / `listDir` call `stat` / `readDir` directly and fall back to `exists` only on error (startup 913 → 610 calls for 300 papers, a save 6 → 4); paper.json files load in parallel.
61. **Bundle**: the Markdown language is built from `commonmarkLanguage` (+ its list keymap and paste-URL-as-link) instead of `markdown()`, which always bundled lang-html, lang-css and autocomplete (~430 KB); KaTeX loads with the first formula (its widget renders asynchronously, no Suspense); only KaTeX's woff2 fonts are bundled (Vite plugin). Main JS 1.9 MB → 1.46 MB, dist 4.3 MB → 3.4 MB. **Not** code-split: the PDF pane and the canvas — tried with `React.lazy`, but React 19 holds a revealed Suspense boundary for 300 ms, so the first PDF/canvas open got ~300 ms slower while startup didn't measurably improve.
62. **Rust**: `tauri-plugin-http` without default features — macOS native TLS instead of bundled rustls, no cookies/HTTP2/charset (only two JSON APIs are called); unused `serde` dependency removed.
63. **Shell re-renders**: `App` and `RightPane` subscribe to the store fields they show (`useShallow`) instead of the whole store.
64. **Not changed, on purpose**: the editor still decorates the whole note on each change (7 ms per keystroke at 3000 lines, within a frame; restrict to `visibleRanges` if long notes lag); pdf.js page cache left at its defaults (can't be measured meaningfully outside the real app).

## After the optimization phase (2026-11-09)

65. **Dev-only reload for stateful modules** (`vault.ts`, `papers.ts`, `store.ts`, `importPdf.ts`): a Vite hot update of one of them reloads the page. Cause of the user's "This paper is no longer in the library." after a Finder drop: the hot update left two store instances, and the window's drop listener imported into the old one (reproduced in the harness; the import itself had succeeded on disk). Release builds have no hot updates.
66. **Logo** (`src/assets/logo.svg`): a page with a yellow highlight linked to a cyan note card, Ayu Mirage colours, macOS icon grid (824 px squircle on 1024). App icons generated with `tauri icon` (desktop sizes only; Android/iOS sets deleted); also shown on the welcome screen.

## Vim and typing lag (2026-11-09)

67. **Vim keybindings** (user request, no on/off switch): `@replit/codemirror-vim` 6.4.0 in every editable Markdown editor (notes and canvas cards being edited); read-only previews get none, else each idle card would draw a vim cursor. Highest precedence so Enter/Backspace in normal mode move instead of running the Markdown list keymap. `:w` flushes the autosave immediately. Editing a canvas card starts in normal mode.
68. **pdf.js patched** (`patches/pdfjs-dist@6.5.438.patch`, applied by `bun install`): `TextLayerBuilder`'s global `selectionchange`/`keyup` handler re-appended each rendered text layer's end marker even when it already was the last child, i.e. on every keystroke anywhere in the app. In WebKit that cost ~6–7 ms per key with a paper open — about half of the typing cost (measured in Playwright WebKit with a main-thread busy meter, A/B by skipping only that append). The patch skips the no-op; text selection in the PDF behaves the same (checked). Still in pdf.js 6.5.438 (latest); drop the patch when upstream fixes it.
69. **j/k and formulas** (user report: j/k skip formulas and act oddly around them). Two causes: (a) codemirror-vim's j/k move through the rendered view first and treat landing past the next line as folded text, and CodeMirror's vertical motion deliberately skips block widgets, so a rendered formula was jumped over → `moveByLines` redefined to move by document line (column memory, counts, `+`/`-`/`_` as before); (b) KaTeX's display margins collapsed out of our widget, so CodeMirror measured formulas ~30 px short and every line below was mapped to the wrong height (vertical motion and mouse clicks landed on neighbouring lines) → `display: flow-root` on `.cm-md-math-block`. Insert-mode arrow keys (CodeMirror's own motion, which skips block widgets by design) now stop on the formula's lines too: a move that would pass more than one line stops on the next line (user request; also Shift+arrows).

## UI widths (2026-11-10)

70. **Default pane widths** (user request): sidebar 280 → 320 px; the PDF pane gets 55% of the width the sidebar leaves, the note/canvas pane the rest (1400 px window: 320 / 594 / 484). The layout storage id became `notero-layout-2`, because a layout saved after a drag overrides the defaults (the user's app had one). Double-clicking the PDF | note separator resets that split.

## Memory (2026-11-12)

User: the `tauri://localhost` process (WKWebView WebContent) uses 600–700 MB. Measured in the running app (`footprint`: peak 608 MB, mostly graphics + WebKit Malloc) and reproduced in Playwright WebKit with the user's vault (5 papers): reading one paper ~455 MB (WebContent + GPU), switching papers grew it to 620 MB, peak 870. Causes and fixes:

71. **Closing a PDF destroys its page views** before `setDocument(null)`: pdf.js only drops them, so up to 10 page canvases (~7–10 MB each at 2×) waited for the GC.
72. **pdf.js's annotation editor is off** (`annotationEditorMode: DISABLE`). Highlights are Notero's own overlay, so nothing used it; in WebKit (not Chromium) its default NONE mode kept closed `PDFViewer`s, with their pages and our closures, alive (15 of 15 after 15 opens; DISABLE: only the open one). What inside the editor holds them was not found — turning the editor on would bring the leak back.
73. **Q (user, 2026-11-12) — pdf.js keeps 5 rendered pages instead of 10** (patch `DEFAULT_CACHE_SIZE`) **and `maxCanvasPixels` = 2²²** (default 2²⁵, capped at 2× the screen area ≈ 43 MB per page here); supersedes the "page cache left at its defaults" part of decision 64. A page-width page in a pane under ~950 px is unaffected; zoomed pages get a lower-resolution canvas plus a sharp one for the visible part. Cost: scrolling back more than 2 pages re-renders; zoomed pages look soft for a moment while scrolling.
74. **pdf.js FontLoader patched**: don't await `loaded` for a FontFace that is already `"loaded"` (always true in WebKit for fonts built from data). Touching that promise makes WebKit keep the FontFace and its font data forever (~20 per opened paper; Chromium frees them). Failed fonts still take the fallback path. Saves little once 71–72 are in (reviewer: 2–13 MB over 15 opens) but stops the growth; drop when WebKit or pdf.js fixes it. `local()` system fonts still leak ~2 per paper (no font data). The patch file now has three hunks (68, 73, 74).
75. **Not changed, measured**: one shared pdf.js worker for all documents grew faster in WebKit (+20 MB per 5 opens vs +10 with a worker per document, whose heap is freed on terminate); `disableFontFace` (unneeded after 74, changes glyph rendering); the highlight layer's `mix-blend-mode` (no difference).

## Open

1. **Hands-on check of the real app** — confirmed by the user: highlight drop into notes/canvas, metadata lookup. Still open: Finder PDF drop after decision 65, selection rects on real papers, quit flush. The same flows pass in a Chromium harness with mocked Tauri APIs; WKWebView is unverified. — needs the user.
2. **Memory in the real app (decisions 71–74)** — all numbers come from Playwright WebKit, not Tauri's WKWebView. Check in Activity Monitor (`tauri://localhost`) after a release build: open and switch papers for a while, zoom, scroll back; also whether the 5-page cache's re-render when scrolling back is acceptable. — needs the user.
