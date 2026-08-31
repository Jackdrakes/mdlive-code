import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { defaultSchema } from "hast-util-sanitize";
import { useState, useMemo, useRef, useCallback } from "react";
import { useScrollBounce } from "../lib/useScrollBounce";
import { computeDiff, DiffLine } from "../lib/diff";
import { postMessage } from "../vscodeApi";
import { IMG_EMBED_MARKER, transformObsidianImageEmbeds } from "../lib/markdown";

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src || []), "data", "mdlive-embed"],
  },
} as any;

interface PreviewPanelProps {
  markdown: string;
  onToggleCheckbox?: (lineIndex: number) => void;
  savedMarkdown?: string;
  showDiff?: boolean;
  onDoubleClickLine?: (fromLine: number, toLine: number) => void;
  isObsidianVault?: boolean;
  currentFile?: string;
  imageMap?: Record<string, string>;
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

export function PreviewPanel({ markdown, onToggleCheckbox, savedMarkdown, showDiff, onDoubleClickLine, isObsidianVault, currentFile, imageMap }: PreviewPanelProps) {
  const lines = markdown.split("\n");
  const [fullWidth, setFullWidth] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const checkboxRenderIndex = useRef(0);
  useScrollBounce(viewportRef, contentRef);

  checkboxRenderIndex.current = 0;

  const processedMarkdown = useMemo(() => transformObsidianImageEmbeds(markdown), [markdown]);

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

  const handleBlockDoubleClick = useCallback((startLine: number, endLine: number) => {
    onDoubleClickLine?.(startLine, endLine);
  }, [onDoubleClickLine]);

  const previewComponents = useMemo(() => {
    function blockWithDblClick(Tag: "p" | "blockquote" | "pre" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
      return ({ children, node, ...rest }: any) => {
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <Tag {...rest} onDoubleClick={dbl}>{children}</Tag>;
      };
    }

    return {
      p: blockWithDblClick("p"),
      blockquote: blockWithDblClick("blockquote"),
      pre: ({ children, node, ...rest }: any) => {
        const codeText = extractCodeFromPre(children);
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return (
          <div className="relative" onDoubleClick={dbl}>
            <pre {...rest}>{children}</pre>
            <CopyButton code={codeText} />
          </div>
        );
      },
      h1: ({ children, node, ...rest }: any) => {
        const id = slugify(getHeadingText(children));
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h1 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h1>;
      },
      h2: ({ children, node, ...rest }: any) => {
        const id = slugify(getHeadingText(children));
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h2 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h2>;
      },
      h3: ({ children, node, ...rest }: any) => {
        const id = slugify(getHeadingText(children));
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h3 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h3>;
      },
      h4: ({ children, node, ...rest }: any) => {
        const id = slugify(getHeadingText(children));
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h4 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h4>;
      },
      h5: ({ children, node, ...rest }: any) => {
        const id = slugify(getHeadingText(children));
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h5 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h5>;
      },
      h6: ({ children, node, ...rest }: any) => {
        const id = slugify(getHeadingText(children));
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h6 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h6>;
      },
      a: ({ href, children, ...rest }: any) => {
        if (!href) return <a {...rest}>{children}</a>;

        // Anchor-only links — smooth scroll
        if (href.startsWith("#")) {
          return (
            <a href={href} {...rest} onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              const id = href.slice(1);
              const el = document.getElementById(id);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}>{children}</a>
          );
        }

        // Obsidian wikilinks: [[target]] or [[target|alias]]
        const isWikilink = href.startsWith("[[") && href.endsWith("]]");
        // Standard markdown file links: ./path.md, ../path.md, /path.md, or bare filename.md
        const isFileLink = !/^https?:\/\//.test(href) && (
          href.endsWith(".md") || href.endsWith(".markdown") || href.startsWith("#") ||
          /^\.\.?\//.test(href) || /^\//.test(href)
        );

        if (isWikilink || isFileLink) {
          const link = isWikilink ? href.slice(2, -2) : href;
          return (
            <a
              href={href}
              {...rest}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                postMessage({
                  type: "navigate",
                  link,
                  fromFile: currentFile || "",
                });
              }}
            >
              {children}
            </a>
          );
        }

        // External links — open in browser via VS Code
        return (
          <a
            href={href}
            {...rest}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              postMessage({ type: "openExternal", url: href });
            }}
          >
            {children}
          </a>
        );
      },
      li: ({ children, className, node, ...rest }: any) => {
        const isTaskItem = className?.includes("task-list-item");
        const idx = checkboxRenderIndex.current;
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        if (isTaskItem) {
          checkboxRenderIndex.current += 1;
          const data = checkboxData[idx];
          const lineIndex = data?.lineIndex;
          return (
            <li className={className} {...rest} onClick={() => { if (lineIndex !== undefined) onToggleCheckbox?.(lineIndex); }} onDoubleClick={dbl}>
              {children}
            </li>
          );
        }
        return <li className={className} {...rest} onDoubleClick={dbl}>{children}</li>;
      },
      img: ({ src, alt, title, node, ...rest }: any) => {
        let resolvedSrc = src;
        let width: number | undefined;

        if (src && src.startsWith(IMG_EMBED_MARKER)) {
          const restOfSrc = src.slice(IMG_EMBED_MARKER.length);
          const wIdx = restOfSrc.indexOf("?w=");
          const embedTarget = wIdx === -1 ? restOfSrc : restOfSrc.slice(0, wIdx);
          const wValue = wIdx === -1 ? undefined : restOfSrc.slice(wIdx + 3);
          if (wValue !== undefined) width = parseInt(wValue, 10);
          if (imageMap?.[embedTarget]) resolvedSrc = imageMap[embedTarget];
        } else if (
          src &&
          !/^(https?:|data:)/i.test(src) &&
          !/^vscode-webview/.test(src) &&
          imageMap?.[src]
        ) {
          resolvedSrc = imageMap[src];
        }

        return (
          <img
            src={resolvedSrc}
            alt={alt}
            title={title}
            {...rest}
            style={width ? { width: `${width}px`, maxWidth: "100%" } : undefined}
          />
        );
      },
    };
  }, [checkboxData, onToggleCheckbox, onDoubleClickLine, handleBlockDoubleClick, imageMap]);

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
                rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeHighlight]}
                components={previewComponents}
              >
                {processedMarkdown}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
