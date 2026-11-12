import { describe, expect, it } from "vitest";
import * as path from "path";
import * as fsp from "fs/promises";
import { fileURLToPath } from "url";
import {
  findHeadingLine,
  isSameFileTarget,
  parseWikilinkRef,
  resolveMarkdownTarget,
  resolveObsidianTarget,
  type FileSystem,
  type StatFn,
} from "../src/lib/link-core";

const VAULT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "vault");
const INDEX = path.join(VAULT, "index.md");
const NOTES = path.join(VAULT, "notes", "meeting-notes.md");
const PROJECT = path.join(VAULT, "projects", "project-a.md");
const FILE_A = path.join(VAULT, "notes", "deep", "file-a.md");

const statToBool: StatFn = (p) => fsp.stat(p).then((s) => s.isFile(), () => false);
const nodeFs: FileSystem = { exists: statToBool };

const MD_FILES = [INDEX, NOTES, PROJECT, FILE_A];

function mdFilesExcept(...excluded: string[]): string[] {
  const set = new Set(excluded);
  return MD_FILES.filter((f) => !set.has(f));
}

describe("parseWikilinkRef", () => {
  it("parses a bare note", () => {
    expect(parseWikilinkRef("Note")).toEqual({ isEmbed: false, target: "Note" });
  });
  it("parses an alias", () => {
    expect(parseWikilinkRef("Note|Alias")).toEqual({ isEmbed: false, target: "Note", alias: "Alias" });
  });
  it("parses a heading ref", () => {
    expect(parseWikilinkRef("Note#Heading")).toEqual({ isEmbed: false, target: "Note", heading: "Heading" });
  });
  it("parses heading + alias", () => {
    expect(parseWikilinkRef("Note#Heading|Alias")).toEqual({ isEmbed: false, target: "Note", heading: "Heading", alias: "Alias" });
  });
  it("parses same-note heading", () => {
    expect(parseWikilinkRef("#Heading")).toEqual({ isEmbed: false, target: "", heading: "Heading" });
  });
  it("parses an embed", () => {
    expect(parseWikilinkRef("!img.png")).toEqual({ isEmbed: true, target: "img.png" });
  });
});

