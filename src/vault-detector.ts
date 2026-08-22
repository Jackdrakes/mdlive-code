import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface VaultInfo {
  isObsidianVault: boolean;
  vaultRoot: string;
}

export class VaultDetector {
  private cache = new Map<string, VaultInfo>();

  async detect(folder: vscode.WorkspaceFolder): Promise<VaultInfo> {
    const key = folder.uri.fsPath;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const obsidianDir = path.join(key, ".obsidian");
    let isObsidianVault = false;

    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(obsidianDir));
      isObsidianVault = (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
      isObsidianVault = false;
    }

    const info: VaultInfo = { isObsidianVault, vaultRoot: key };
    this.cache.set(key, info);
    return info;
  }

}
