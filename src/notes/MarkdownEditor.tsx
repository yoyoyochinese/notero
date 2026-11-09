// Controlled CodeMirror 6 Markdown editor with Obsidian-style live preview: markup is hidden
// and math rendered everywhere except on the lines holding the cursor/selection (when focused).
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { commonmarkLanguage, markdownKeymap, pasteURLAsLink } from "@codemirror/lang-markdown";
import type { MarkdownParser } from "@lezer/markdown";
import { Language, syntaxTree } from "@codemirror/language";
import { Annotation, Compartment, EditorState, Prec, type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, drawSelection, dropCursor, EditorView, keymap, WidgetType } from "@codemirror/view";
import { message } from "@tauri-apps/plugin-dialog";
import { Vim, vim } from "@replit/codemirror-vim";
import { type RefObject, useEffect, useRef } from "react";
import { flushAll } from "../vault";
import { followLink, openWikilink } from "./links";
import "./notes.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  /** Set to the EditorView while mounted, e.g. to insert text at the cursor. */
  viewRef?: RefObject<EditorView | null>;
};

const closingMath = /\$\$\s*$/;

/**
 * Markdown plus [[wikilinks]], $inline$ / $$inline display$$ math, and $$ ... $$ math blocks.
 * Built on commonmarkLanguage rather than markdown(): markdown() always bundles lang-html, lang-css and
 * autocomplete (~430 KB) for HTML tags in Markdown, which notes don't need. The list keymap is added below.
 */
const parser = (commonmarkLanguage.parser as MarkdownParser).configure({
  defineNodes: ["WikiLink", "InlineMath", "BlockMath"],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== 91 || cx.char(pos + 1) !== 91) return -1; // [[
        const m = /^\[\[[^[\]\n]+\]\]/.exec(cx.slice(pos, cx.end));
        return m ? cx.addElement(cx.elt("WikiLink", pos, pos + m[0].length)) : -1;
      },
    },
    {
      name: "InlineMath",
      parse(cx, next, pos) {
        if (next !== 36) return -1; // $
        // No space just inside the dollars and no digit after the closing one, so "$5 and $6" stays text.
        const m = /^\$\$[^$]+\$\$|^\$[^$\s](?:[^$\n]*[^$\s])?\$(?!\d)/.exec(cx.slice(pos, cx.end));
        return m ? cx.addElement(cx.elt("InlineMath", pos, pos + m[0].length)) : -1;
      },
    },
  ],
  parseBlock: [
    {
      name: "BlockMath",
      parse(cx, line) {
        if (!line.text.startsWith("$$", line.pos)) return false;
        const from = cx.lineStart + line.pos;
        let closed = closingMath.test(line.text.slice(line.pos + 2));
        while (!closed && cx.nextLine()) closed = closingMath.test(line.text);
        if (closed) cx.nextLine();
        cx.addElement(cx.elt("BlockMath", from, cx.prevLineEnd()));
        return true;
      },
      endLeaf: (_, line) => line.text.startsWith("$$", line.pos),
    },
  ],
});
// Same language-data facet as lang-markdown's languages: its list keymap checks markdownLanguage.isActiveAt().
export const language = [
  new Language(commonmarkLanguage.data, parser, [], "markdown"),
  Prec.high(keymap.of(markdownKeymap)),
  pasteURLAsLink, // select text, paste a URL → [text](url), as markdown() did
];

// KaTeX (~270 KB plus fonts) loads with the first formula on screen, not at startup.
let katexLoad: Promise<(typeof import("katex"))["default"]> | undefined;
const loadKatex = () =>
  (katexLoad ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => m.default));

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }
  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }
  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "cm-md-math-block" : "cm-md-math";
    el.textContent = this.tex; // until KaTeX is loaded (first formula only)
    loadKatex().then((katex) => {
      katex.render(this.tex, el, { displayMode: this.display, throwOnError: false });
      view.requestMeasure(); // the widget's height changed
    }, console.error);
    return el;
  }
  ignoreEvent() {
    return false; // let a click put the cursor there, revealing the source
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-md-bullet";
    el.textContent = "•";
    return el;
  }
}
const bullet = Decoration.replace({ widget: new BulletWidget() });

