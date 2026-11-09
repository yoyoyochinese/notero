// UI navigation state shared by all panes.
import { create } from "zustand";

export type SidebarTab = "library" | "notes" | "canvases";
export type RightTab = "note" | "canvas";
/** A request for the PDF pane to scroll somewhere; nonce makes repeated jumps distinct. */
export type Jump = { citekey: string; page: number; highlightId?: string; nonce: number };

type State = {
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  citekey: string | null; // paper shown in the PDF pane
  rightTab: RightTab;
  notePath: string | null; // vault-relative .md shown in the Note tab
  canvasPath: string | null; // vault-relative .canvas shown in the Canvas tab
  jump: Jump | null;
  /** Markdown waiting to be inserted at the cursor of the open note; NoteEditor consumes it. */
  insert: { text: string; nonce: number } | null;

  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setRightTab: (tab: RightTab) => void;
  openPaper: (citekey: string) => void;
  openNote: (path: string) => void;
  openCanvas: (path: string) => void;
  jumpTo: (citekey: string, page: number, highlightId?: string) => void;
  requestInsert: (text: string) => void;
  clearInsert: () => void;
};

export const useUI = create<State>((set) => ({
  sidebarOpen: true,
  sidebarTab: "library",
  citekey: null,
  rightTab: "note",
  notePath: null,
  canvasPath: null,
  jump: null,
  insert: null,

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab, sidebarOpen: true }),
  setRightTab: (rightTab) => set({ rightTab }),
  openPaper: (citekey) => set({ citekey }),
  openNote: (notePath) => {
    const ck = /^papers\/([^/]+)\/notes\//.exec(notePath)?.[1];
    set({ notePath, rightTab: "note", ...(ck && { citekey: ck }) });
  },
  openCanvas: (canvasPath) => set({ canvasPath, rightTab: "canvas" }),
  jumpTo: (citekey, page, highlightId) =>
    set({ citekey, jump: { citekey, page, highlightId, nonce: Date.now() } }),
  requestInsert: (text) => set({ insert: { text, nonce: Date.now() }, rightTab: "note" }),
  clearInsert: () => set({ insert: null }),
}));
