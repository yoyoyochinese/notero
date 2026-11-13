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

## Finder drop fix, logo, release build (2026-11-09)

- User: highlight drop works; Finder PDF drop shows "This paper is no longer in the library."; metadata lookup works.
- Investigation: the vault on disk had the dropped paper's folder with paper.json and paper.pdf, so the import succeeded and the UI read a different store. Reproduced in the harness: after a Vite hot update of `papers.ts` (my edits while the user's `tauri dev` ran), a drop lands in the old store instance. Fix: stateful modules reload the page on hot update (decision 65). Harness `hmr-drop.mjs` now passes after a hot update.
- Lesson: editing store modules while the user tests in `tauri dev` produces dev-only ghosts; tell the user to reload (⌘R) after such edits, or test in a release build.
- Logo drawn as SVG, rendered to PNG in the harness's Chromium, icons generated with `tauri icon`.

## Vim mode, typing lag (2026-11-09)

- User: vim keys in notes/canvas (no toggle needed); typing feels slightly heavy — find the causes.
- Chromium (CDP) said our JS per key was only ~1.5 ms, which didn't explain a felt lag. Installed Playwright WebKit (the engine behind WKWebView) and measured main-thread busy time per key with a message-loop meter (WebKit has no CDP and a 1 ms clock). With a paper open: ~12–13 ms per key; without: ~3–4 ms.
- A/B by wrapping `document.addEventListener` in an init script: skipping single listeners changed nothing (pdf.js re-appends the text-layer end marker from both `selectionchange` and `keyup`); skipping only the redundant `append` halved the cost. Patched pdf.js (decision 68). Variants that did not matter for normal notes: disabling pdf.js's annotation editor, removing live preview (only matters at 3000 lines: 8.3 → 4.6 ms), not updating React state per key.
- Results in WebKit, per key, paper open (before → after, median of runs, ±2 ms noise): short note 12.5 → 6; 200-line note 12.6 → 7; 3000-line note 15 → 8.5; 3-card canvas 12.7 → 5; 300-card canvas 21 → 11.
- Correction: my first vim build showed a vim cursor in every read-only card; vim now lives in the editable compartment.
- Lesson: measure in the engine the app ships with; Chromium hid the WebKit-specific cost entirely.

## j/k over formulas (2026-11-09)