const hidden = Decoration.replace({});
const lineClass = (cls: string) => Decoration.line({ class: cls });
const markClass = (cls: string, attributes?: Record<string, string>) => Decoration.mark({ class: cls, attributes });

export function decorate(state: EditorState, focused: boolean): DecorationSet {
  const doc = state.doc;
  const sel = focused && !state.readOnly ? state.selection.ranges : [];
  const raw = (from: number, to: number) => {
    const a = doc.lineAt(from).from;
    const b = doc.lineAt(to).to;
    return sel.some((r) => r.from <= b && r.to >= a);
  };
  const out: Range<Decoration>[] = [];
  const hide = (from: number, to: number) => from < to && out.push(hidden.range(from, to));
  const mark = (cls: string, from: number, to: number, attrs?: Record<string, string>) =>
    from < to && out.push(markClass(cls, attrs).range(from, to));

  syntaxTree(state).iterate({
    enter(n) {
      const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(n.name);
      if (heading) out.push(lineClass(`cm-md-h${heading[1]}`).range(doc.lineAt(n.from).from));
      switch (n.name) {
        case "CodeMark":
        case "HeaderMark":
        case "QuoteMark":
        case "EmphasisMark": {
          if (n.name === "CodeMark" && n.node.parent?.name !== "InlineCode") break; // keep ``` fences visible
          if (raw(n.from, n.to)) mark("cm-md-mark", n.from, n.to);
          else {
            const space = (n.name === "HeaderMark" || n.name === "QuoteMark") && doc.sliceString(n.to, n.to + 1) === " ";
            hide(n.from, space ? n.to + 1 : n.to);
          }
          break;
        }
        case "ListMark":
          // "-", "*", "+" become a bullet; ordered markers ("1.") stay as typed.
          if (/^[-*+]$/.test(doc.sliceString(n.from, n.to)) && !raw(n.from, n.to)) out.push(bullet.range(n.from, n.to));
          break;
        case "Emphasis":
          mark("cm-md-em", n.from, n.to);
          break;
        case "StrongEmphasis":
          mark("cm-md-strong", n.from, n.to);
          break;
        case "InlineCode":
          mark("cm-md-code", n.from, n.to);
          break;
        case "Blockquote":
          for (let l = doc.lineAt(n.from); ; l = doc.line(l.number + 1)) {
            out.push(lineClass("cm-md-quote").range(l.from));
            if (l.to >= n.to || l.number === doc.lines) break;
          }
          break;
        case "Link": {
          const marks = n.node.getChildren("LinkMark");
          const url = n.node.getChild("URL");
          if (marks.length < 2 || !url) break; // reference links etc. stay plain
          const [textFrom, textTo] = [marks[0].to, marks[1].from];
          if (raw(n.from, n.to)) mark("cm-md-link", textFrom, textTo);
          else {
            hide(n.from, textFrom);
            hide(textTo, n.to);
            mark("cm-md-link", textFrom, textTo, { "data-href": doc.sliceString(url.from, url.to) });
          }
          break;
        }
        case "WikiLink": {
          const inner = doc.sliceString(n.from + 2, n.to - 2);
          if (raw(n.from, n.to)) mark("cm-md-link", n.from, n.to);
          else {
            const bar = inner.indexOf("|");
            const textFrom = n.from + 2 + (bar + 1); // after "|" if there is an alias
            hide(n.from, textFrom);
            hide(n.to - 2, n.to);
            mark("cm-md-link", textFrom, n.to - 2, { "data-wiki": inner });
          }
          break;
        }
        case "InlineMath": {
          if (raw(n.from, n.to)) break;
          const src = doc.sliceString(n.from, n.to);
          const display = src.startsWith("$$");
          const tex = src.slice(display ? 2 : 1, display ? -2 : -1);
          out.push(Decoration.replace({ widget: new MathWidget(tex, display) }).range(n.from, n.to));
          break;
        }
        case "BlockMath": {
          const from = doc.lineAt(n.from).from;
          const to = doc.lineAt(n.to).to;
          if (raw(from, to)) break;
          const tex = doc.sliceString(n.from, n.to).trim().replace(/^\$\$|\$\$$/g, "");
          out.push(Decoration.replace({ widget: new MathWidget(tex, true), block: true }).range(from, to));
          return false;
        }
      }
    },
  });
  return Decoration.set(out, true);
}

