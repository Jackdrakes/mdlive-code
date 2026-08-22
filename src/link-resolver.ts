import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface ResolvedLink {
  targetUri: vscode.Uri;
  heading?: string;
  isEmbed: boolean;
  displayText: string;
}

export interface LinkResolver {
  resolve(link: string, fromFile: string, vaultRoot: string): Promise<ResolvedLink | null>;
}

function fileExists(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stat) => resolve(!err && stat.isFile()));
  });
}

async function findFilesRecursive(dir: string, extension: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    for (const [name, type] of entries) {
      const fullPath = path.join(dir, name);
      if (type & vscode.FileType.Directory) {
        if (name === "node_modules" || name === ".git" || name === ".obsidian") continue;
        results.push(...(await findFilesRecursive(fullPath, extension)));
      } else if (type & vscode.FileType.File && name.endsWith(extension)) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.error("[Vault Scan] Error reading directory:", dir, err);
  }
  return results;
}

export class ObsidianLinkResolver implements LinkResolver {
  async resolve(link: string, fromFile: string, vaultRoot: string): Promise<ResolvedLink | null> {
    const isEmbed = link.startsWith("!");
    const raw = isEmbed ? link.slice(1) : link;

    let target = raw;
    let heading: string | undefined;
    let alias: string | undefined;

    const pipeIdx = raw.indexOf("|");
    if (pipeIdx !== -1) {
      alias = raw.slice(pipeIdx + 1);
      target = raw.slice(0, pipeIdx);
    }

    const hashIdx = target.indexOf("#");
    if (hashIdx !== -1) {
      heading = target.slice(hashIdx + 1);
      target = target.slice(0, hashIdx);
    }

    if (!target) {
      return { targetUri: vscode.Uri.file(fromFile), heading, isEmbed, displayText: alias || target };
    }

    const fromDir = path.dirname(fromFile);

    // 1. Exact path relative to vault root
    let candidate = path.join(vaultRoot, target);
    if (!candidate.endsWith(".md")) candidate += ".md";
    if (await fileExists(candidate)) {
      return { targetUri: vscode.Uri.file(candidate), heading, isEmbed, displayText: alias || path.basename(target, ".md") };
    }

    // 2. Exact path relative to the current file
    candidate = path.join(fromDir, target);
    if (!candidate.endsWith(".md")) candidate += ".md";
    if (await fileExists(candidate)) {
      return { targetUri: vscode.Uri.file(candidate), heading, isEmbed, displayText: alias || path.basename(target, ".md") };
    }

    // 3. Shortest unique filename match across the vault
    const allMdFiles = await findFilesRecursive(vaultRoot, ".md");
    const basename = path.basename(target, path.extname(target));
    const matches = allMdFiles.filter((f) => {
      const fileBase = path.basename(f, ".md");
      return fileBase === basename || fileBase.toLowerCase() === basename.toLowerCase();
    });

    if (matches.length === 1) {
      return { targetUri: vscode.Uri.file(matches[0]), heading, isEmbed, displayText: alias || basename };
    }

    // 4. Partial match — filename contains the target
    const partialMatches = allMdFiles.filter((f) => {
      const fileBase = path.basename(f, ".md").toLowerCase();
      return fileBase.includes(basename.toLowerCase());
    });

    if (partialMatches.length === 1) {
      return { targetUri: vscode.Uri.file(partialMatches[0]), heading, isEmbed, displayText: alias || basename };
    }

    // 5. Same directory match
    const sameDirMatches = allMdFiles.filter((f) => path.dirname(f) === fromDir && path.basename(f, ".md").toLowerCase().includes(basename.toLowerCase()));
    if (sameDirMatches.length === 1) {
      return { targetUri: vscode.Uri.file(sameDirMatches[0]), heading, isEmbed, displayText: alias || basename };
    }

    return null;
  }
}

export class MarkdownLinkResolver implements LinkResolver {
  async resolve(link: string, fromFile: string, vaultRoot: string): Promise<ResolvedLink | null> {
    if (link.startsWith("#")) {
      return {
        targetUri: vscode.Uri.file(fromFile),
        heading: link.slice(1),
        isEmbed: false,
        displayText: link,
      };
    }

    if (/^https?:\/\//.test(link)) {
      return null;
    }

    const fromDir = path.dirname(fromFile);

    // Absolute workspace path
    if (link.startsWith("/")) {
      const candidate = path.join(vaultRoot, link);
      return this.tryResolve(candidate, fromFile);
    }

    // Relative path
    const candidate = path.resolve(fromDir, link);
    return this.tryResolve(candidate, fromFile);
  }

  private async tryResolve(candidate: string, fromFile: string): Promise<ResolvedLink | null> {
    if (await fileExists(candidate)) {
      return {
        targetUri: vscode.Uri.file(candidate),
        isEmbed: false,
        displayText: path.basename(candidate, path.extname(candidate)),
      };
    }

    // Try adding .md extension
    if (!candidate.endsWith(".md")) {
      const withExt = candidate + ".md";
      if (await fileExists(withExt)) {
        return {
          targetUri: vscode.Uri.file(withExt),
          isEmbed: false,
          displayText: path.basename(withExt, ".md"),
        };
      }
    }

    return null;
  }
}
