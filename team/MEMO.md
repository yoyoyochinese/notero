# Coordinator memo (running)

Conclusions, proposals and open questions from worker reports. Integration reads this.

## library (W1, merged e9b6c93)
- Proposals: mount `usePdfDropImport()` in `App.tsx` Workspace (remove from LibraryPanel); move "Importing…"/errors display to app shell so it shows on every tab; swap `PaperNotesStandIn` → notes' `NoteList dir="papers/<ck>/notes"`.
- Added dev dep `happy-dom` (tests only, DOMParser for arXiv Atom).
- Delete confirm uses plugin-dialog `ask` (window.confirm may not work in WKWebView) — tell notes/canvas workers' code to do the same if they used confirm().
- Candidate questions for the user: auto-open a newly imported paper? (now: no, only duplicates open)
- Worker defaults (record, not ask): arXiv ID wins over DOI on page 1; arXiv stored without version; arXiv venue = journal_ref or "arXiv"; no-author citekey = cleaned filename; embedded metadata gives no year.
- Undone: drop-zone visual; sort direction toggle; CrossRef mailto UA; empty folder left if copy fails.
- Verify in app: copy_file permission; drag-drop paths; DOMParser on namespaced Atom in WKWebView; live API; dialog dark mode.

## canvas (W1, 5661605 — awaiting follow-up commit for confirm/alert → plugin-dialog)
- Swap-ins for W2: `CardTextStandIn` in `TextCard` → MarkdownEditor (wrapper `nodrag nowheel`); FileCard stand-in → MarkdownEditor readOnly.
- Bug to fix in W2 (affects notes too): rename/delete within 1 s of editing loses last edit — `useFileDoc` flushes to the old path. Fix centrally: flush pending save before move/trash (expose `flush()` or have rename go through a helper).
- Bug: React Flow Backspace/Delete is document-wide → deleting canvas cards while focus is in the PDF pane. Fix: scope `deleteKeyCode` to when the canvas has focus.
- Display: edges without sides drawn from top (Obsidian: nearest). Low.
- File card doesn't refresh after Note-tab edits (accepted, decision 16).
- Verify in app: DnD vs dragDropEnabled; resize/connect/edge labels; Obsidian round trip.
