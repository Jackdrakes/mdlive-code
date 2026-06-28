import { useState, useEffect, useCallback, useRef } from "react";
import { Toolbar } from "./components/Toolbar";
import { EditorPanel } from "./components/EditorPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { ViewMode } from "./types";
import { postMessage } from "./vscodeApi";
import { DEFAULT_CONTENT } from "./lib/constants";
import { countWords, countCharacters } from "./lib/markdown";

export default function App() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const contentRef = useRef(content);
  contentRef.current = content;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "setContent") {
        setContent(message.content);
      }
    };

    window.addEventListener("message", handler);
    postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handler);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const wc = countWords(content);
  const cc = countCharacters(content);

  const handleChange = useCallback((value: string) => {
    setContent(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      postMessage({ type: "contentChanged", content: contentRef.current });
    }, 300);
  }, []);

  return (
    <div className="app-container">
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <div className="app-content">
        {viewMode !== "preview" && (
          <div className={`panel ${viewMode === "split" ? "panel-split panel-border" : "panel-full"}`}>
            <EditorPanel value={content} onChange={handleChange} />
          </div>
        )}
        {viewMode !== "editor" && (
          <div className={`panel ${viewMode === "split" ? "panel-split" : "panel-full"}`}>
            <PreviewPanel markdown={content} />
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          height: 28,
          padding: "0 12px",
          background: "var(--bg-secondary)",
          borderTop: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-secondary)",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <span>Words: {wc}</span>
        <span>Chars: {cc}</span>
      </div>
    </div>
  );
}
