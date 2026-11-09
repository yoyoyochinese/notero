# PDF worker — Wave 1 report (commit b9ac4a6), condensed by coordinator

All of section 3 done; tests (6 new), tsc, build pass; app not run.
- Viewer: pdf.js `PDFViewer` + EventBus + PDFLinkService. Workarounds: import `../pdfjs` before `pdf_viewer.mjs` (reads `globalThis.pdfjsLib`); `content-box` inside scroll container (App.css border-box breaks layout); own ResizeObserver re-applies page-width.
- Header: title, page/total, −, zoom % (click = fit width), +, "Highlights N" toggle. Empty/missing/error states.
- Overlays: `.hl-layer` re-added on each `pagerendered`, highlights rendered via portal, percentage positions; layer is pointer-events:none, clicks hit-tested against rects.
- Cross-page selection: cut at end of first page (selection visibly shortened).
- Selection popup: 5 colours, Comment (yellow + edit popup), Insert into note (yellow, waits for save, then insert). Edit popup: colour, comment (saved on close), delete, insert. Close on Escape/outside/scroll.
- List: sorted page/top/left; click scrolls+flashes; draggable with text/plain + HIGHLIGHT_MIME.
- Jump waits for `pagesinit`; last nonce per module so old jumps don't replay.
- External PDF links → `openUrl`.
- Files: `src/pdf/{PdfPane.tsx, geometry.ts, geometry.test.ts, pdf.css}`. No proposals. Bundle ~900 KB JS, pdf_viewer.css ~230 KB.
- Open (conservative): cross-page cut; Comment/Insert create yellow; same-line merge rule (≥ half-line vertical overlap, gap < half line height).
- Not done: popup when selection drag ends outside PDF; Cmd +/− zoom; `abortSignal` (dev-only idle observer leak).
- Verify: DnD vs dragDropEnabled; rect alignment on 2-column paper/headings; 30+ pages smoothness; dark mode white pages; insert with no note open (NoteEditor must keep `insert` until loaded; Notes list refresh); openUrl permission; notero:// jump to a non-open paper.
