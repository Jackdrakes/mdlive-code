import type { Root, Content, Text, Link } from "mdast";

const WIKILINK_RE = /(?<![\\!])\[\[([^\[\]\n]+?)\]\]/g;

export function displayTextForWikilink(inner: string): string {
  const barIdx = inner.indexOf("|");
  if (barIdx !== -1) return inner.slice(barIdx + 1);
  const hashIdx = inner.indexOf("#");
  if (hashIdx === 0) return inner.slice(1);
  if (hashIdx !== -1) return inner.slice(0, hashIdx);
  return inner;
}

function makeLink(inner: string): Link {
  return {
    type: "link",
    url: `[[${inner}]]`,
    children: [{ type: "text", value: displayTextForWikilink(inner) }],
  };
}

function splitWikilinks(value: string): Content[] {
  const out: Content[] = [];
  let lastIndex = 0;
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(value)) !== null) {
    if (match.index > lastIndex) {
      out.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    out.push(makeLink(match[1]));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return [{ type: "text", value }];
  if (lastIndex < value.length) {
    out.push({ type: "text", value: value.slice(lastIndex) });
  }
  return out;
}

function transformChildren(children: Content[], skipText: boolean): void {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === "text") {
      if (skipText) continue;
      const parts = splitWikilinks((child as Text).value);
      if (parts.length !== 1 || parts[0] !== child) {
        children.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
    } else if (child.type === "link" || child.type === "image") {
      continue;
    } else if ("children" in child && Array.isArray(child.children)) {
      transformChildren(child.children as Content[], false);
    }
  }
}

export function remarkWikilinks() {
  return (tree: Root) => {
    transformChildren(tree.children, false);
  };
}