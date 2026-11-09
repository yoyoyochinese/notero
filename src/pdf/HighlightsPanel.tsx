// Sidebar "Highlights" tab: the open paper's highlights. Click to jump, drag into a note or canvas.
import { usePapers } from "../papers";
import { formatQuote, HIGHLIGHT_MIME } from "../quote";
import { useUI } from "../store";
import { byPosition } from "./geometry";
import "./pdf.css";

export function HighlightsPanel() {
  const citekey = useUI((s) => s.citekey);
  const paper = usePapers((s) => (citekey ? s.papers[citekey] : undefined));
  if (!paper) return <p className="empty">Open a paper to see its highlights.</p>;
  const sorted = [...paper.highlights].sort(byPosition);
  return (
    <div>
      <p className="hl-paper" title={paper.title}>
        {paper.title}
      </p>
      {sorted.length === 0 && <p className="empty">Select text in the PDF to highlight it.</p>}
      <ul className="hl-list">
        {sorted.map((h) => (
          <li
            key={h.id}
            draggable
            title="Click to jump, drag into a note or canvas"
            onClick={() => useUI.getState().jumpTo(paper.citekey, h.page, h.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", formatQuote(paper, h));
              e.dataTransfer.setData(HIGHLIGHT_MIME, JSON.stringify({ citekey: paper.citekey, id: h.id }));
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
    </div>
  );
}
