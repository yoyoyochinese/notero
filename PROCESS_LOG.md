# Process log

## Grilling (2026-11-09)

- Ran the `grilling` skill: 3 frontier rounds, 32 questions. The user accepted every recommendation except Q6 (one note per paper → **any number of notes per paper**). Result: DECISIONS.md 1–20.
- Skills: `ponytail` (keep the MVP minimal; helped: pushed collections/tags/BibTeX/E2E out of scope), `agent-team` (process), `grilling` (requirements; helped: surfaced the conflict-on-save and Obsidian round-trip questions early).

## Wave 0 — foundation (coordinator, 2026-11-09)

- Branch `feat/mvp` from `master`.
- Rust: added tauri-plugin-fs/http/dialog and a `move_to_trash` command (trash crate). Capabilities: fs read/write scoped to `$HOME/**` and `/Volumes/**`; http to api.crossref.org and export.arxiv.org.
  - Correction: first tried attaching path scopes to the `fs:read-all` / `fs:write-all` sets; switched to the documented `fs:scope` entry plus unscoped sets.
- Frontend deps: zustand, react-resizable-panels (v4: `Group`/`Panel`/`Separator`), pdfjs-dist 6, @xyflow/react 12, CodeMirror 6, KaTeX, vitest. Dropped plugin-store in favour of localStorage for the single vault path.
- Shared modules (DECISIONS 30): types, vault I/O with atomic write + mtime conflict check, papers store, UI store (navigation, jump, insert request), `useFileDoc` autosave hook, `DocStatusBar`, quote format + notero:// link, pdf.js worker setup, app shell with stubs for every worker component.
- Tests: `src/vault.test.ts` (round trip, conflict, Untitled naming), `src/quote.test.ts`. 7 passing; tsc and vite build clean.

## Wave 1 — features (2026-11-09)

- Launched 4 workers in parallel, each in its own worktree, each owning one folder: library (`src/library/`), pdf (`src/pdf/`), notes (`src/notes/`), canvas (`src/canvas/`). Plus a fresh-context reviewer for Wave 0, running concurrently.
- Cross-worker dependencies handled with stand-ins (skill rule: a stand-in gets a different name): canvas uses `CardTextStandIn` until notes' `MarkdownEditor` lands; library uses `PaperNotesStandIn` until notes' `NoteList` lands. Swapped in Wave 2.
- Risk carried to integration: Tauri `dragDropEnabled` vs in-webview HTML5 drag & drop (highlight → note/canvas). Workers can't run the app; coordinator verifies.
