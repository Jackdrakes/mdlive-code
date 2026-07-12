import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView, keymap } from "@codemirror/view";
import { search, openSearchPanel } from "@codemirror/search";
import { useCallback, useEffect, useRef } from "react";
import { postMessage } from "../vscodeApi";

interface SelectionRequest {
  fromLine: number;
  toLine: number;
  id: number;
}

interface EditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  selectionRequest?: SelectionRequest | null;
}

export function EditorPanel({ value, onChange, selectionRequest }: EditorPanelProps) {
  const editorRef = useRef<EditorView | null>(null);

  const triggerSave = useCallback(() => {
    if (editorRef.current) {
      postMessage({ type: "save", content: editorRef.current.state.doc.toString() });
    }
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      triggerSave();
    }
  }, [triggerSave]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.dom.addEventListener("keydown", handleKeyDown);
    return () => editor.dom.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!selectionRequest || !editorRef.current) return;
    const { fromLine, toLine } = selectionRequest;
    const view = editorRef.current;
    const doc = view.state.doc;
    if (fromLine < 1 || toLine > doc.lines) return;
    const from = doc.line(fromLine).from;
    const to = doc.line(toLine).to;

    view.dispatch({
      selection: { anchor: from, head: to },
    });
    view.focus();

    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || !editorRef.current) return;
        try {
          const { node } = editorRef.current.domAtPos(from);
          const el: Element = node.nodeType === 3 ? node.parentElement! : (node as Element);
          const line = el.closest(".cm-line") || el;
          line.scrollIntoView({ block: "center" });
        } catch {
          const v = editorRef.current;
          const block = v.lineBlockAt(from);
          v.scrollDOM.scrollTop = block.top - v.scrollDOM.clientHeight / 3;
        }
      });
    });

    return () => { cancelled = true; };
  }, [selectionRequest]);

  const customKeymap = keymap.of([
    {
      key: "Enter",
      run: (view) => {
        const state = view.state;
        const pos = state.selection.main.head;
        const line = state.doc.lineAt(pos);
        const lineText = line.text.trim();

        if (lineText === ":w") {
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: "" },
            selection: { anchor: line.from },
          });
          postMessage({ type: "save", content: view.state.doc.toString() });
          return true;
        }
        return false;
      },
    },
    {
      key: "Mod-h",
      run: (view) => {
        openSearchPanel(view);
        return true;
      },
    },
  ]);

  return (
    <div className="h-full w-full overflow-hidden">
      <CodeMirror
        value={value}
        height="100%"
        theme={vscodeDark}
        extensions={[markdown(), search(), customKeymap]}
        onChange={onChange}
        onCreateEditor={(editor) => {
          editorRef.current = editor;
        }}

        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          rectangularSelection: true,
          highlightSelectionMatches: true,
          tabSize: 4,
        }}
      />
    </div>
  );
}
