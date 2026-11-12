import * as path from "path";
import { slugify } from "./slug";

export interface ParsedWikilinkRef {
  isEmbed: boolean;
  target: string;
  heading?: string;
  alias?: string;
}

export interface ResolvedCore {
  targetPath: string;
  heading?: string;
  isEmbed: boolean;
  displayText: string;
}

export type StatFn = (filePath: string) => Promise<boolean>;

export interface FileSystem {
  exists(filePath: string): Promise<boolean>;
}

export function parseWikilinkRef(raw: string): ParsedWikilinkRef {
  const isEmbed = raw.startsWith("!");
  const inner = isEmbed ? raw.slice(1) : raw;
  let target = inner;
  let heading: string | undefined;
  let alias: string | undefined;

  const pipeIdx = inner.indexOf("|");
  if (pipeIdx !== -1) {
    alias = inner.slice(pipeIdx + 1);
    target = inner.slice(0, pipeIdx);
  }

  const hashIdx = target.indexOf("#");
  if (hashIdx !== -1) {
    heading = target.slice(hashIdx + 1) || undefined;
    target = target.slice(0, hashIdx);
  }

  return { isEmbed, target, heading, alias };
}

function hasMarkdownExt(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function basenameNoMd(filePath: string): string {
  const base = path.basename(filePath);
  if (base.toLowerCase().endsWith(".md")) return base.slice(0, -3);
  if (base.toLowerCase().endsWith(".markdown")) return base.slice(0, -9);
  return base;
}

export function displayNameForPath(filePath: string): string {
  return basenameNoMd(filePath) || path.basename(filePath);
}

async function findWithMarkdownExt(
  base: string,
  fs: FileSystem
): Promise<string | null> {
  if (await fs.exists(base)) return base;
  if (!hasMarkdownExt(base)) {
    const withMd = base.endsWith(".md") ? base : base + ".md";
    if (await fs.exists(withMd)) return withMd;
  }
  return null;
}

export async function resolveObsidianTarget(
  raw: string,
  fromFile: string,
  vaultRoot: string,
  mdFiles: string[],
  fs: FileSystem
): Promise<ResolvedCore | null> {
  const { isEmbed, target, heading, alias } = parseWikilinkRef(raw);

  if (!target) {
    return {
      targetPath: fromFile,
      heading,
      isEmbed,
      displayText: alias || "",
    };
  }

  const fromDir = path.dirname(fromFile);

  // 1. Exact path — absolute, vault-relative, or relative to the current file
  const candidates: string[] = [];
  if (path.isAbsolute(target)) {
    candidates.push(target);
  } else {
    candidates.push(path.join(vaultRoot, target));
    candidates.push(path.resolve(fromDir, target));
  }

  for (const candidate of candidates) {
    const found = await findWithMarkdownExt(candidate, fs);
    if (found) {
      return {
        targetPath: found,
        heading,
        isEmbed,
        displayText: alias || displayNameForPath(found),
      };
    }
  }

  // 2. Shortest unique basename match across the vault
  const basename = basenameNoMd(target).toLowerCase();
  const matches = mdFiles.filter(
    (f) => basenameNoMd(f).toLowerCase() === basename
  );
  if (matches.length === 1) {
    return {
      targetPath: matches[0],
      heading,
      isEmbed,
      displayText: alias || basenameNoMd(matches[0]),
    };
  }

  // 3. Partial basename match
  const partialMatches = mdFiles.filter((f) =>
    basenameNoMd(f).toLowerCase().includes(basename)
  );
  if (partialMatches.length === 1) {
    return {
      targetPath: partialMatches[0],
      heading,
      isEmbed,
      displayText: alias || basenameNoMd(partialMatches[0]),
    };
  }

  // 4. Same-directory partial match
  const sameDirMatches = mdFiles.filter(
    (f) => path.dirname(f) === fromDir && basenameNoMd(f).toLowerCase().includes(basename)
  );
  if (sameDirMatches.length === 1) {
    return {
      targetPath: sameDirMatches[0],
      heading,
      isEmbed,
      displayText: alias || basenameNoMd(sameDirMatches[0]),
    };
  }

  return null;
}

export async function resolveMarkdownTarget(
  rawLink: string,
  fromFile: string,
  fs: FileSystem,
  vaultRoot?: string
): Promise<ResolvedCore | null> {
  if (rawLink.startsWith("#")) {
    return {
      targetPath: fromFile,
      heading: rawLink.slice(1),
      isEmbed: false,
      displayText: rawLink,
    };
  }

  if (/^https?:\/\//i.test(rawLink)) {
    return null;
  }

  let heading: string | undefined;
  let linkPath = rawLink;
  const hashIdx = rawLink.indexOf("#");
  if (hashIdx !== -1) {
    heading = rawLink.slice(hashIdx + 1) || undefined;
    linkPath = rawLink.slice(0, hashIdx);
  }

  let candidate: string;
  if (linkPath.startsWith("/")) {
    candidate = vaultRoot ? path.join(vaultRoot, linkPath) : path.resolve(linkPath);
  } else {
    candidate = path.resolve(path.dirname(fromFile), linkPath);
  }

  const found = await findWithMarkdownExt(candidate, fs);
  if (!found) return null;

  return {
    targetPath: found,
    heading,
    isEmbed: false,
    displayText: path.basename(found, path.extname(found)),
  };
}

export function isSameFileTarget(targetPath: string, fromFile: string): boolean {
  return path.resolve(targetPath) === path.resolve(fromFile);
}

export function findHeadingLine(content: string, slug: string): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    if (slugify(match[1].trim()) === slug) return i + 1;
  }
  return -1;
}