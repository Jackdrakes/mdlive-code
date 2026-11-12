import * as vscode from "vscode";
import * as fs from "fs";
import {
  FileSystem,
  resolveMarkdownTarget,
  resolveObsidianTarget,
} from "./lib/link-core";
import { VaultIndex } from "./lib/vault-index";

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

const nodeFs: FileSystem = { exists: fileExists };

export class ObsidianLinkResolver implements LinkResolver {
  async resolve(link: string, fromFile: string, vaultRoot: string): Promise<ResolvedLink | null> {
    const mdFiles = await VaultIndex.getMdFiles(vaultRoot);
    const resolved = await resolveObsidianTarget(link, fromFile, vaultRoot, mdFiles, nodeFs);
    if (!resolved) return null;
    return {
      targetUri: vscode.Uri.file(resolved.targetPath),
      heading: resolved.heading,
      isEmbed: resolved.isEmbed,
      displayText: resolved.displayText,
    };
  }
}

export class MarkdownLinkResolver implements LinkResolver {
  async resolve(link: string, fromFile: string, vaultRoot: string): Promise<ResolvedLink | null> {
    const resolved = await resolveMarkdownTarget(link, fromFile, nodeFs, vaultRoot);
    if (!resolved) return null;
    return {
      targetUri: vscode.Uri.file(resolved.targetPath),
      heading: resolved.heading,
      isEmbed: resolved.isEmbed,
      displayText: resolved.displayText,
    };
  }
}