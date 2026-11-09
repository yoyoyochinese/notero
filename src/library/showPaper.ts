// Opening a paper from the library: its PDF on the left and, unless a free note is open, its note on the right.
import { useUI } from "../store";
import { createFile, listDir, mtimeOf } from "../vault";
import { usePapers } from "../papers";

export async function showPaper(citekey: string) {
  const ui = useUI.getState();
  ui.openPaper(citekey);
  // A free note spans papers and stays (decision 9); this paper's own note stays too.
  if (ui.notePath?.startsWith("notes/") || ui.notePath?.startsWith(`papers/${citekey}/`)) return;
  const dir = `papers/${citekey}/notes`;
  const names = (await listDir(dir)).filter((e) => e.isFile && e.name.endsWith(".md")).map((e) => `${dir}/${e.name}`);
  const latest = (await Promise.all(names.map(async (p) => ({ p, t: (await mtimeOf(p)) ?? 0 })))).sort((a, b) => b.t - a.t)[0];
  const title = usePapers.getState().papers[citekey]?.title;
  const path = latest?.p ?? (await createFile(dir, "md", title ? `# ${title}\n\n` : "", citekey));
  if (useUI.getState().citekey === citekey) useUI.getState().openNote(path); // unless another paper was opened meanwhile
}
