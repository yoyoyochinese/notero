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
import logo from "./assets/logo.svg";
import "./App.css";

// 16px stroke icons; the label shows for the active tab, or for all tabs when the sidebar is wide.
const TABS: [SidebarTab, string, ReactNode][] = [
  ["library", "Library", <path d="M2.5 2.5v11M5.5 2.5v11M8.5 3.2l3.5 10M1.5 13.5h13" />],
  ["notes", "Notes", <path d="M4 1.5h5.5l3 3v10H4zM6 7.5h4.5M6 10h4.5" />],
  ["canvases", "Canvases", <path d="M1.5 2h5v4h-5zM9.5 10h5v4h-5zM6.5 4H10a1.5 1.5 0 0 1 1.5 1.5V10" />],
  ["highlights", "Highlights", <path d="M10 2l4 4-6.5 6.5H3.5v-4zM2 14.5h7" />],
];

// Default widths (px): the PDF gets a little more than half of what the sidebar leaves.
const SIDEBAR = 300;
const PDF = Math.round((window.innerWidth - SIDEBAR) * 0.55);

// The saved layout is in percent of the window, so the sidebar came back at another width on another monitor
// or window size (and clamped to 200 px on a narrow one). Its width is stored in px instead.
type SavedLayout = { sidebarPx: number; pdf: number; right: number };
const readLayout = (key: string): SavedLayout | null => {
  try {
    return JSON.parse(localStorage.getItem(key)!);
  } catch {
    return null; // unreadable: default widths (the app has no way to clear it)
  }
};
const layoutStorage = {
  getItem(key: string) {
    const saved = readLayout(key);
    if (!saved) return null;
    const { sidebarPx, pdf, right } = saved;
    const sidebar = Math.min((sidebarPx / innerWidth) * 100, 100);
    const k = (100 - sidebar) / (pdf + right);
    return JSON.stringify({ sidebar, pdf: pdf * k, right: right * k });
  },
  setItem(key: string, value: string) {
    const { sidebar, pdf, right } = JSON.parse(value);
    const px = (sidebar / 100) * innerWidth;
    // Collapsed (the 40 px rail; open is 200 px or more): keep the width it reopens at.
    const sidebarPx = px > 100 ? px : (readLayout(key)?.sidebarPx ?? SIDEBAR);
    localStorage.setItem(key, JSON.stringify({ sidebarPx, pdf, right }));
  },
};

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
        <img src={logo} alt="" width={112} height={112} />
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
  // Bump the id when the default widths or the stored format change: a layout saved under the old id would hide them.
  const layout = useDefaultLayout({ id: "notero-layout-3", storage: layoutStorage, onlySaveAfterUserInteractions: true });
  return (
    <div className="app">
      <Group orientation="horizontal" className="main" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
        {/* Collapsed = the 40 px rail, inside the group: a rail beside it shrank the group, and each reopen
            came back W/(W-40) wider. */}
        <Panel
          id="sidebar"
          panelRef={sidebar}
          defaultSize={SIDEBAR}
          minSize={200}
          maxSize={560}
          collapsible
          collapsedSize={40}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(size) => {
            const open = size.inPixels > 40; // dragged shut, or reopened by dragging
            if (open !== useUI.getState().sidebarOpen) setSidebarOpen(open);
          }}
        >
          {!sidebarOpen && <div className="rail">{toggle}</div>}
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
        <Panel id="pdf" defaultSize={PDF} minSize="20">
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
