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

## Feedback round 1: Q33/Q34, sidebar, auto note, UI pass (2026-11-09)

- The coordinator could not see the Tauri window (no screen access), so it built a **Chromium harness** in the scratchpad: Playwright drives the real frontend on the Vite dev server with `window.__TAURI_INTERNALS__` replaced by an in-memory vault (fs/dialog/http/event mocks) seeded with a generated PDF, notes and a canvas. It gives screenshots (light/dark) and behaviour checks (sidebar stays, auto note, free note stays, drag highlight → note). Helped a lot: the first screenshots showed problems no test could (invisible 16 px sidebar strip, monospace notes, no page separation, pdf.js's global `.sidebar` rule rounding our sidebar).
- Correction: our `.sidebar` class collided with pdf.js's global `pdf_viewer.css` (`.sidebar { border-radius: 8px; padding-top: 6px … }`) → renamed `.app-sidebar`. Checked the other app class names against pdf.js, React Flow and KaTeX CSS.
- Correction: `proOptions.hideAttribution` triggered React Flow's request to keep the attribution without a Pro subscription → reverted.
- Fixed the `ResizeObserver loop` error seen in the dev log (refit deferred a frame).
- CSP verified by serving the production build with the CSP header injected by Playwright: inline scripts blocked, everything else renders.
- No separate fresh-context review for this batch: small, and covered by `showPaper.test.ts` plus the harness checks. Tests: 40.

## Feedback round 2: Ayu Mirage, resizable sidebar, canvas colours, Q35/Q36 (2026-11-09)

- Ayu colours taken from the official `ayu` npm package (downloaded as data with `npm pack` into the scratchpad, not installed) rather than from memory.
- Harness extended to 14 behaviour checks (sidebar drag-resize, Highlights tab + flash, per-paper canvas creation, background and card colour saved to the file). All pass; no console errors.
- Correction: full-strength preset backgrounds made the canvas bright cyan with unreadable cards (seen in the harness screenshot) → presets are tints; custom picks stay exact.
- Correction: with the sidebar collapsed, its hidden toggle button was still in the accessibility tree (two "Show sidebar" buttons) → the collapsed panel's content gets `hidden`, still mounted so it keeps its state.
- Interpretation recorded: "背景色" implemented as the canvas background plus card/arrow colours; reported to the user.
- Tests: 41.

## Fix: highlight drop (2026-11-09)

- User: drag starts but drop never lands (the risk flagged since Wave 1). Root cause read in wry 0.57 `wkwebview/drag_drop.rs`: when Tauri's handler is registered it answers every `draggingUpdated`/`performDragOperation` itself, so WebKit never fires HTML5 `dragover`/`drop`, for internal drags too.
- Fix: `dragDropEnabled: false`; PDF drop import moved to an HTML5 capture-phase listener reading the dropped `File`; import writes bytes with `writeFile` instead of `copyFile`. pdf.js detaches the buffer it parses, so it gets a copy (`bytes.slice()`).
- Harness: new `drop.mjs` (file drop imports, non-empty PDF, single drop opens) + existing drag-into-note check pass. WKWebView itself still needs the user's confirmation.
- Lesson: the Wave 1 workers flagged this exact risk; it should have been tested in the real app before building more on top. The harness can't reproduce WebView/native-layer behaviour.

## Optimization phase (2026-11-09)

- Measured before changing anything: harness benchmark (`bench.mjs`) on the production build with a big vault (300 papers, 3000-line note, 300-card canvas), CDP main-thread time, IPC call counts; release `.app` size and idle footprint via `footprint`.
- Profiling found what the code alone wouldn't have told: canvas drag spent its time in style/layout/paint, not our JS (except the per-frame serialisation); opening a big canvas created one CodeMirror per card; `markdown()` dragged in lang-html/css/autocomplete.
- Correction: lazy-loading the PDF pane and canvas with `React.lazy` made their first open ~300 ms slower (React 19's Suspense reveal throttle; seen as 300 ms between chunk load and mount) with no measurable startup gain → reverted. KaTeX stays lazy (no Suspense).
- Correction: `serde_json` can't be removed — `tauri::generate_context!` expands to code using it.
- Results (baseline → final, harness numbers are CPU ms): canvas open 480 → 93 (wall 527 → 133); 30-step card drag 1660 → 680; typing 40 keys in the long note 280 → 246; startup IPC calls 913 → 610; IPC per save 6 → 4; JS heap after the run 68 → 47 MB; main JS 1.9 → 1.46 MB; dist 4.3 → 3.4 MB; release app 9.19 → 7.26 MiB (binary 9.5 → 7.5 MB). Idle footprint (welcome screen) didn't change measurably: repeated runs vary by ±10 MB (main 30–38 MB, WebContent 50–70 MB).
- Limits: headless Chromium paints in software, so paint-heavy numbers (drag) overstate what WKWebView with GPU compositing does; the mock IPC is serial, so parallel paper loading shows no wall-time gain in the harness (it should in the real app, where Rust handles calls concurrently).
- Correction (my own): I thought building the Language with a fresh `defineLanguageFacet()` broke lang-markdown's list keymap (it checks `markdownLanguage.isActiveAt`). A probe showed it still worked — the parser derived from `commonmarkLanguage.parser` keeps lang-markdown's language data on its top node. Switched to `commonmarkLanguage.data` anyway (explicit) and kept the Enter-continues-list test as a guard, but it was not a real regression.
- Fresh-context review of the optimization commit: 1 high, 4 low, all fixed. High: an invalid `.canvas` crashed the window (the new viewport effect read a ref that the error branch never renders). Low: paste-URL-as-link lost with `markdown()`; parallel loading made tie order in the library change per launch; a drag cut short by unmounting was lost; `onlyRenderVisibleElements` hid edges to never-rendered cards — measured it: no gain once zoomed-out cards are plain text, so removed. The reviewer's repros became `invalidCanvas.test.tsx`, `pasteLink.test.ts`, `papers.test.ts` (45 tests).
- Lesson: "only render what's visible" and "render cheaply when far" overlapped; measuring each separately showed the second made the first redundant.
