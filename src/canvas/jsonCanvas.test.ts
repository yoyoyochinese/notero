import { expect, test } from "vitest";
import { parseCanvas, serializeCanvas } from "./jsonCanvas";

// As Obsidian writes it, plus fields Notero doesn't know about.
const obsidian = {
  nodes: [
    { id: "g1", type: "group", x: -40, y: -40, width: 900, height: 600, label: "Ideas", background: "bg.png", backgroundStyle: "cover" },
    { id: "t1", type: "text", text: "# Hello\n\nworld", x: 0, y: 0, width: 250, height: 60, color: "3" },
    { id: "f1", type: "file", file: "notes/A.md", subpath: "#Intro", x: 300, y: 0, width: 400, height: 400 },
    { id: "l1", type: "link", url: "https://example.com", x: 0, y: 200, width: 400, height: 300, color: "#ff8800" },
    { id: "x1", type: "futureType", x: 1, y: 2, width: 3, height: 4, styleAttributes: { shape: "pill" } },
  ],
  edges: [
    { id: "e1", fromNode: "t1", fromSide: "right", toNode: "f1", toSide: "left", label: "see", color: "1" },
    { id: "e2", fromNode: "f1", toNode: "l1", fromEnd: "arrow", toEnd: "none", extra: true },
  ],
  metadata: { version: "1.0-1.0", frontmatter: {} },
};

test("round-trips an Obsidian canvas unchanged", () => {
  const text = JSON.stringify(obsidian, null, "\t");
  const { doc, nodes, edges } = parseCanvas(text);
  const out = serializeCanvas(doc, nodes, edges);
  expect(JSON.parse(out)).toEqual(obsidian);
  expect(out).toBe(JSON.stringify(obsidian, null, 2) + "\n");
  const again = parseCanvas(out);
  expect(serializeCanvas(again.doc, again.nodes, again.edges)).toBe(out);
});

test("maps geometry and node types to React Flow", () => {
  const { nodes } = parseCanvas(JSON.stringify(obsidian));
  expect(nodes.map((n) => n.type)).toEqual(["other", "text", "file", "other", "other"]);
  expect(nodes[1]).toMatchObject({ id: "t1", position: { x: 0, y: 0 }, width: 250, height: 60 });
});

test("edge sides, ends and labels", () => {
  const { edges } = parseCanvas(JSON.stringify(obsidian));
  expect(edges[0]).toMatchObject({ source: "t1", sourceHandle: "right", target: "f1", targetHandle: "left" });
  expect(edges[0].data).toMatchObject({ label: "see", color: "1" });
  expect(edges[1]).toMatchObject({ sourceHandle: null, targetHandle: null });
  expect(edges[1].data).toMatchObject({ fromEnd: "arrow", toEnd: "none" });
});

test("writes moved and resized nodes as integers", () => {
  const { doc, nodes, edges } = parseCanvas(JSON.stringify(obsidian));
  nodes[1] = { ...nodes[1], position: { x: 10.4, y: -5.6 }, width: 300.2 };
  const t1 = JSON.parse(serializeCanvas(doc, nodes, edges)).nodes[1];
  expect(t1).toEqual({ ...obsidian.nodes[1], x: 10, y: -6, width: 300 });
  expect(Object.keys(t1)).toEqual(Object.keys(obsidian.nodes[1]));
});

test("empty input is an empty canvas", () => {
  for (const text of ["", "  \n", "{}"]) {
    const { doc, nodes, edges } = parseCanvas(text);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
    expect(serializeCanvas(doc, nodes, edges)).toBe('{\n  "nodes": [],\n  "edges": []\n}\n');
  }
});
