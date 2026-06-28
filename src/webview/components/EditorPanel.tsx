import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { useCallback, useRef } from "react";
import { postMessage } from "../vscodeApi";

interface EditorPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export function EditorPanel({ value, onChange }: EditorPanelProps) {
  const editorRef = useRef<EditorView | null>(null);

  const triggerSave = useCallback(() => {
    if (editorRef.current) {
      postMessage({ type: "save", content: editorRef.current.state.doc.toString() });
    }
  }, []);

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
  ]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      triggerSave();
    }
  };

  return (
    <div className="h-full w-full overflow-hidden">
      <CodeMirror
        value={value}
        height="100%"
        theme={oneDark}
        extensions={[markdown(), customKeymap]}
        onChange={onChange}
        onCreateEditor={(editor) => {
          editorRef.current = editor;
          editor.dom.addEventListener("keydown", handleKeyDown);
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
        }}
      />
    </div>
  );
}
