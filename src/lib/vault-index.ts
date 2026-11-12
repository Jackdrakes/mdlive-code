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

export function isImageTarget(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isMarkdownTarget(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

const IGNORED_DIRS = new Set(["node_modules", ".git", ".obsidian"]);

export interface VaultIndexData {
  mdFiles: string[];
  imageFiles: string[];
}

async function scanDir(dir: string): Promise<VaultIndexData> {
  const mdFiles: string[] = [];
  const imageFiles: string[] = [];
  const visit = async (current: string): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await visit(fullPath);
      } else if (entry.isFile()) {
        if (isMarkdownTarget(entry.name)) mdFiles.push(fullPath);
        else if (isImageTarget(entry.name)) imageFiles.push(fullPath);
      }
    }
  };
  await visit(dir);
  return { mdFiles, imageFiles };
}

interface CacheEntry {
  mdFiles: string[] | null;
  imageFiles: string[] | null;
  inFlight: Promise<VaultIndexData> | null;
}

export class VaultIndex {
  private static entries = new Map<string, CacheEntry>();

  static async get(root: string): Promise<VaultIndexData> {
    let entry = this.entries.get(root);
    if (!entry) {
      entry = { mdFiles: null, imageFiles: null, inFlight: null };
      this.entries.set(root, entry);
    }

    if (entry.mdFiles && entry.imageFiles) {
      return { mdFiles: entry.mdFiles, imageFiles: entry.imageFiles };
    }

    if (!entry.inFlight) {
      entry.inFlight = scanDir(root)
        .then((result) => {
          entry!.mdFiles = result.mdFiles;
          entry!.imageFiles = result.imageFiles;
          return result;
        })
        .finally(() => {
          if (entry) entry.inFlight = null;
        });
    }

    return entry.inFlight;
  }

  static async getMdFiles(root: string): Promise<string[]> {
    return (await this.get(root)).mdFiles;
  }

  static async getImageFiles(root: string): Promise<string[]> {
    return (await this.get(root)).imageFiles;
  }

  static invalidate(root: string): void {
    this.entries.delete(root);
  }

  static clear(): void {
    this.entries.clear();
  }
}