# Canvas worker — Wave 1 report (commit 5661605)

Branch `worktree-agent-a30ab8871d93d956d`. Tests (12, 5 new), tsc, build pass. App not run. No new deps, nothing outside `src/canvas/`.

## Files
- `jsonCanvas.ts`: each RF node/edge keeps the original JSON Canvas object as `data`; save writes `{...data, x, y, width, height}` (integers), edges as `data`, top level `{...doc, nodes, edges}` → unknown types/fields and key order survive. 2-space JSON + newline. Empty/whitespace/`{}` = empty canvas. Groups `zIndex: -1`.
- `jsonCanvas.test.ts`: Obsidian-style round trip (tabs, group/text/file/link/unknown nodes, unknown fields, top-level `metadata`) identical; edge sides/ends/labels; moved/resized nodes keep key order + integer geometry; empty input.
- `CanvasEditor.tsx`: inner `Canvas` mounted when `doc.status !== "loading"`, parses once (own saves never re-parse; viewport/selection kept; "Discard mine and reload" remounts). Serialise effect calls `setText` only when output differs from last save. Opening never rewrites. Invalid JSON → message, never saved over. Toolbar (Add card 250x60 at viewport centre; Add note `<select>` of `notes/*.md` + `papers/*/notes/*.md`), highlight/plain-text drop (400x200 card, colour via `usePapers` + `canvasColor`), connect, Backspace/Delete, pan/zoom, Controls, Background, `colorMode="system"`.
- `cards.tsx`: `CardTextStandIn`, `TextCard`, `FileCard`, `OtherCard` (dashed box), `CanvasEdgeView` (label; double-click edit, Enter/Escape). Handles on 4 sides, `ConnectionMode.Loose`, handle id = JSON Canvas side. Arrowheads per `toEnd`/`fromEnd`. Preset "1"–"6" or hex colours on cards and edges.
- `canvas.css`: `--canvas-1..6` from App.css vars.
- `CanvasesPanel.tsx`: list/highlight/open, New canvas, rename (double-click or button; keeps `.canvas`, refuses `/`, alert if exists; `canvasPath` follows), delete (`confirm()` → trash → clear `canvasPath`).

## Swap-in points (Wave 2)
- `CardTextStandIn` used once in `TextCard` (`src/canvas/cards.tsx`): `<CardTextStandIn value={node.data.text ?? ""} onChange={(text) => updateNodeData(node.id, { text })} />` → `MarkdownEditor`, wrapper needs `nodrag nowheel` classes.
- File card stand-in in `FileCard` at `{/* Stand-in for the rendered note ... */}` → `<MarkdownEditor value={text ?? ""} onChange={() => {}} readOnly />`.

## Proposals
None.

## Open questions (conservative choice taken)
- Edges without `fromSide`/`toSide` drawn from top handle (Obsidian: nearest side). Display only.
- File card reads the note once; Note-tab edits show after reopening the canvas.
- Non-`.md` file nodes show name only, no Open.
- Rename/delete a canvas within 1 s of editing loses the last unsaved edit (flush to old path refused by mtime check).
- React Flow listens for Backspace/Delete document-wide (inputs excluded): Backspace with PDF pane focused can delete selected canvas cards.

## Verify in app
1. `dragDropEnabled` vs HTML5 DnD (highlight → canvas). If broken: `dragDropEnabled: false` conflicts with decision 5 (PDF drop import would need HTML5 file drop).
2. `confirm()`/`alert()` in WKWebView (panel uses both).
3. Resize, 4-side connect, edge label edit, viewport stability, dark mode/`color-mix` presets.
4. Real Obsidian round trip.

## Undone
Minimap (optional).
