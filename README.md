# Notero

A macOS desktop app (Tauri + React) for reading research PDFs, highlighting them, and turning the highlights into Markdown notes and canvases, all stored as plain files in an Obsidian-compatible vault.

## Features

- **Library**: drop PDFs on the window (or pick them in a dialog) and they are copied into the vault. Title, authors, year and venue are filled in from the DOI or arXiv ID (CrossRef / arXiv), else from the PDF's own metadata, and can be edited. Sortable, filterable list; duplicates are detected; deleting moves the paper to the Trash.
- **PDF viewer** (pdf.js) with **highlights** in five colours, each with an optional comment. Highlights live in `paper.json`, so the PDF itself is never modified. The Highlights tab lists the open paper's highlights: click to jump, drag into a note or canvas.
- **Markdown notes** with Obsidian-style live preview, KaTeX math, `[[wikilinks]]` and vim keybindings (`:w` saves). Notes can belong to a paper or stand alone. A highlight inserted into a note becomes a quote with a link that jumps back to the spot in the PDF.
- **Canvases** in JSON Canvas format (they open in Obsidian): Markdown cards, embedded notes, highlight quote cards, labelled arrows, colours for cards, arrows and the background. Each paper has its own canvas, and free canvases can span several papers.
- **Layout**: a resizable, collapsible sidebar (⌘\\) with Library / Notes / Canvases / Highlights tabs; the PDF and the note or canvas sit side by side. Ayu Mirage theme.
- **Plain files**: the vault is an ordinary folder (`papers/`, `notes/`, `canvases/`) that Obsidian can open too. Edits autosave; a file changed by another app is never overwritten without asking.
