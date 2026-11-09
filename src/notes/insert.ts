/**
 * Where and what to insert so `text` becomes its own paragraph near `pos` in `doc`.
 * A cursor in the middle of a line inserts after that line instead of splitting it.
 */
export function paragraphInsert(doc: string, pos: number, text: string) {
  let from = pos;
  if (pos > 0 && doc[pos - 1] !== "\n") {
    const eol = doc.indexOf("\n", pos);
    from = eol < 0 ? doc.length : eol;
  }
  const before = doc.slice(0, from);
  const after = doc.slice(from);
  const pre = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const post = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return { from, insert: pre + text + post };
}
