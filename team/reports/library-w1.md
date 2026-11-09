# Library worker — Wave 1 report (commit e9b6c93)

Everything in section 3 is built and committed on branch `worktree-agent-a8512d8d50730c098`. `bun run test` (12 tests, 3 files), `bunx tsc --noEmit` and `bun run build` pass. App not run.

## Built
- Library list: title, authors (`authorLabel`, full list on hover), year, venue. Sort by date added (default, newest first), title, first author, year (newest first). Filter matches title, full author names, venue. Click → `openPaper`; open paper highlighted. Row actions on hover: notes ▸, edit ✎, delete ✕.
- Import: bytes → sha256 → skip if hash exists. Page 1 text (page 2 if no ID) → arXiv API or CrossRef (10 s connect / 20 s total timeout) → fallback embedded Title/Author → filename. Then DOI/arXiv duplicate check (case-insensitive), citekey, folder, copy, `usePapers.add`. Duplicates open the existing paper. `useImports` store: "Importing N PDFs…" count + dismissible errors.
- Drag & drop: `usePdfDropImport()` via `getCurrentWebview().onDragDropEvent`, `.pdf` only; mounted in LibraryPanel for now.
- Edit metadata: native `<dialog>` (title required, authors `Family, Given` per line, year, venue, DOI, arXiv) → `usePapers.update`; citekey read-only.
- Delete: confirm → `trash("papers/<ck>")` → `remove(ck)` → clear open citekey. On trash failure the paper stays and the error shows inline.
- `PaperNotesStandIn`: list `.md`, open (`openPaper` + `openNote`), New note. No rename/delete.
- Tests: ID extraction, CrossRef parsing, arXiv Atom parsing, citekeys (inline fixtures).

## Files
`src/library/{LibraryPanel.tsx, importPdf.ts, metadata.ts, metadata.test.ts, PaperNotesStandIn.tsx, library.css}`; `package.json`/`bun.lock`: dev dep `happy-dom` (tests only; `DOMParser` for `parseArxiv`).

## Proposals
1. Mount `usePdfDropImport()` in `App.tsx` `Workspace`; remove it from LibraryPanel. Optionally move the import status/errors to the app shell.
2. Replace `<PaperNotesStandIn citekey={p.citekey} />` with `NoteList` for `papers/<ck>/notes`; delete `PaperNotesStandIn.tsx`.

## Choices (conservative)
- New imports don't auto-open; only duplicates do.
- arXiv ID beats DOI on page 1 (a page-1 DOI may be a cited paper's).
- arXiv IDs stored without version.
- arXiv venue = journal ref, else `arXiv`.
- No author (or no ASCII letters in family name) → citekey = cleaned filename (≤ 40 chars, else `paper`).
- Embedded metadata: no year; authors split on `,`/`;`/`&`/and, read as "Given Family".
- Delete uses plugin-dialog's native confirm, not `window.confirm`.

## Not done
Drop-zone visual; sort direction toggle; CrossRef polite-pool UA (needs unsafe-headers); empty `papers/<ck>` left if copy fails.

## Verify in the running app
`copy_file` permission and webview listen permission; drop paths outside `$HOME`/`/Volumes` fail inline; drag & drop paths on macOS and interaction with HTML5 DnD; pdf.js text joining keeps DOIs whole; WKWebView `DOMParser` on namespaced Atom; live APIs and offline timeout; dialog dark mode and 280 px layout.
