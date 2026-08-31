export function countWords(text: string): number {
  if (!text || text.trim() === "") return 0;
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

export function countCharacters(text: string): number {
  return text.length;
}

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

export const IMG_EMBED_MARKER = "mdlive-embed:";
export const OBSIDIAN_EMBED_RE = /!\[\[([^\]\|\n]+?)(?:\|(\d+))?\]\]/g;

export function isImageTarget(target: string): boolean {
  const lower = target.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function basenameNoExt(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  const name = parts[parts.length - 1] || "";
  const extIdx = name.lastIndexOf(".");
  return extIdx > 0 ? name.slice(0, extIdx) : name;
}

/**
 * Converts Obsidian image embeds (`![[image.png]]`, `![[image.png|200]]`)
 * into standard markdown image syntax carrying a marker scheme so the
 * preview can resolve them against the on-disk file. Code blocks are skipped.
 */
export function transformObsidianImageEmbeds(text: string): string {
  const lines = text.split("\n");
  let inFence = false;

  return lines
    .map((line) => {
      const fence = line.match(/^\s*(```|~~~)/);
      if (fence) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(OBSIDIAN_EMBED_RE, (full, target: string, width?: string) => {
        if (!isImageTarget(target)) return full;
        const alt = basenameNoExt(target);
        const query = width ? `?w=${width}` : "";
        return `![${alt}](${IMG_EMBED_MARKER}${target}${query})`;
      });
    })
    .join("\n");
}
