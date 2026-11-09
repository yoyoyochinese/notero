// JSON Canvas (https://jsoncanvas.org/spec/1.0/) <-> React Flow. Each React Flow node/edge keeps the
// original JSON object as its `data`, so unsupported node types and unknown fields survive a save.
import type { Edge, Node } from "@xyflow/react";

export type Side = "top" | "right" | "bottom" | "left";

export type CanvasNode = {
  id: string;
  type: string; // "text" | "file" | "link" | "group" | anything newer
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  [key: string]: unknown;
};

export type CanvasEdge = {
  id: string;
  fromNode: string;
  fromSide?: Side;
  fromEnd?: "none" | "arrow";
  toNode: string;
  toSide?: Side;
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
  [key: string]: unknown;
};

/** Top-level object minus nodes/edges (kept for unknown fields and key order). */
export type CanvasDoc = { nodes?: unknown; edges?: unknown; [key: string]: unknown };

export type FlowNode = Node<CanvasNode>;
export type FlowEdge = Edge<CanvasEdge>;

/** React Flow node type used to render a JSON Canvas node. */
const flowType = (t: string) => (t === "text" || t === "file" ? t : "other");

export function toFlowNode(n: CanvasNode): FlowNode {
  return {
    id: n.id,
    type: flowType(n.type),
    position: { x: n.x, y: n.y },
    width: n.width,
    height: n.height,
    // Groups enclose other nodes; keep them behind.
    zIndex: n.type === "group" ? -1 : undefined,
    data: n,
  };
}

export function toFlowEdge(e: CanvasEdge): FlowEdge {
  return {
    id: e.id,
    type: "canvas",
    source: e.fromNode,
    target: e.toNode,
    sourceHandle: e.fromSide ?? null,
    targetHandle: e.toSide ?? null,
    data: e,
  };
}

export function parseCanvas(text: string) {
  const doc: CanvasDoc = text.trim() ? JSON.parse(text) : {};
  const nodes = Array.isArray(doc.nodes) ? (doc.nodes as CanvasNode[]).map(toFlowNode) : [];
  const edges = Array.isArray(doc.edges) ? (doc.edges as CanvasEdge[]).map(toFlowEdge) : [];
  return { doc, nodes, edges };
}

export function serializeCanvas(doc: CanvasDoc, nodes: FlowNode[], edges: FlowEdge[]) {
  const out = {
    ...doc,
    // Spreading the original keeps its key order; the spec wants integer geometry.
    nodes: nodes.map((n) => ({
      ...n.data,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      width: Math.round(n.width ?? n.data.width),
      height: Math.round(n.height ?? n.data.height),
    })),
    edges: edges.map((e) => e.data),
  };
  return JSON.stringify(out, null, 2) + "\n";
}
