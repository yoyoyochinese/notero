import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type ReactNode, useEffect, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { CanvasesPanel } from "./canvas/CanvasesPanel";
import { usePdfDropImport } from "./library/importPdf";
import { LibraryPanel } from "./library/LibraryPanel";
import { NotesPanel } from "./notes/NotesPanel";
import { usePapers } from "./papers";
import { HighlightsPanel } from "./pdf/HighlightsPanel";
import { PdfPane } from "./pdf/PdfPane";
import { RightPane } from "./RightPane";
import { useShallow } from "zustand/react/shallow";
import { type SidebarTab, useUI } from "./store";
import { chooseVault, flushAll, openVault, savedVault } from "./vault";
import "./App.css";

// 16px stroke icons; the label shows for the active tab, or for all tabs when the sidebar is wide.
const TABS: [SidebarTab, string, ReactNode][] = [
  ["library", "Library", <path d="M2.5 2.5v11M5.5 2.5v11M8.5 3.2l3.5 10M1.5 13.5h13" />],
  ["notes", "Notes", <path d="M4 1.5h5.5l3 3v10H4zM6 7.5h4.5M6 10h4.5" />],
  ["canvases", "Canvases", <path d="M1.5 2h5v4h-5zM9.5 10h5v4h-5zM6.5 4H10a1.5 1.5 0 0 1 1.5 1.5V10" />],
  ["highlights", "Highlights", <path d="M10 2l4 4-6.5 6.5H3.5v-4zM2 14.5h7" />],
];

const icon = (d: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
    {d}
  </svg>
);

export default function App() {
  const [vault, setVault] = useState<string | null>(null);
  const load = usePapers((s) => s.load);

  useEffect(() => {
    const dir = savedVault();
    if (dir) openVault(dir).then(() => setVault(dir), (err) => console.error("cannot open saved vault", err));
  }, []);
  useEffect(() => {
    if (vault) load();
  }, [vault, load]);

  if (!vault)
    return (
      <div className="welcome">
        <h1>Notero</h1>
        <p>Pick a folder for your papers, notes and canvases. Obsidian can open the same folder.</p>
        <button className="primary" onClick={async () => setVault(await chooseVault())}>
          Choose vault folder…
        </button>
      </div>
    );
  return <Workspace />;
}

function Workspace() {
  usePdfDropImport();
  // Save what's pending before the window closes or the app quits (Rust waits for "quit").
  useEffect(() => {
    const save = () => flushAll().then(() => {}, console.error);
    const unlisten = [
      getCurrentWindow().onCloseRequested(save),
      listen("quit-requested", () => save().finally(() => invoke("quit"))),
    ];
    return () => unlisten.forEach((u) => u.then((f) => f()));
  }, []);
  // Only what the shell shows: subscribing to the whole store re-rendered every pane on each jump/insert.
  const { sidebarOpen, sidebarTab, setSidebarOpen, setSidebarTab } = useUI(
    useShallow((s) => ({ sidebarOpen: s.sidebarOpen, sidebarTab: s.sidebarTab, setSidebarOpen: s.setSidebarOpen, setSidebarTab: s.setSidebarTab })),
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "\\") setSidebarOpen(!useUI.getState().sidebarOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSidebarOpen]);
  const toggle = (
    <button
      className="icon-btn"
      title={`${sidebarOpen ? "Hide" : "Show"} sidebar (⌘\\)`}
      aria-label={`${sidebarOpen ? "Hide" : "Show"} sidebar`}
      onClick={() => setSidebarOpen(!sidebarOpen)}
    >
      {icon(<path d="M3.5 2.5h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM6 2.5v11" />)}
    </button>
  );
  // The sidebar is a collapsible panel so it keeps its state (filters, scroll) while hidden.
  const sidebar = usePanelRef();
  useEffect(() => {
    const p = sidebar.current;
    if (p && sidebarOpen === p.isCollapsed()) (sidebarOpen ? p.expand : p.collapse)();
  }, [sidebar, sidebarOpen]);
  const layout = useDefaultLayout({ id: "notero-layout", storage: localStorage, onlySaveAfterUserInteractions: true });
  return (
    <div className="app">
      {!sidebarOpen && <div className="rail">{toggle}</div>}
      <Group orientation="horizontal" className="main" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
        <Panel
          id="sidebar"
          panelRef={sidebar}
          defaultSize={280}
          minSize={200}
          maxSize={560}
          collapsible
          collapsedSize={0}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(size) => {
            const open = size.inPixels > 0; // dragged shut, or reopened by dragging
            if (open !== useUI.getState().sidebarOpen) setSidebarOpen(open);
          }}
        >
          <aside className="app-sidebar" hidden={!sidebarOpen}>
            <nav className="tabs">
              {TABS.map(([id, label, d]) => (
                <button key={id} aria-pressed={sidebarTab === id} title={label} aria-label={label} onClick={() => setSidebarTab(id)}>
                  {icon(d)}
                  <span className="tab-label">{label}</span>
                </button>
              ))}
              <span className="tabs-spacer" />
              {toggle}
            </nav>
            <div className="sidebar-body">
              {sidebarTab === "library" && <LibraryPanel />}
              {sidebarTab === "notes" && <NotesPanel />}
              {sidebarTab === "canvases" && <CanvasesPanel />}
              {sidebarTab === "highlights" && <HighlightsPanel />}
            </div>
          </aside>
        </Panel>
        <Separator className="separator" />
        <Panel id="pdf" minSize="20">
          <PdfPane />
        </Panel>
        <Separator className="separator" />
        <Panel id="right" minSize="20">
          <RightPane />
        </Panel>
      </Group>
    </div>
  );
}
