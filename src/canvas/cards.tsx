// React Flow node and edge components for the canvas.
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  useReactFlow,
} from "@xyflow/react";
import type { EditorView } from "@codemirror/view";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "../notes/MarkdownEditor";
import { useUI } from "../store";
import { readText } from "../vault";
import type { FlowEdge, FlowNode, Side } from "./jsonCanvas";

/** JSON Canvas color: preset "1"–"6" (CSS variables in canvas.css) or a hex value. */
export const colorOf = (c?: string) => (c && /^[1-6]$/.test(c) ? `var(--canvas-${c})` : c);

const SIDES: [Side, Position][] = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
];

function Frame({ node, className = "", children }: { node: NodeProps<FlowNode>; className?: string; children: ReactNode }) {
  return (
    <>
      <NodeResizer isVisible={node.selected} minWidth={80} minHeight={40} />
      {/* Loose connection mode: source handles on every side connect to each other; the id is the JSON Canvas side. */}
      {SIDES.map(([id, pos]) => (
        <Handle key={id} id={id} type="source" position={pos} />
      ))}
      <div className={`canvas-card ${className}`} style={{ "--card": colorOf(node.data.color) } as CSSProperties}>
        {children}
      </div>
    </>
  );
}

/** Markdown card: rendered while idle (so it drags like a card), editable after a double-click until deselected. */
export function TextCard(node: NodeProps<FlowNode>) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const view = useRef<EditorView | null>(null);
  const text = node.data.text ?? "";
  useEffect(() => {
    if (!node.selected) setEditing(false);
  }, [node.selected]);
  useEffect(() => {
    if (editing) view.current?.focus();
  }, [editing]);
  return (
    <Frame node={node}>
      <div className={editing ? "card-text nodrag nowheel" : "card-text"} onDoubleClick={() => setEditing(true)}>
        {!editing && !text && <span className="card-muted">Double-click to edit</span>}
        <MarkdownEditor value={text} onChange={(t) => updateNodeData(node.id, { text: t })} readOnly={!editing} viewRef={view} />
      </div>
    </Frame>
  );
}

/** Embedded vault file. Markdown notes show their text read-only; other files only their name. */
export function FileCard(node: NodeProps<FlowNode>) {
  const file = node.data.file ?? "";
  // The path comes from the .canvas file, which may be someone else's: stay inside the vault.
  const isNote = file.endsWith(".md") && !file.startsWith("/") && !file.split("/").some((s) => s === ".." || s === "");
  const [text, setText] = useState<string | null | undefined>(); // undefined = loading, null = missing
  useEffect(() => {
    if (isNote) readText(file).then((r) => setText(r.text), () => setText(null));
  }, [file, isNote]);
  return (
    <Frame node={node}>
      <div className="card-head">
        <span title={file}>{file.split("/").pop()}</span>
        {isNote && text !== null && (
          <button className="nodrag" onClick={() => useUI.getState().openNote(file)}>
            Open
          </button>
        )}
      </div>
      <div className="card-text">
        {text === null ? <span className="card-muted">missing</span> : <MarkdownEditor value={text ?? ""} onChange={() => {}} readOnly />}
      </div>
    </Frame>
  );
}

/** Node types Notero doesn't edit (group, link, newer ones): a movable labelled box. */
export function OtherCard(node: NodeProps<FlowNode>) {
  const { type, label, url, file } = node.data;
  return (
    <Frame node={node} className="canvas-card-other">
      <div className="card-head">{type}</div>
      <div className="card-text">{label ?? url ?? file}</div>
    </Frame>
  );
}

/** Edge with a label; double-click the edge or its label to edit it. */
export function CanvasEdgeView(p: EdgeProps<FlowEdge>) {
  const { updateEdgeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [path, x, y] = getBezierPath(p);
  const label = p.data?.label;
  return (
    <>
      <g onDoubleClick={() => setEditing(true)}>
        <BaseEdge id={p.id} path={path} markerStart={p.markerStart} markerEnd={p.markerEnd} style={p.style} />
      </g>
      {(editing || label) && (
        <EdgeLabelRenderer>
          <div
            className="canvas-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
            onDoubleClick={() => setEditing(true)}
          >
            {editing ? (
              <input
                autoFocus
                defaultValue={label}
                onBlur={(e) => {
                  setEditing(false);
                  updateEdgeData(p.id, { label: e.target.value.trim() || undefined });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.currentTarget.value = label ?? "";
                  if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                }}
              />
            ) : (
              label
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
