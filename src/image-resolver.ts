import * as path from "path";
import * as fs from "fs";

export const IMAGE_EXTENSIONS = [
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tiff",
  ".webp",
];

export const OBSIDIAN_EMBED_RE = /!\[\[([^\]\|\n]+?)(?:\|(\d+))?\]\]/g;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;

export function isRemoteUrl(url: string): boolean {
  return /^(https?:|data:|vscode-webview:)/i.test(url);
}

export function isImageTarget(target: string): boolean {
  const lower = target.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function tryDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function extractMarkdownImageSrcs(content: string): string[] {
  const srcs: string[] = [];
  let match: RegExpExecArray | null;
  MARKDOWN_IMAGE_RE.lastIndex = 0;
  while ((match = MARKDOWN_IMAGE_RE.exec(content)) !== null) {
    const src = match[1].trim();
    if (src && !isRemoteUrl(src)) srcs.push(src);
  }
  return srcs;
}

export function extractObsidianEmbedTargets(content: string): string[] {
  const targets: string[] = [];
  let match: RegExpExecArray | null;
  OBSIDIAN_EMBED_RE.lastIndex = 0;
  while ((match = OBSIDIAN_EMBED_RE.exec(content)) !== null) {
    const target = match[1].trim();
    if (isImageTarget(target)) targets.push(target);
  }
  return targets;
}

function fileExists(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stat) => resolve(!err && stat.isFile()));
  });
}

export async function findImageFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const ignored = new Set(["node_modules", ".git", ".obsidian"]);
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) {
          results.push(...(await findImageFiles(fullPath)));
        }
      } else if (entry.isFile() && isImageTarget(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore unreadable directories
  }
  return results;
}

export async function resolveLocalImage(
  raw: string,
  fromFile: string,
  vaultRoot: string,
  vaultImageIndex: string[] | null
): Promise<string | null> {
  const target = tryDecode(raw);
  const fromDir = path.dirname(fromFile);

  const candidates: string[] = [];
  if (path.isAbsolute(target)) {
    candidates.push(target);
    if (vaultRoot) {
      candidates.push(path.join(vaultRoot, target.replace(/^[/\\]+/, "")));
    }
  } else {
    candidates.push(path.join(fromDir, target));
    if (vaultRoot) candidates.push(path.join(vaultRoot, target));
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  if (vaultImageIndex) {
    const baseLower = path.basename(target).toLowerCase();
    const matches = vaultImageIndex.filter((f) => path.basename(f).toLowerCase() === baseLower);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const sameDir = matches.filter((f) => path.dirname(f) === fromDir);
      if (sameDir.length === 1) return sameDir[0];
    }
  }

  return null;
}