import { useEffect, useRef, useState } from "react";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { usePapers } from "../papers";
import { authorLabel } from "../quote";
import { useUI } from "../store";
import type { Author, Paper } from "../types";
import { trash } from "../vault";
import { importPdfs, useImports, usePdfDropImport } from "./importPdf";
import { PaperNotesStandIn } from "./PaperNotesStandIn";
import "./library.css";

type SortKey = "added" | "title" | "author" | "year";
const SORTS: Record<SortKey, [string, (a: Paper, b: Paper) => number]> = {
  added: ["Date added", (a, b) => b.addedAt.localeCompare(a.addedAt)],
  title: ["Title", (a, b) => a.title.localeCompare(b.title)],
  author: ["First author", (a, b) => (a.authors[0]?.family ?? "").localeCompare(b.authors[0]?.family ?? "")],
  year: ["Year", (a, b) => (b.year ?? 0) - (a.year ?? 0)],
};

const fullName = (a: Author) => (a.given ? `${a.given} ${a.family}` : a.family);

export function LibraryPanel() {
  usePdfDropImport();
  const papers = usePapers((s) => s.papers);
  const openCitekey = useUI((s) => s.citekey);
  const { pending, errors } = useImports();
  const [sort, setSort] = useState<SortKey>("added");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Paper | null>(null);

  const q = filter.trim().toLowerCase();
  const list = Object.values(papers)
    .filter((p) => !q || [p.title, p.venue ?? "", ...p.authors.map(fullName)].join(" ").toLowerCase().includes(q))
    .sort(SORTS[sort][1]);

  async function addPdfs() {
    const paths = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (paths) importPdfs(paths);
  }

  async function remove(p: Paper) {
    if (!(await confirm(`Move "${p.title}" and its notes to the Trash?`, { title: "Delete paper", kind: "warning" }))) return;
    try {
      await trash(`papers/${p.citekey}`);
    } catch (err) {
      useImports.setState((s) => ({ errors: [...s.errors, `Could not delete ${p.citekey}: ${err}`] }));
      return;
    }
    usePapers.getState().remove(p.citekey);
    if (useUI.getState().citekey === p.citekey) useUI.setState({ citekey: null });
  }

  return (
    <div className="library">
      <div className="lib-toolbar">
        <button onClick={addPdfs}>Add PDF…</button>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
          {Object.entries(SORTS).map(([k, [label]]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {pending > 0 && <p className="lib-status">Importing {pending} PDF{pending > 1 ? "s" : ""}…</p>}
      {errors.length > 0 && (
        <div className="lib-status lib-error" role="alert">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
          <button onClick={() => useImports.setState({ errors: [] })}>Dismiss</button>
        </div>
      )}
      {list.length === 0 && (
        <p className="empty">{q ? "No matching papers." : "No papers yet. Add a PDF or drop one on the window."}</p>
      )}
      <ul className="lib-list">
        {list.map((p) => (
          <li key={p.citekey} className={p.citekey === openCitekey ? "current" : undefined}>
            <div className="lib-row">
              <button className="lib-main" onClick={() => useUI.getState().openPaper(p.citekey)}>
                <span className="lib-title">{p.title}</span>
                <span className="lib-meta" title={p.authors.map(fullName).join(", ")}>
                  {[authorLabel(p.authors), p.year, p.venue].filter(Boolean).join(" · ")}
                </span>
              </button>
              <div className="lib-actions">
                <button
                  title="Notes"
                  aria-expanded={expanded === p.citekey}
                  onClick={() => setExpanded(expanded === p.citekey ? null : p.citekey)}
                >
                  {expanded === p.citekey ? "▾" : "▸"}
                </button>
                <button title="Edit metadata" onClick={() => setEditing(p)}>
                  ✎
                </button>
                <button title="Move to Trash" onClick={() => remove(p)}>
                  ✕
                </button>
              </div>
            </div>
            {expanded === p.citekey && <PaperNotesStandIn citekey={p.citekey} />}
          </li>
        ))}
      </ul>
      {editing && <EditDialog paper={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Edits paper.json fields; the citekey and folder never change (decision 21). */
function EditDialog({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  useEffect(() => void (ref.current?.open || ref.current?.showModal()), []);

  async function save(form: FormData) {
    const s = (k: string) => String(form.get(k) ?? "").trim() || undefined;
    const authors = String(form.get("authors"))
      .split("\n")
      .map((l) => l.split(","))
      .filter(([family]) => family.trim())
      .map(([family, ...given]) => {
        const g = given.join(",").trim();
        return g ? { family: family.trim(), given: g } : { family: family.trim() };
      });
    try {
      await usePapers.getState().update(paper.citekey, (p) => ({
        ...p,
        title: s("title") ?? p.title,
        authors,
        year: s("year") ? Number(s("year")) : undefined,
        venue: s("venue"),
        doi: s("doi"),
        arxiv: s("arxiv"),
      }));
      onClose();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <dialog ref={ref} className="lib-dialog" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(new FormData(e.currentTarget));
        }}
      >
        <h3>Edit metadata</h3>
        <p className="lib-meta">Folder: papers/{paper.citekey}</p>
        <label>
          Title
          <input name="title" required defaultValue={paper.title} />
        </label>
        <label>
          Authors (one per line: Family, Given)
          <textarea
            name="authors"
            rows={5}
            defaultValue={paper.authors.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join("\n")}
          />
        </label>
        <label>
          Year
          <input name="year" type="number" defaultValue={paper.year} />
        </label>
        <label>
          Venue
          <input name="venue" defaultValue={paper.venue} />
        </label>
        <label>
          DOI
          <input name="doi" defaultValue={paper.doi} />
        </label>
        <label>
          arXiv ID
          <input name="arxiv" defaultValue={paper.arxiv} />
        </label>
        {error && <p className="lib-error">{error}</p>}
        <div className="lib-dialog-buttons">
          <button type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
      </form>
    </dialog>
  );
}
