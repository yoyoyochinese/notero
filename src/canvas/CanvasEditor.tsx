import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type CSSProperties, type DragEvent, useEffect, useRef, useState } from "react";
import { DocStatusBar } from "../DocStatusBar";
import { usePapers } from "../papers";
import { canvasColor, HIGHLIGHT_MIME } from "../quote";
import { useFileDoc } from "../useFileDoc";
import { listDir } from "../vault";
import { CanvasEdgeView, colorOf, FileCard, OtherCard, TextCard } from "./cards";
import { ColorPicker } from "./ColorPicker";
import { type CanvasNode, type FlowEdge, parseCanvas, serializeCanvas, type Side, toFlowEdge, toFlowNode } from "./jsonCanvas";
import "./canvas.css";

const nodeTypes = { text: TextCard, file: FileCard, other: OtherCard };
const edgeTypes = { canvas: CanvasEdgeView };
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

export function CanvasEditor({ path }: { path: string }) {
  const doc = useFileDoc(path);
  return (
    <div className="canvas-editor">
      <DocStatusBar doc={doc} />
      {/* Mounted per load, so our own saves never re-parse (keeps viewport and selection); "reload" remounts. */}
      {doc.status !== "loading" && doc.text !== null && (
        <ReactFlowProvider>
          <Canvas text={doc.text} onChange={doc.setText} />
        </ReactFlowProvider>
      )}
    </div>
  );
}

/** Arrowheads and colour from the JSON Canvas edge fields. */
function styleEdge(e: FlowEdge): FlowEdge {
  const color = colorOf(e.data?.color) ?? "var(--fg-muted)";
  const arrow = { type: MarkerType.ArrowClosed, color };
  return {
    ...e,
    style: { stroke: color, strokeWidth: 2 },
    markerEnd: e.data?.toEnd === "none" ? undefined : arrow,
    markerStart: e.data?.fromEnd === "arrow" ? arrow : undefined,
  };
}

/** Markdown notes the "Add note" picker offers: notes/*.md and papers/*\/notes/*.md. */
async function listNotes() {
  const md = async (dir: string) =>
    (await listDir(dir)).filter((e) => e.isFile && e.name.endsWith(".md")).map((e) => `${dir}/${e.name}`);
  const papers = (await listDir("papers")).filter((e) => e.isDirectory);
  return (await Promise.all([md("notes"), ...papers.map((p) => md(`papers/${p.name}/notes`))])).flat();
}

function Canvas({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const [init] = useState(() => {
    try {
      const p = parseCanvas(text);
      return { ...p, edges: p.edges.map(styleEdge) };
    } catch (err) {
      console.error(err);
      return null;
    }
  });
  const [nodes, setNodes] = useState(init?.nodes ?? []);
  const [edges, setEdges] = useState(init?.edges ?? []);
  // Top-level fields; our own settings live under "notero" so Obsidian and the spec's fields are untouched.
  const [doc, setDoc] = useState(init?.doc ?? {});
  const background = (doc.notero as { background?: string } | undefined)?.background;
  // Presets are tints of the theme background (full-strength presets make cards unreadable); a picked hex is used as is.
  const backgroundCss = background && (/^[1-6]$/.test(background) ? `color-mix(in srgb, ${colorOf(background)} 22%, var(--bg))` : background);
  const saved = useRef(init && serializeCanvas(init.doc, init.nodes, init.edges));
  // React Flow listens for Delete on the whole document; only honour it while the canvas was clicked last.
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onDown = (e: PointerEvent) => setActive(!!box.current?.contains(e.target as Node));
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);
  const [notes, setNotes] = useState<string[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Selection and measuring change the nodes but not the file; only real edits are written.
  useEffect(() => {
    if (!init) return;
    const s = serializeCanvas(doc, nodes, edges);
    if (s !== saved.current) {
      saved.current = s;
      onChange(s);
    }
  }, [init, doc, nodes, edges, onChange]);

  if (!init) return <p className="empty">This file is not a valid JSON Canvas.</p>;

  const add = (at: XYPosition, [width, height]: [number, number], node: Partial<CanvasNode> & { type: string }) =>
    setNodes((ns) => [
      ...ns,
      toFlowNode({ id: newId(), ...node, x: Math.round(at.x - width / 2), y: Math.round(at.y - height / 2), width, height }),
    ]);

  const centre = () => {
    const r = box.current!.getBoundingClientRect();
    return screenToFlowPosition({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  };

  const onDrop = (e: DragEvent) => {
    const text = e.dataTransfer.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    let color: string | undefined;
    const ref = e.dataTransfer.getData(HIGHLIGHT_MIME);
    if (ref) {
      const { citekey, id } = JSON.parse(ref);
      const h = usePapers.getState().papers[citekey]?.highlights.find((h) => h.id === id);
      if (h) color = canvasColor[h.color];
    }
    add(screenToFlowPosition({ x: e.clientX, y: e.clientY }), [400, 200], { type: "text", text, ...(color && { color }) });
  };

  const setBackground = (color?: string) =>
    setDoc(({ notero, ...rest }) => {
      const { background: _, ...ours } = (notero ?? {}) as Record<string, unknown>;
      const next = color ? { ...ours, background: color } : ours;
      return Object.keys(next).length ? { ...rest, notero: next } : rest;
    });
  const selected = nodes.some((n) => n.selected) || edges.some((e) => e.selected);
  const colorSelection = (color?: string) => {
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, color } } : n)));
    setEdges((es) => es.map((e) => (e.selected ? styleEdge({ ...e, data: { ...e.data!, color } }) : e)));
  };

  return (
    <div className="canvas-flow" ref={box} style={backgroundCss ? ({ "--xy-background-color": backgroundCss } as CSSProperties) : undefined}>
      <div className="canvas-toolbar">
        <button onClick={() => add(centre(), [250, 60], { type: "text", text: "" })}>Add card</button>
        {notes ? (
          <select
            autoFocus
            value=""
            onChange={(e) => {
              if (e.target.value) add(centre(), [400, 400], { type: "file", file: e.target.value });
              setNotes(null);
            }}
            onBlur={() => setNotes(null)}
          >
            <option value="">{notes.length ? "Choose a note…" : "No notes in the vault"}</option>
            {notes.map((n) => (
              <option key={n} value={n}>
                {n.replace(/\.md$/, "")}
              </option>
            ))}
          </select>
        ) : (
          <button onClick={async () => setNotes(await listNotes())}>Add note</button>
        )}
        <ColorPicker label="Background" value={background} onChange={setBackground} />
        {selected && (
          <ColorPicker
            label="Card colour"
            value={nodes.find((n) => n.selected)?.data.color ?? edges.find((e) => e.selected)?.data?.color}
            onChange={colorSelection}
          />
        )}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(c) => setNodes((ns) => applyNodeChanges(c, ns))}
        onEdgesChange={(c) => setEdges((es) => applyEdgeChanges(c, es))}
        onConnect={(c) =>
          setEdges((es) => [
            ...es,
            styleEdge(
              toFlowEdge({
                id: newId(),
                fromNode: c.source,
                fromSide: (c.sourceHandle ?? undefined) as Side | undefined,
                toNode: c.target,
                toSide: (c.targetHandle ?? undefined) as Side | undefined,
              }),
            ),
          ])
        }
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={active ? ["Backspace", "Delete"] : null}
        zoomOnDoubleClick={false}
        minZoom={0.1}
        fitView
        fitViewOptions={{ maxZoom: 1 }}
        colorMode="dark"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/plain")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={onDrop}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