- Reproduced in Playwright WebKit (`vimmath.mjs`): j from the line above a `$$` block landed below it; lines with inline math and the line after a display formula were skipped too.
- Read the code: vim's `moveByLines` calls `findPosV` → `view.moveVertically`, and jumps to that result when it passes the target line (a fold heuristic). A probe comparing CodeMirror's height map with the DOM showed a second cause: formula widgets measured ~30 px short (KaTeX's `.katex-display` margin collapsing out of the widget), so heights drifted below each formula; mouse clicks below formulas also landed on the wrong line (checked with and without the fix).
- Fix: document-line `moveByLines` + `display: flow-root`. Regression test in `MarkdownEditor.test.tsx` (fails without the fix: j jumped straight to the last line).
- Arrow keys (user request): insert-mode ArrowUp/Down stop on formula lines (decision 69). Unit test stands in for the skipping vertical motion (happy-dom has no layout); fails without the fix.
- Performance check (WebKit busy meter, paper open, median of 3 interleaved runs, ms per key; builds: before the j/k fix → j/k fix → arrow fix): typing short note 6.6 → 5.1 → 5.1, 200-line note with formulas 7.1 → 6.9 → 6.9, 3000-line note 8.4 → 8.6 → 8.6, j 7.7 → 6.5 → 6.8, ArrowDown 7.7 → 6.0 → 6.0, 300-card canvas 11.7 → 12.0 → 12.1. The 3-card canvas read 4.6 → 6.2 → 6.6 in that sequence, but not in isolation (≈6 ms in all builds, CSS on/off) nor in the sequence without the cursor-movement step (5.6 before, 5.0 after): an order effect (stepping into formulas re-renders them, and that work lands in the next measurement), not a cost of the change.

## UI widths (2026-11-10)

- User: slightly wider default sidebar; default PDF pane slightly wider than the note/canvas pane.
- The app's localStorage (WKWebView, `~/Library/WebKit/dev.lemur.notero`) already held a dragged layout (`sidebar 9.6%`), which would have hidden new defaults → new storage id (decision 70).
- Checked in Playwright WebKit at 1400×900: 320 / 594 / 484 px, both fresh and with the old saved layout present. 47 tests pass, tsc clean.

## Memory (2026-11-12)

- User: `tauri://localhost` uses 600–700 MB. Skills: `ponytail` (smallest fix per cause; dropped two of my own changes once the real cause was known), `agent-team` (process, records, fresh-context review; helped).
- Measured the running release app first: `footprint` of its WebContent showed peak 608 MB, mostly IOSurface-backed graphics (canvas memory) and WebKit Malloc. The user's vault is small (5 papers, 16 MB), so not data volume.
- Rebuilt the WebKit harness (the old one was gone with its scratchpad): production build served by Bun, Tauri IPC mocked, the user's vault read-only, `footprint` of the Playwright WebContent/GPU processes per step, DOM canvas totals, and — new — forced GC plus JSC heap snapshots through Playwright's in-process server objects (`page._connection.toImpl(page)` → WebKit inspector `Heap.gc` / `Heap.snapshot`). Later added the production CSP (no `unsafe-eval` changes pdf.js's glyph path).
- Findings, in order: (1) closing a PDF left its page canvases to the GC (fixed: destroy page views; switching memory 540 → 250 MB); (2) PDFViewers leaked, ~1 per open, in WebKit only (Chromium V8 snapshot: 1 viewer) — bisected with PDFViewer options: text layer / annotation layer / FontFace off didn't matter, `annotationEditorMode: DISABLE` did; (3) FontFaces leaked ~20 per open — a micro-probe (marker classes, GC, snapshot) in both engines showed WebKit keeps any FontFace whose `loaded`/`load()` promise was touched, and that data-built FontFaces are already "loaded" → one-line pdf.js patch; (4) steady state: 10 cached pages and zoomed canvases up to ~43 MB → user chose 5 pages + `maxCanvasPixels` 2²².
- Corrections: a shared pdf.js worker looked like an obvious win; measured twice (before and after the leak fixes), it grew faster in WebKit → reverted. The heap snapshot showed ResizeObserver callbacks as GC roots, so I first added pdf.js's `abortSignal` and nulled our observer; the viewers still leaked — the observers were kept by a DOM tree that something else held. Once the editor was found, both changes were dropped as unnecessary (measured).
- Lesson: JSC heap snapshots don't record Map/Set entries (pdf.js's EventBus stores listeners in a Map of Sets), so "no path to root" there doesn't mean unreachable; bisecting with options and small probes was faster than reading snapshots. Chromium's V8 snapshot was the quickest way to tell a WebKit-only leak from a JS one.
- Correction (safety): the harness's Bun server listened on all interfaces while serving the vault (`/__fs`); the auto-mode classifier blocked a background run → bound to 127.0.0.1.
- Fresh-context reviewer (variants with each change removed, real mouse selections, bare pdf.js probe, fast switching, closing the last paper): all three claims verified, no regressions; low findings (missing decision entry, comment wording, the font patch saves little now) addressed in decisions 71–75 and the comment.
- Results, harness, no forced GC, same scenario (open, read, zoom ×10, fit, 4 rounds of switching 5 papers), WebContent MB: reading 266 → 244 (canvases 70 → 35 MB), zoomed 348 → 265 (canvases 133 → 33 MB), after switching 622 → 309, peak 873 → 433. GPU process 125–170 → 115–190 (noisy). With forced GC, 30 opens: viewers 1, FontFaces only the open paper's; WebKit Malloc still creeps a few MB per round with slowing growth (allocator high-water mark; JS heap flat at 55–60 MB). 47 tests, tsc clean; page-1 pixels identical before/after on 3 papers.

## PDF speed and sidebar width (2026-11-13)

- User: since the memory work PDFs load slower and text seems to "buffer"; the sidebar's width differs between the laptop screen and the external display, where it overflows and scrolls sideways. Fix both, then the usual optimization loop. Skills: `ponytail` (one number and one adapter instead of reverting the memory work), `agent-team` (records, fresh-context review).
- Rebuilt the WebKit harness again (scratchpad gone): production build with the production CSP served by Bun on 127.0.0.1, Tauri IPC mocked (vault read-only, writes in memory), the user's vault. New probes: layout (panel widths and every element that scrolls sideways at window sizes 1000–2560, dpr 1/2, with/without a saved layout, after resizing) and PDF (open timings, render passes, ms that visible pages were unfinished or blurry while skimming, canvas MB, WebContent `footprint`), builds interleaved.
- `system_profiler`: the external display is a 5K Dell shown as 2560×1440 at dpr 2. That made the pdf.js cap the first suspect: a page-width page in a pane over ~900 px exceeds 2²² at dpr 2. Five builds (before decision 73; HEAD; HEAD without the cap; HEAD with the 10-page cache; both) separated the two parts of decision 73: the cap caused the blur and ~6x renders, the cache only some re-renders when scrolling back (decisions 76–77).
- Sidebar: the app's localStorage (`~/Library/WebKit/dev.lemur.notero`) held a percent layout (sidebar 12.958%); the probe showed the restored width following the window and the tab row overflowing under ~255 px (decision 78). The probe first missed the filter field's 1 px overflow (it tolerated 1 px); tightened.
- Corrections: the first batch runs failed (".lib-title" never appeared) because zsh doesn't word-split an unquoted `$T`, so all five URLs reached the script as one argument. And a wait loop matched "Error" in stale result files from that failed run.
- Couldn't check the real window: no screen capture or accessibility access from this session.
- Fresh-context reviewer (first run stopped on an API authentication error; resumed with a message, kept its context): both claims reproduced, also on a third paper and at 1600/1920/2000 px windows (the cap starts to matter between 891 and 935 px panes); selection → highlight rects, jump, switching papers, zoom with detail canvases unchanged; no React warnings in a dev build; no drift over 15 save/load cycles. Findings: 2 medium, 4 low, all fixed or written down: hide/show grew the sidebar by W/(W−40) (pre-existing, from the rail outside the group, confirmed with a build where only the rail changed) → rail = collapsed size inside the group; zoom memory up to ~500 MB around 200 % not in decision 76 → added; a layout saved while collapsed lost the width → kept; malformed stored value = blank window (pre-existing) → falls back; long unbroken words scrolled the sidebar (pre-existing, not in the user's data) → `overflow-wrap: anywhere`; wording (the window always opens at 1400 px, so the user's percent layout always gave 200 px; "~6x" was against the pre-73 build, ~4x against this one).
- Lesson: "the sidebar's width depends on the monitor" had three causes, and only one (percent storage) was visible from the stored layout; the hide/show growth only showed up when the reviewer toggled the sidebar repeatedly. Interaction sequences belong in the layout probe, not only static sizes.
- Results after the fixes: the reviewer's scenarios (toggle at 1400/2560, 11 layout scenarios, 14 malformed values, long-word mock) and my probes (window sizes × dpr × resize, sidebar widths 200–560) pass; 47 tests, tsc and build clean.
