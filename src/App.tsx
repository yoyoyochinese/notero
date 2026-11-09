import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { CanvasesPanel } from "./canvas/CanvasesPanel";
import { usePdfDropImport } from "./library/importPdf";
import { LibraryPanel } from "./library/LibraryPanel";
import { NotesPanel } from "./notes/NotesPanel";
import { usePapers } from "./papers";
import { PdfPane } from "./pdf/PdfPane";
import { RightPane } from "./RightPane";
import { type SidebarTab, useUI } from "./store";
import { chooseVault, openVault, savedVault } from "./vault";
import "./App.css";

const TABS: [SidebarTab, string][] = [
  ["library", "Library"],
  ["notes", "Notes"],
  ["canvases", "Canvases"],
];

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
        <button onClick={async () => setVault(await chooseVault())}>Choose vault folder…</button>
      </div>
    );
  return <Workspace />;
}

function Workspace() {
  usePdfDropImport();
  const { sidebarOpen, sidebarTab, setSidebarOpen, setSidebarTab } = useUI();
  return (
    <div className="app">
      <aside className="sidebar" hidden={!sidebarOpen}>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} aria-pressed={sidebarTab === id} onClick={() => setSidebarTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-body">
          {sidebarTab === "library" && <LibraryPanel />}
          {sidebarTab === "notes" && <NotesPanel />}
          {sidebarTab === "canvases" && <CanvasesPanel />}
        </div>
      </aside>
      <button
        className="sidebar-toggle"
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? "‹" : "›"}
      </button>
      <Group orientation="horizontal" className="main">
        <Panel defaultSize="50" minSize="20">
          <PdfPane />
        </Panel>
        <Separator className="separator" />
        <Panel defaultSize="50" minSize="20">
          <RightPane />
        </Panel>
      </Group>
    </div>
  );
}
