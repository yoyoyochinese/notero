# Wave 1+2 review (fresh context) — findings and resolution

No security hole, no canvas round-trip corruption found. tsc clean. Reviewer saw 1 test fail once in 10 runs (unidentified, flaky); coordinator saw 0 failures in 12 later runs.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | med | MarkdownEditor treated a late echo of its own text as an outside change → doc reset, cursor to 0, typing misplaced (canvas cards; IME) | remember emitted texts, ignore them when they come back as `value`; regression test `src/notes/MarkdownEditor.test.tsx` |
| 2 | med | Old-style arXiv regex matched any `word/1234567` → skipped CrossRef, fake arXiv ID, false duplicates | regex limited to real archive names; arXiv miss falls through to the DOI; tests added |
| 3 | med | Concurrent imports could add the same PDF twice / collide on citekey | one module-level import queue |
| 4 | med | Window close / Cmd+Q lost the last second of edits and an open highlight comment | `onCloseRequested` flushes; Rust `ExitRequested` → `quit-requested` → frontend flushes → `quit` command (3 s fallback); comment popup registers in `flushers`; `core:window:allow-destroy` |
| 5 | low | Deleting a paper left its note open (ghost note; inserts went there) | clear `notePath` under the paper |
| 6 | low | Failed copy/add left an invisible folder holding the citekey | remove the folder on failure |
| 7 | low | Canvas file cards followed `..`/absolute paths from the .canvas file | only vault-relative paths without `..` count as notes |
| – | low | Canvas rename to `.foo` hid it; trash failure silent | refused / error message |
| – | hardening | `csp: null` + `fs:write-all` on `$HOME` → any future XSS could write LaunchAgents / shell rc | deny LaunchAgents and shell rc files in fs scope; CSP left **Open** (needs testing in the running app) |
