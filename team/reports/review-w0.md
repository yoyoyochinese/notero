# Wave 0 review (fresh context) — findings and resolution

Repros: scratchpad review-w0/ (now ported to `src/saving.test.ts`, assertions inverted).

| # | Sev | Finding | Resolution (7b6c066) |
|---|---|---|---|
| 1 | high | Dot temp files rejected by fs scope (`requireLiteralLeadingDot` default true) → every save fails in the real app | `plugins.fs.requireLiteralLeadingDot: false`; deny `~/.ssh`, `~/.gnupg`, `~/.aws`, Keychains; dialog `recursive: true` |
| 2 | high | Two quick `papers.update` → false conflict + lost edit; shared temp name ENOENT | per-paper write chain; unique temp names |
| 3 | high | "Discard mine and reload" let the queued autosave overwrite theirs | `load` clears timer + pending, waits for queue |
| 4 | med | Closing a doc in conflict dropped edits silently | pending kept on conflict; on unmount failure write `<name> (conflict).<ext>` + native message |
| 5 | med | Saves not serialized; status "saved" with edits pending | write queue; "saved" only when nothing pending |
| 6 | med | vitest picked up worktree tests | already fixed (d108ab9) |
| 7 | low | `readText` read mtime after content | mtime first |
| 8 | low | Path change without remount → false conflict | hook is now one-file-per-instance (`path: string`, remount with key) |
| 9 | low | Case-only rename refused on APFS | skip exists check for case-only rename |
| 10 | low/sec | `move_to_trash` accepted any path | only canonical paths under $HOME or /Volumes whose parent is papers/notes/canvases |

Also: rename/delete flush open docs first (`flushers` in vault.ts) — fixes the canvas/notes "rename within 1 s loses edit" report.
