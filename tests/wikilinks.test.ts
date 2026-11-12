import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Content } from "mdast";
import { displayTextForWikilink, remarkWikilinks } from "../src/lib/wikilinks";

interface CapturedLink {
  url: string;
  text: string;
}

function collectLinks(node: Content | Root, out: CapturedLink[] = []): CapturedLink[] {
  if (node.type === "link") {
    const text = "children" in node ? node.children.map((c) => "value" in c ? c.value : "").join("") : "";
    out.push({ url: node.url, text });
  }
  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) collectLinks(child, out);
  }
  return out;
}

async function parseLinks(markdown: string): Promise<CapturedLink[]> {
  const processor = unified().use(remarkParse).use(remarkWikilinks);
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  return collectLinks(tree);
}

function sourceValue(markdown: string): Promise<string> {
  return parseLinks(markdown).then((links) => links.map((l) => `${l.url}::${l.text}`).join("|"));
}

describe("remarkWikilinks", () => {
  it("converts [[Note]] to a link", async () => {
    expect(await sourceValue("See [[Note]] here")).toBe("[[Note]]::Note");
  });

  it("preserves surrounding plain text", async () => {
    const links = await parseLinks("Before [[Note]] after");
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ url: "[[Note]]", text: "Note" });
  });

  it("handles multiple wikilinks on one line", async () => {
    expect(await sourceValue("[[A]] and [[B]]")).toBe("[[A]]::A|[[B]]::B");
  });

  it("displays the alias for [[Note|Alias]]", async () => {
    expect(await sourceValue("[[Note|Alias]]")).toBe("[[Note|Alias]]::Alias");
  });

  it("displays the note name for [[Note#Heading]]", async () => {
    expect(await sourceValue("[[Note#Heading]]")).toBe("[[Note#Heading]]::Note");
  });

  it("displays the alias for [[Note#Heading|Alias]]", async () => {
    expect(await sourceValue("[[Note#Heading|Alias]]")).toBe("[[Note#Heading|Alias]]::Alias");
  });

  it("displays the heading for [[#Heading]]", async () => {
    expect(await sourceValue("[[#Heading]]")).toBe("[[#Heading]]::Heading");
  });

  it("does not convert wikilinks inside inline code", async () => {
    const links = await parseLinks("`[[Code]]` stays literal");
    expect(links).toHaveLength(0);
  });

  it("does not convert wikilinks inside fenced code blocks", async () => {
    const links = await parseLinks("```\n[[NotALink]]\n```\n\nReal [[Note]]");
    expect(links.map((l) => l.url)).toEqual(["[[Note]]"]);
  });

  it("does not convert embedded links (![[...]])", async () => {
    const links = await parseLinks("![[NotALink]] stays literal");
    expect(links).toHaveLength(0);
  });

  it("does not create nested links inside existing markdown links", async () => {
    const links = await parseLinks("[see [[Note]]](https://example.com)");
    expect(links).toEqual([{ url: "https://example.com", text: "see [[Note]]" }]);
  });

  it("works inside headings", async () => {
    const links = await parseLinks("## View [[Note]]");
    expect(links).toEqual([{ url: "[[Note]]", text: "Note" }]);
  });

  it("works inside list items", async () => {
    const links = await parseLinks("- item with [[Note]]");
    expect(links).toEqual([{ url: "[[Note]]", text: "Note" }]);
  });
});

describe("displayTextForWikilink", () => {
  it("returns the inner target by default", () => {
    expect(displayTextForWikilink("Note")).toBe("Note");
  });
  it("returns the alias part", () => {
    expect(displayTextForWikilink("Note|Alias")).toBe("Alias");
  });
  it("returns the note name for heading refs", () => {
    expect(displayTextForWikilink("Note#Heading")).toBe("Note");
  });
  it("returns the heading for same-note refs", () => {
    expect(displayTextForWikilink("#Heading")).toBe("Heading");
  });
});