const setFocus = StateEffect.define<boolean>();

const livePreview = StateField.define<{ focused: boolean; decorations: DecorationSet }>({
  create: (state) => ({ focused: false, decorations: decorate(state, false) }),
  update(value, tr) {
    let focused = value.focused;
    for (const e of tr.effects) if (e.is(setFocus)) focused = e.value;
    const changed =
      focused !== value.focused ||
      tr.docChanged ||
      tr.selection ||
      tr.reconfigured ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState); // background parse progressed
    return changed ? { focused, decorations: decorate(tr.state, focused) } : value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});
// ponytail: decorates the whole document on every cursor move; restrict to view.visibleRanges if long notes lag.

const linkClicks = EditorView.domEventHandlers({
  mousedown(e) {
    const el = e.button === 0 && (e.target as HTMLElement).closest<HTMLElement>("[data-href],[data-wiki]");
    if (!el) return false;
    e.preventDefault();
    if (el.dataset.href) followLink(el.dataset.href);
    else openWikilink(el.dataset.wiki!).catch((err) => message(`Could not open the note: ${err}`, { kind: "error" }));
    return true;
  },
});

const theme = EditorView.theme({
  "&": { color: "var(--fg)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.65" },
  ".cm-content": { caretColor: "var(--fg)", fontFamily: "inherit" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
    background: "var(--selection)",
  },
}, { dark: true });

// :w saves now instead of waiting for the autosave.
Vim.defineEx("write", "w", () => void flushAll());

const external = Annotation.define<boolean>();
const editable = new Compartment();
const editableExt = (readOnly: boolean) => [
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
  // Vim only while editable: read-only previews (idle canvas cards, file cards) would each show its cursor.
  // Highest precedence, ahead of the Markdown keymap, so Enter/Backspace in normal mode move the cursor.
  readOnly ? [] : Prec.highest(vim()),
];

export function MarkdownEditor({ value, onChange, readOnly = false, className, viewRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Texts we emitted whose echo hasn't come back as `value` yet. The parent may hand back a
  // stale one (React Flow takes several renders); treating it as an outside change would undo typing.
  const echoes = useRef<string[]>([]);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          drawSelection(),
          dropCursor(),
          EditorView.lineWrapping,
          language,
          livePreview,
          EditorView.focusChangeEffect.of((_, focusing) => setFocus.of(focusing)),
          linkClicks,
          theme,
          editable.of(editableExt(readOnly)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(external))) {
              const t = u.state.doc.toString();
              echoes.current.push(t);
              if (echoes.current.length > 50) echoes.current.shift();
              onChangeRef.current(t);
            }
          }),
        ],
      }),
    });
    view.current = v;
    if (viewRef) viewRef.current = v;
    return () => {
      v.destroy();
      view.current = null;
      if (viewRef) viewRef.current = null;
    };
    // Created once; value and readOnly changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const i = echoes.current.indexOf(value);
    if (i >= 0) return void echoes.current.splice(0, i + 1);
    echoes.current = [];
    const v = view.current;
    if (v && value !== v.state.doc.toString())
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, annotations: external.of(true) });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.reconfigure(editableExt(readOnly)) });
  }, [readOnly]);

  return <div ref={host} className={className ? `md-editor ${className}` : "md-editor"} />;
}
