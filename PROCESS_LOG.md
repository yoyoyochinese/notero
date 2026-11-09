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
- All 4 workers finished; merged library (e9b6c93), canvas (5661605, e5fbe2e), pdf (b9ac4a6), notes (641e387) with no conflicts (folder ownership worked). 35 tests, tsc and build pass on `feat/mvp`.
- Correction: vitest picked up tests inside agent worktrees (`.claude/worktrees`) → 59 phantom tests; excluded `.claude/**` in vitest and git.
- Correction: `window.confirm`/`alert` may not work in WKWebView → told running workers mid-task to use plugin-dialog `ask`/`message`; canvas worker had already finished and was resumed with the message.
- Wave 0 review found 10 defects, 3 high (dot temp files blocked by fs scope = nothing would save in the real app; papers write race; reload overwrote theirs). All fixed; the reviewer's repros became `src/saving.test.ts`. Lesson: fake-fs unit tests can't see capability/scope problems — the real app must be run before trusting the save path.
- Correction: first scope check for `move_to_trash` used `app.fs_scope()`, which only holds the runtime scope, not capability scopes (read plugin-fs `resolve_path`) → would have refused everything. Replaced with a vault-item path rule.
- Reports saved under `team/reports/` (pdf and notes condensed by the coordinator); running memo in `team/MEMO.md`.

## Wave 2 — integration (coordinator, 2026-11-09)

- Done by the coordinator directly (small edits across already-reviewed files; spawning workers would cost more than it saves).
- Swapped stand-ins: canvas text cards and file cards now use `MarkdownEditor` (text cards read-only until double-click, so they still drag); library rows use `NoteList`; `PaperNotesStandIn` deleted.
- `usePdfDropImport` mounted in the app shell; a drop switches to the Library tab. Opening a paper's note shows its PDF. Insert lands at the end when the cursor was never placed. Canvas delete keys scoped to the canvas.
- Decisions 32–43 recorded.
- `bun run tauri dev` builds and launches the app with no runtime errors in the log. GUI behaviour (drag & drop, selection rects, live APIs) still needs a hands-on check — the coordinator can't drive the window.

## Review of Waves 1+2 (2026-11-09)

- Fresh-context reviewer: no security hole, no canvas corruption; 4 medium + 3 low + minor. All fixed by the coordinator (decisions 44–47); regression tests for the editor echo bug and arXiv false matches (37 tests).
- Lesson: a controlled CodeMirror wrapper must tolerate stale echoes of its own text — React Flow returns node data several renders later. Worth remembering for any controlled editor inside React Flow.
- Lesson: the "flush before close" requirement (decision 37) was only implemented for in-app navigation; app quit is a separate path (Rust `ExitRequested`), easy to miss.
- CSP hardening recorded as Open: it needs a hands-on check of pdf.js/KaTeX/IPC under the policy.
