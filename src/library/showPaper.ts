// Opening a paper from the library: its PDF on the left and, unless a free note is open, its note on the right.
// Each paper also has one canvas, papers/<ck>/<ck>.canvas, created the first time the Canvas tab needs it.
import { useUI } from "../store";
import { ConflictError, createFile, listDir, mtimeOf, writeText } from "../vault";
import { usePapers } from "../papers";

export const paperCanvas = (citekey: string) => `papers/${citekey}/${citekey}.canvas`;

export async function openPaperCanvas(citekey: string) {
  const path = paperCanvas(citekey);
  if ((await mtimeOf(path)) === null)
    await writeText(path, '{"nodes":[],"edges":[]}\n', null).catch((err) => {
      if (!(err instanceof ConflictError)) throw err; // created meanwhile (e.g. a double render): just open it
    });
  useUI.getState().openCanvas(path);
}

export async function showPaper(citekey: string) {
  const ui = useUI.getState();
  ui.openPaper(citekey);
  // Canvases in canvases/ span papers and stay, like free notes; otherwise show this paper's canvas.
  if (!ui.canvasPath?.startsWith("canvases/")) {
    const path = paperCanvas(citekey);
    useUI.setState({ canvasPath: (await mtimeOf(path)) === null ? null : path });
  }
  // A free note spans papers and stays (decision 9); this paper's own note stays too.
  if (ui.notePath?.startsWith("notes/") || ui.notePath?.startsWith(`papers/${citekey}/`)) return;
  const dir = `papers/${citekey}/notes`;
  const names = (await listDir(dir)).filter((e) => e.isFile && e.name.endsWith(".md")).map((e) => `${dir}/${e.name}`);
  const latest = (await Promise.all(names.map(async (p) => ({ p, t: (await mtimeOf(p)) ?? 0 })))).sort((a, b) => b.t - a.t)[0];
  const title = usePapers.getState().papers[citekey]?.title;
  const path = latest?.p ?? (await createFile(dir, "md", title ? `# ${title}\n\n` : "", citekey));
  if (useUI.getState().citekey === citekey) useUI.getState().openNote(path); // unless another paper was opened meanwhile
}
