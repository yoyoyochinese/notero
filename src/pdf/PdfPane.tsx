// PDF pane: pdf.js's PDFViewer (virtualised pages, text layer, internal links) plus our highlights.
import { readFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
// ../pdfjs must be imported before pdf_viewer.mjs, which reads globalThis.pdfjsLib when it loads.
import { pdfjs } from "../pdfjs";
import { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { usePapers } from "../papers";
import { formatQuote, HIGHLIGHT_MIME } from "../quote";
import { useUI } from "../store";
import type { Highlight, HighlightColor, Paper } from "../types";
import { abs, createFile, flushers } from "../vault";
import { byPosition, hitTest, newHighlightId, toPageRects } from "./geometry";
import "./pdf.css";

const COLORS: HighlightColor[] = ["yellow", "red", "green", "blue", "purple"];

type Draft = Pick<Highlight, "page" | "rects" | "text">;
type Popup = { x: number; y: number } & ({ kind: "new"; draft: Draft } | { kind: "edit"; id: string; focus?: boolean });

/** Changes one highlight (null = delete it) and saves paper.json. */
const editHighlight = (ck: string, id: string, change: Partial<Highlight> | null) =>
  usePapers.getState().update(ck, (p) => ({
    ...p,
    highlights: change ? p.highlights.map((h) => (h.id === id ? { ...h, ...change } : h)) : p.highlights.filter((h) => h.id !== id),
  }));

async function insertIntoNote(ck: string, id: string) {
  const paper = usePapers.getState().papers[ck];
  const h = paper?.highlights.find((x) => x.id === id);
  if (!h) return;
  if (!useUI.getState().notePath) useUI.getState().openNote(await createFile(`papers/${ck}/notes`, "md"));
  useUI.getState().requestInsert(formatQuote(paper, h));
}

// Module-level so a jump already handled isn't replayed when the same paper is reopened later.
let handledJump = 0;

// Keeps popups on screen; they are position: fixed at a client point.
const at = (x: number, y: number) => ({ x: Math.min(x, innerWidth - 320), y: Math.min(y, innerHeight - 240) });

export function PdfPane() {
  const citekey = useUI((s) => s.citekey);
  const paper = usePapers((s) => (citekey ? s.papers[citekey] : undefined));
  if (!citekey) return <p className="empty">Open a paper from the library.</p>;
  if (!paper) return <p className="empty">This paper is no longer in the library.</p>;
  return <PdfView key={citekey} paper={paper} />;
}

function PdfView({ paper }: { paper: Paper }) {
  const ck = paper.citekey;
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [layers, setLayers] = useState<Record<number, HTMLElement>>({});
  const [popup, setPopup] = useState<Popup | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const jump = useUI((s) => s.jump);

  useEffect(() => {
    const container = scrollRef.current!;
    const ac = new AbortController();
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const viewer = new PDFViewer({ container, eventBus, linkService, removePageBorders: true });
    linkService.setViewer(viewer);
    viewerRef.current = viewer;
    eventBus.on("pagesinit", () => {
      viewer.currentScaleValue = "page-width";
      setReady(true);
    });
    eventBus.on("pagechanging", (e: { pageNumber: number }) => setPage(e.pageNumber));
    eventBus.on("scalechanging", (e: { scale: number }) => setScale(e.scale));
    // pdf.js empties a page div whenever it re-renders it (zoom, scrolling far away), so the
    // overlay layer is re-added after each render; React portals the highlights into it.
    eventBus.on("pagerendered", (e: { pageNumber: number; source: { div: HTMLElement } }) => {
      const div = e.source.div;
      if (div.querySelector(":scope > .hl-layer")) return;
      const layer = document.createElement("div");
      layer.className = "hl-layer";
      div.querySelector(":scope > .canvasWrapper")?.after(layer);
      setLayers((l) => ({ ...l, [e.pageNumber]: layer }));
    });
    // PDFViewer doesn't refit on resize (e.g. dragging the splitter).
    const refit = new ResizeObserver(() => {
      if (viewer.currentScaleValue === "page-width") viewer.currentScaleValue = "page-width";
    });
    refit.observe(container);

    let task: ReturnType<typeof pdfjs.getDocument> | undefined;
    readFile(abs(`papers/${ck}/paper.pdf`))
      .then(async (data) => {
        if (ac.signal.aborted) return;
        task = pdfjs.getDocument({ data });
        const doc = await task.promise;
        viewer.setDocument(doc);
        linkService.setDocument(doc);
      })
      .catch((err) => !ac.signal.aborted && setError(String(err)));
    return () => {
      ac.abort();
      refit.disconnect();
      viewer.setDocument(null);
      task?.destroy();
    };
  }, [ck]);

  function scrollTo(pageNumber: number, h?: Highlight) {
    const div: HTMLElement | undefined = viewerRef.current?.getPageView(pageNumber - 1)?.div;
    if (!div) return;
    scrollRef.current!.scrollTop = div.offsetTop + (h ? (h.rects[0]?.y1 ?? 0) * div.clientHeight - 80 : 0);
    if (!h) return;
    setFlashId(h.id);
    setTimeout(() => setFlashId((cur) => (cur === h.id ? null : cur)), 1500);
  }

  // A jump can arrive before the document is loaded; it runs once pages exist.
  useEffect(() => {
    if (!ready || !jump || jump.citekey !== ck || handledJump === jump.nonce) return;
    handledJump = jump.nonce;
    const h = usePapers.getState().papers[ck]?.highlights.find((x) => x.id === jump.highlightId);
    scrollTo(h?.page ?? jump.page, h);
  }, [ready, jump, ck]);

  function onMouseUp() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const start = range.startContainer;
    const pageDiv = (start instanceof Element ? start : start.parentElement)?.closest<HTMLElement>(".page");
    if (!pageDiv || !scrollRef.current!.contains(pageDiv)) return;
    // A selection spanning pages is cut at the end of its first page (one highlight = one page).
    if (!pageDiv.contains(range.endContainer)) {
      const tl = pageDiv.querySelector(".textLayer");
      if (!tl) return;
      sel.setBaseAndExtent(start, range.startOffset, tl, tl.childNodes.length);
    }
    const clientRects = Array.from(sel.getRangeAt(0).getClientRects());
    const rects = toPageRects(pageDiv.getBoundingClientRect(), clientRects);
    const text = sel.toString().trim();
    if (!rects.length || !text) return;
    const last = clientRects[clientRects.length - 1];
    setPopup({ kind: "new", ...at(last.right, last.bottom + 6), draft: { page: Number(pageDiv.dataset.pageNumber), rects, text } });
  }

  function onClick(e: ReactMouseEvent) {
    const target = e.target as Element;
    const a = target.closest("a");
    if (a) {
      // External links would navigate the app's webview away; open them in the browser instead.
      const href = a.getAttribute("href") ?? "";
      if (/^(https?|mailto):/.test(href)) {
        e.preventDefault();
        openUrl(href).catch(console.error);
      }
      return;
    }
    if (!getSelection()?.isCollapsed) return;
    const pageDiv = target.closest<HTMLElement>(".page");
    if (!pageDiv) return;
    const b = pageDiv.getBoundingClientRect();
    const h = hitTest(paper.highlights, Number(pageDiv.dataset.pageNumber), (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    if (h) setPopup({ kind: "edit", id: h.id, ...at(e.clientX, e.clientY + 10) });
  }

  async function create(color: HighlightColor, then?: "comment" | "insert") {
    if (popup?.kind !== "new") return;
    const h: Highlight = { id: newHighlightId(), ...popup.draft, color, comment: "", createdAt: new Date().toISOString() };
    getSelection()?.removeAllRanges();
    setPopup(then === "comment" ? { kind: "edit", id: h.id, x: popup.x, y: popup.y, focus: true } : null);
    try {
      await usePapers.getState().update(ck, (p) => ({ ...p, highlights: [...p.highlights, h] }));
      if (then === "insert") await insertIntoNote(ck, h.id);
    } catch (err) {
      console.error(err);
    }
  }

  const viewer = viewerRef.current;
  const sorted = [...paper.highlights].sort(byPosition);
  return (
    <div className="pane pdf-pane">
      <header className="pdf-header">
        <span className="pdf-title" title={paper.title}>
          {paper.title}
        </span>
        <span className="pdf-page">{ready ? `${page} / ${viewer?.pagesCount}` : ""}</span>
        <button title="Zoom out" disabled={!ready} onClick={() => viewer?.decreaseScale()}>
          −
        </button>
        <button title="Fit width" disabled={!ready} onClick={() => viewer && (viewer.currentScaleValue = "page-width")}>
          {Math.round(scale * 100)}%
        </button>
        <button title="Zoom in" disabled={!ready} onClick={() => viewer?.increaseScale()}>
          +
        </button>
        <button aria-pressed={listOpen} onClick={() => setListOpen(!listOpen)}>
          Highlights {paper.highlights.length}
        </button>
      </header>
      <div className="pdf-body">
        <div className="pdf-main">
          <div ref={scrollRef} className="pdf-scroll" onMouseUp={onMouseUp} onClick={onClick} onScroll={() => setPopup(null)}>
            <div className="pdfViewer" />
          </div>
          {error && <p className="empty pdf-error">Cannot open the PDF: {error}</p>}
        </div>
        {listOpen && (
          <ul className="hl-list">
            {sorted.length === 0 && <li className="empty">Select text in the PDF to highlight it.</li>}
            {sorted.map((h) => (
              <li
                key={h.id}
                draggable
                title="Click to jump, drag into a note or canvas"
                onClick={() => scrollTo(h.page, h)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", formatQuote(paper, h));
                  e.dataTransfer.setData(HIGHLIGHT_MIME, JSON.stringify({ citekey: ck, id: h.id }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <span className="hl-swatch" style={{ background: `var(--hl-${h.color})` }} />
                <span className="hl-item">
                  <span className="hl-excerpt">{h.text}</span>
                  {h.comment && <span className="hl-comment">{h.comment}</span>}
                </span>
                <span className="hl-pageno">p.{h.page}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {Object.entries(layers).map(([n, el]) =>
        createPortal(
          paper.highlights
            .filter((h) => h.page === Number(n))
            .flatMap((h) =>
              h.rects.map((r, i) => (
                <div
                  key={`${h.id}-${i}`}
                  className={flashId === h.id ? "hl flash" : "hl"}
                  style={{
                    background: `var(--hl-${h.color})`,
                    left: `${r.x1 * 100}%`,
                    top: `${r.y1 * 100}%`,
                    width: `${(r.x2 - r.x1) * 100}%`,
                    height: `${(r.y2 - r.y1) * 100}%`,
                  }}
                />
              )),
            ),
          el,
          n,
        ),
      )}

      {popup?.kind === "new" && (
        <PopupBox x={popup.x} y={popup.y} keepSelection onClose={() => setPopup(null)}>
          {COLORS.map((c) => (
            <button key={c} className="swatch" aria-label={c} title={c} style={{ background: `var(--hl-${c})` }} onClick={() => create(c)} />
          ))}
          <button onClick={() => create("yellow", "comment")}>Comment</button>
          <button onClick={() => create("yellow", "insert")}>Insert into note</button>
        </PopupBox>
      )}
      {popup?.kind === "edit" && (
        <EditPopup key={popup.id} paper={paper} id={popup.id} x={popup.x} y={popup.y} focus={popup.focus} onClose={() => setPopup(null)} />
      )}
    </div>
  );
}

/** Fixed-position popup; closes on Escape or a mousedown outside it. */
function PopupBox(props: { x: number; y: number; keepSelection?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="pdf-popup"
      style={{ left: props.x, top: props.y }}
      // Clicking a button must not clear the PDF text selection the popup belongs to.
      onMouseDown={props.keepSelection ? (e) => e.preventDefault() : undefined}
    >
      {props.children}
    </div>
  );
}

function EditPopup(props: { paper: Paper; id: string; x: number; y: number; focus?: boolean; onClose: () => void }) {
  const { paper, id } = props;
  const h = paper.highlights.find((x) => x.id === id);
  const [comment, setComment] = useState(h?.comment ?? "");
  const latest = useRef(comment);
  latest.current = comment;

  const saveComment = () => {
    const cur = usePapers.getState().papers[paper.citekey]?.highlights.find((x) => x.id === id);
    return cur && cur.comment !== latest.current ? editHighlight(paper.citekey, id, { comment: latest.current }) : Promise.resolve();
  };
  // The comment is saved when the popup closes, however it closes.
  useEffect(() => {
    flushers.add(saveComment); // also on app quit
    return () => {
      flushers.delete(saveComment);
      saveComment().catch(console.error);
    };
  }, []);

  if (!h) return null;
  return (
    <PopupBox x={props.x} y={props.y} onClose={props.onClose}>
      {COLORS.map((c) => (
        <button
          key={c}
          className="swatch"
          aria-label={c}
          aria-pressed={h.color === c}
          title={c}
          style={{ background: `var(--hl-${c})` }}
          onClick={() => editHighlight(paper.citekey, id, { color: c }).catch(console.error)}
        />
      ))}
      <textarea autoFocus={props.focus} placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="pdf-popup-actions">
        <button
          onClick={() => {
            editHighlight(paper.citekey, id, null).catch(console.error);
            props.onClose();
          }}
        >
          Delete
        </button>
        <button
          onClick={async () => {
            props.onClose();
            try {
              await saveComment();
              await insertIntoNote(paper.citekey, id);
            } catch (err) {
              console.error(err);
            }
          }}
        >
          Insert into note
        </button>
      </div>
    </PopupBox>
  );
}
