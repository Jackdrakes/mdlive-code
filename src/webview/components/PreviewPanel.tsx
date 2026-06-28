import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { useState, useMemo, useRef, useCallback } from "react";
import { useScrollBounce } from "../lib/useScrollBounce";
import { computeDiff, DiffLine } from "../lib/diff";

interface PreviewPanelProps {
  markdown: string;
  onToggleCheckbox?: (lineIndex: number) => void;
  savedMarkdown?: string;
  showDiff?: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button className="copy-btn" onClick={handleCopy} title="Copy code">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {copied ? (
          <polyline points="20 6 9 17 4 12" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
    </button>
  );
}

function extractCodeFromPre(children: React.ReactNode): string {
  const getText = (node: React.ReactNode): string => {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (!node) return "";
    if (Array.isArray(node)) return node.map(getText).join("");
    if (typeof node === "object" && "props" in node) {
      return getText((node as any).props?.children);
    }
    return "";
  };
  return getText(children);
}

function getHeadingText(children: React.ReactNode): string {
  const getText = (node: React.ReactNode): string => {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (!node) return "";
    if (Array.isArray(node)) return node.map(getText).join("");
    if (typeof node === "object" && "props" in node) {
      return getText((node as any).props?.children);
    }
    return "";
  };
  return getText(children);
}

export function PreviewPanel({ markdown, onToggleCheckbox, savedMarkdown, showDiff }: PreviewPanelProps) {
  const lines = markdown.split("\n");
  const [fullWidth, setFullWidth] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const checkboxRenderIndex = useRef(0);
  useScrollBounce(viewportRef, contentRef);

  checkboxRenderIndex.current = 0;

  const diffLines = useMemo<DiffLine[]>(() => {
    if (!showDiff || savedMarkdown === undefined) return [];
    return computeDiff(savedMarkdown, markdown);
  }, [showDiff, savedMarkdown, markdown]);

  const checkboxData = useMemo(() => {
    const data: { lineIndex: number; checked: boolean }[] = [];
    lines.forEach((line, index) => {
      const match = line.match(/^(\s*)-\s*\[([ x])\]/);
      if (match) {
        data.push({ lineIndex: index, checked: match[2] === "x" });
      }
    });
    return data;
  }, [markdown]);

  return (
    <div ref={viewportRef} style={{ background: "var(--bg-secondary)", height: "100%", overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div ref={contentRef} style={{ flex: 1, minHeight: "100%" }}>
        <div className={`markdown-preview-container ${fullWidth ? "full-width" : ""}`}>
        <button
          onClick={() => setFullWidth((v) => !v)}
          className="fullwidth-btn"
          title={fullWidth ? "Constrain width" : "Full width"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {fullWidth ? (
              <>
                <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
                <path d="M16 3h3a2 2 0 0 1 2 2v14c0 1.1-.9 2-2 2h-3" />
                <path d="m15 9-3 3 3 3" />
                <path d="M12 2v2" />
                <path d="m9 9 3 3-3 3" />
                <path d="M12 20v2" />
              </>
            ) : (
              <>
                <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
                <path d="M16 3h3a2 2 0 0 1 2 2v14c0 1.1-.9 2-2 2h-3" />
                <path d="m10 17-5-5 5-5" />
                <path d="M12 2v2" />
                <path d="m14 7 5 5-5 5" />
                <path d="M12 20v2" />
              </>
            )}
          </svg>
        </button>
        <div className="markdown-preview-container">
          {showDiff ? (
            <div className="diff-view">
              {diffLines.map((line, i) => (
                <div key={i} className={`diff-line diff-${line.type}`}>
                  <span className="diff-line-num diff-old-num">
                    {line.oldLineNum ?? ""}
                  </span>
                  <span className="diff-line-num diff-new-num">
                    {line.newLineNum ?? ""}
                  </span>
                  <span className="diff-line-content">{line.value || " "}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="markdown-preview">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                components={{
                  pre: ({ children, ...props }) => {
                    const codeText = extractCodeFromPre(children);
                    return (
                      <div className="relative">
                        <pre {...props}>{children}</pre>
                        <CopyButton code={codeText} />
                      </div>
                    );
                  },
                  h1: ({ children, ...props }) => {
                    const id = slugify(getHeadingText(children));
                    return <h1 id={id} {...props} className={`heading-anchor ${props.className || ""}`}>{children}</h1>;
                  },
                  h2: ({ children, ...props }) => {
                    const id = slugify(getHeadingText(children));
                    return <h2 id={id} {...props} className={`heading-anchor ${props.className || ""}`}>{children}</h2>;
                  },
                  h3: ({ children, ...props }) => {
                    const id = slugify(getHeadingText(children));
                    return <h3 id={id} {...props} className={`heading-anchor ${props.className || ""}`}>{children}</h3>;
                  },
                  h4: ({ children, ...props }) => {
                    const id = slugify(getHeadingText(children));
                    return <h4 id={id} {...props} className={`heading-anchor ${props.className || ""}`}>{children}</h4>;
                  },
                  h5: ({ children, ...props }) => {
                    const id = slugify(getHeadingText(children));
                    return <h5 id={id} {...props} className={`heading-anchor ${props.className || ""}`}>{children}</h5>;
                  },
                  h6: ({ children, ...props }) => {
                    const id = slugify(getHeadingText(children));
                    return <h6 id={id} {...props} className={`heading-anchor ${props.className || ""}`}>{children}</h6>;
                  },
                  li: ({ children, className, ...props }) => {
                    const isTaskItem = className?.includes("task-list-item");
                    if (isTaskItem) {
                      const idx = checkboxRenderIndex.current;
                      checkboxRenderIndex.current += 1;
                      const data = checkboxData[idx];
                      const lineIndex = data?.lineIndex;
                      return (
                        <li
                          className={className}
                          {...props}
                          onClick={() => {
                            if (lineIndex !== undefined) onToggleCheckbox?.(lineIndex);
                          }}
                        >
                          {children}
                        </li>
                      );
                    }
                    return <li className={className} {...props}>{children}</li>;
                  },
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
