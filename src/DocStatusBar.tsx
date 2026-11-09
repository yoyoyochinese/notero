// Shown above an editor when its file needs attention. Pass the return value of useFileDoc.
import type { useFileDoc } from "./useFileDoc";

export function DocStatusBar({ doc }: { doc: ReturnType<typeof useFileDoc> }) {
  if (doc.status === "conflict")
    return (
      <div className="doc-bar warn" role="alert">
        This file was changed by another app. Your latest edits are not saved.
        <button onClick={doc.reload}>Discard mine and reload</button>
        <button onClick={doc.overwrite}>Keep mine</button>
      </div>
    );
  if (doc.status === "error")
    return (
      <div className="doc-bar warn" role="alert">
        Could not read or save this file. See the console for details.
      </div>
    );
  return null;
}