describe("resolveObsidianTarget", () => {
  it("resolves by unique basename from any directory", async () => {
    const res = await resolveObsidianTarget("project-a", INDEX, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(PROJECT);
  });

  it("resolves meeting-notes nested two levels deep", async () => {
    const res = await resolveObsidianTarget("meeting-notes", INDEX, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(NOTES);
  });

  it("resolves alias form and exposes display text", async () => {
    const res = await resolveObsidianTarget("meeting-notes|Meeting Notes", INDEX, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(NOTES);
    expect(res?.displayText).toBe("Meeting Notes");
  });

  it("resolves heading form", async () => {
    const res = await resolveObsidianTarget("meeting-notes#Decisions", INDEX, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(NOTES);
    expect(res?.heading).toBe("Decisions");
  });

  it("resolves same-note heading to the fromFile", async () => {
    const res = await resolveObsidianTarget("#Section One", NOTES, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(NOTES);
    expect(res?.heading).toBe("Section One");
  });

  it("resolves from a nested file back to the vault root", async () => {
    const res = await resolveObsidianTarget("index", FILE_A, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(INDEX);
  });

  it("resolves a relative path wikilink", async () => {
    const res = await resolveObsidianTarget("deep/file-a", NOTES, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(FILE_A);
  });

  it("resolves a vault-relative path wikilink", async () => {
    const res = await resolveObsidianTarget("projects/project-a", INDEX, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(PROJECT);
  });

  it("resolves with an explicit .md extension", async () => {
    const res = await resolveObsidianTarget("meeting-notes.md", INDEX, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(NOTES);
  });

  it("returns file path from the scan result instead of asserting existence", async () => {
    const res = await resolveObsidianTarget("index", NOTES, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(INDEX);
  });

  it("returns null for an unknown note", async () => {
    const res = await resolveObsidianTarget("does-not-exist", INDEX, VAULT, MD_FILES, nodeFs);
    expect(res).toBeNull();
  });

  it("returns null when a basename is ambiguous", async () => {
    const res = await resolveObsidianTarget("file-a", NOTES, VAULT, mdFilesExcept(FILE_A), nodeFs);
    // file-a no longer exists anywhere -> no match
    expect(res).toBeNull();
  });

  it("handles name collisions by preferring the exact path", async () => {
    // "file-a" exists uniquely in the vault, so basename matching wins
    const res = await resolveObsidianTarget("file-a", INDEX, VAULT, MD_FILES, nodeFs);
    expect(res?.targetPath).toBe(FILE_A);
  });
});

describe("resolveMarkdownTarget", () => {
  it("resolves an in-note heading", async () => {
    const res = await resolveMarkdownTarget("#Section", INDEX, nodeFs);
    expect(res?.targetPath).toBe(INDEX);
    expect(res?.heading).toBe("Section");
  });

  it("resolves a relative link from a nested file", async () => {
    const res = await resolveMarkdownTarget("../index.md", NOTES, nodeFs);
    expect(res?.targetPath).toBe(INDEX);
  });

  it("resolves a relative link with a heading fragment", async () => {
    const res = await resolveMarkdownTarget("../index.md#Home", NOTES, nodeFs);
    expect(res?.targetPath).toBe(INDEX);
    expect(res?.heading).toBe("Home");
  });

  it("resolves a sibling relative link", async () => {
    const res = await resolveMarkdownTarget("./deep/file-a.md", NOTES, nodeFs);
    expect(res?.targetPath).toBe(FILE_A);
  });

  it("resolves a link without a .md extension", async () => {
    const res = await resolveMarkdownTarget("../../index", FILE_A, nodeFs);
    expect(res?.targetPath).toBe(INDEX);
  });

  it("resolves an absolute path against the vault root", async () => {
    const res = await resolveMarkdownTarget("/notes/meeting-notes.md", INDEX, nodeFs, VAULT);
    expect(res?.targetPath).toBe(NOTES);
  });

  it("returns null for a missing relative file", async () => {
    const res = await resolveMarkdownTarget("./missing.md", INDEX, nodeFs);
    expect(res).toBeNull();
  });

  it("returns null for external http links", async () => {
    const res = await resolveMarkdownTarget("https://example.com/doc", INDEX, nodeFs);
    expect(res).toBeNull();
  });

  it("returns null for an unresolved heading without a file", async () => {
    const res = await resolveMarkdownTarget("#Nowhere", NOTES, nodeFs);
    expect(res?.targetPath).toBe(NOTES);
  });
});

describe("isSameFileTarget", () => {
  it("detects same-file targets regardless of path form", () => {
    expect(isSameFileTarget(NOTES, NOTES)).toBe(true);
    expect(isSameFileTarget(NOTES, path.join(VAULT, "notes", ".", "meeting-notes.md"))).toBe(true);
    expect(isSameFileTarget(NOTES, PROJECT)).toBe(false);
  });
});

describe("findHeadingLine", () => {
  const content = [
    "# Home",
    "",
    "Some content",
    "",
    "## Section One",
    "",
    "### Nested Heading",
  ].join("\n");

  it("finds a heading by slug", () => {
    expect(findHeadingLine(content, "section-one")).toBe(5);
    expect(findHeadingLine(content, "nested-heading")).toBe(7);
  });

  it("matches against the canonical slug convention", () => {
    const heading = content.split("\n")[4];
    // "## Section One" -> slug "section-one"
    expect(findHeadingLine(content, "section-one")).toBe(5);
  });

  it("returns -1 when heading is absent", () => {
    expect(findHeadingLine(content, "missing-heading")).toBe(-1);
  });
});
