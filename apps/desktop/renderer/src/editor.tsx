import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  keymap,
} from '@codemirror/view';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import {
  StreamLanguage,
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
} from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { properties } from '@codemirror/legacy-modes/mode/properties';
// Retain CodeMirror's token categories and emphasis, while adapting its built-in
// fixed light palette to the current MineDock theme. No document logic changes.
const syntaxColors: Record<string, string> = {
  '#404740': 'comment',
  '#708': 'keyword',
  '#219': 'name',
  '#164': 'string',
  '#a11': 'string',
  '#e40': 'string',
  '#00f': 'name',
  '#30a': 'name',
  '#085': 'name',
  '#167': 'name',
  '#256': 'name',
  '#00c': 'name',
  '#940': 'comment',
  '#f00': 'invalid',
};
const minedockHighlightStyle = HighlightStyle.define(
  defaultHighlightStyle.specs.map((style) => ({
    ...style,
    ...(style.color ? { color: `var(--syntax-${syntaxColors[style.color] ?? 'name'})` } : {}),
  })),
);
export function TextEditor({
  path,
  value,
  onChange,
  readOnly,
  label,
}: {
  path: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView>(undefined),
    change = useRef(onChange),
    content = useRef(value);
  change.current = onChange;
  content.current = value;
  useEffect(() => {
    const extension = path.split('.').at(-1)?.toLowerCase();
    const language =
      extension === 'json'
        ? json()
        : extension === 'yaml' || extension === 'yml'
          ? yaml()
          : extension === 'xml'
            ? xml()
            : extension === 'toml'
              ? StreamLanguage.define(toml)
              : extension === 'properties'
                ? StreamLanguage.define(properties)
                : [];
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: content.current,
        extensions: [
          language,
          syntaxHighlighting(minedockHighlightStyle, { fallback: true }),
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({
            'aria-label': label,
            'aria-multiline': 'true',
            role: 'textbox',
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
          EditorView.lineWrapping,
        ],
      }),
    });
    view.current = editor;
    return () => {
      view.current = undefined;
      editor.destroy();
    };
  }, [path, readOnly, label]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={host} className="highlighted-editor" />;
}
