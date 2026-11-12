import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { defaultSchema } from "hast-util-sanitize";
import { Children, cloneElement, isValidElement, useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useScrollBounce } from "../lib/useScrollBounce";
import { computeDiff, DiffLine } from "../lib/diff";
import { postMessage } from "../vscodeApi";
import { IMG_EMBED_MARKER, transformObsidianImageEmbeds } from "../lib/markdown";
import { slugify } from "../../lib/slug";
import { remarkWikilinks } from "../../lib/wikilinks";

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src || []), "data", "mdlive-embed"],
  },
} as any;

function decodeHref(u: string): string {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

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

type CopyState = "idle" | "copied" | "error";

function CopyButton({ code }: { code: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flash = useCallback((next: CopyState) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(next);
    timerRef.current = setTimeout(() => setState("idle"), 2000);
  }, []);

  const fallbackCopy = useCallback(async (text: string): Promise<boolean> => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    const selection = document.getSelection();
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    } finally {
      document.body.removeChild(textarea);
      if (selection && previousRange) {
        selection.removeAllRanges();
        selection.addRange(previousRange);
      }
    }
    return ok;
  }, []);

  const copyViaExtension = useCallback((text: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve(false);
      }, 2000);
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "copyCompleted") {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          resolve(true);
        }
      };
      window.addEventListener("message", handler);
      postMessage({ type: "copyToClipboard", text });
    });
  }, []);

  const handleCopy = useCallback(async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = await fallbackCopy(code);
    if (!ok) {
      ok = await copyViaExtension(code);
    }
    flash(ok ? "copied" : "error");
  }, [code, fallbackCopy, copyViaExtension, flash]);

  const copied = state === "copied";
  const failed = state === "error";

  return (
    <button
      type="button"
      className={`copy-btn${copied ? " copied" : ""}${failed ? " error" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        handleCopy();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={copied ? "Copied!" : failed ? "Copy failed" : "Copy code"}
    >
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
      {(copied || failed) && (
        <span className="copy-label" aria-live="polite">
          {copied ? "Copied" : "Copy failed"}
        </span>
      )}
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
  const [fullWidth, setFullWidth] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useScrollBounce(viewportRef, contentRef);

  const processedMarkdown = useMemo(() => transformObsidianImageEmbeds(markdown), [markdown]);

  const diffLines = useMemo<DiffLine[]>(() => {
    if (!showDiff || savedMarkdown === undefined) return [];
    return computeDiff(savedMarkdown, markdown);
  }, [showDiff, savedMarkdown, markdown]);

  const handleBlockDoubleClick = useCallback((startLine: number, endLine: number) => {
    onDoubleClickLine?.(startLine, endLine);
  }, [onDoubleClickLine]);

  const headingIdsByLine = useMemo(() => {
    const counts = new Map<string, number>();
    const ids = new Map<number, string>();
    const lines = markdown.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      if (!match) continue;

      const base = slugify(match[1].trim());
      const occurrence = counts.get(base) ?? 0;
      counts.set(base, occurrence + 1);
      ids.set(i + 1, occurrence === 0 ? base : `${base}-${occurrence}`);
    }

    return ids;
  }, [markdown]);

  const previewComponents = useMemo(() => {
    const getHeadingId = (node: any, children: React.ReactNode): string => {
      return headingIdsByLine.get(node?.position?.start?.line) || slugify(getHeadingText(children));
    };

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
          <div className="code-block-wrap" onDoubleClick={dbl}>
            <pre {...rest}>{children}</pre>
            <CopyButton code={codeText} />
          </div>
        );
      },
      h1: ({ children, node, ...rest }: any) => {
        const id = getHeadingId(node, children);
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h1 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h1>;
      },
      h2: ({ children, node, ...rest }: any) => {
        const id = getHeadingId(node, children);
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h2 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h2>;
      },
      h3: ({ children, node, ...rest }: any) => {
        const id = getHeadingId(node, children);
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h3 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h3>;
      },
      h4: ({ children, node, ...rest }: any) => {
        const id = getHeadingId(node, children);
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h4 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h4>;
      },
      h5: ({ children, node, ...rest }: any) => {
        const id = getHeadingId(node, children);
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h5 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h5>;
      },
      h6: ({ children, node, ...rest }: any) => {
        const id = getHeadingId(node, children);
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        return <h6 id={id} className="heading-anchor" onDoubleClick={dbl}><a href={`#${id}`} className="anchor-link" aria-hidden="true">#</a>{children}</h6>;
      },
      a: ({ href, children, ...rest }: any) => {
        // remark-rehype percent-encodes link targets, so decode before matching
        href = decodeHref(href);
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
        const sl = node?.position?.start?.line;
        const el = node?.position?.end?.line;
        const dbl = sl && el && onDoubleClickLine ? () => handleBlockDoubleClick(sl, el) : undefined;
        if (isTaskItem) {
          const lineIndex = typeof sl === "number" ? sl - 1 : undefined;
          const taskChildren = Children.map(children, (child) => {
            if (!isValidElement(child) || child.type !== "input") return child;
            return cloneElement(child as React.ReactElement<any>, {
              disabled: false,
              onClick: (event: React.MouseEvent<HTMLInputElement>) => event.stopPropagation(),
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                event.stopPropagation();
                if (lineIndex !== undefined) onToggleCheckbox?.(lineIndex);
              },
            });
          });
          return (
            <li
              className={className}
              {...rest}
              onClick={(event: React.MouseEvent<HTMLLIElement>) => {
                const target = event.target;
                if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
                event.stopPropagation();
                if (lineIndex !== undefined) onToggleCheckbox?.(lineIndex);
              }}
              onDoubleClick={dbl}
            >
              {taskChildren}
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
  }, [onToggleCheckbox, onDoubleClickLine, handleBlockDoubleClick, imageMap, headingIdsByLine]);

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
        <div>
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
                remarkPlugins={[remarkGfm, remarkWikilinks]}
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
