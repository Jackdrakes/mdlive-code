import * as vscode from "vscode";
import * as path from "path";
import { VaultDetector, VaultInfo } from "./vault-detector";
import { LinkResolver, ObsidianLinkResolver, MarkdownLinkResolver, ResolvedLink } from "./link-resolver";
import { VaultIndex } from "./lib/vault-index";

export class NavigationManager {
  private vaultDetector: VaultDetector;
  private obsidianResolver = new ObsidianLinkResolver();
  private markdownResolver = new MarkdownLinkResolver();
  private vaultInfo: VaultInfo | null = null;
  private readonly watcherDisposables = new Map<string, vscode.Disposable[]>();

  constructor() {
    this.vaultDetector = new VaultDetector();
  }

  async initialize(fileName?: string): Promise<VaultInfo> {
    const folder = this.getWorkspaceFolder(fileName);
    if (!folder) {
      return { isObsidianVault: false, vaultRoot: "" };
    }
    this.vaultInfo = await this.vaultDetector.detect(folder);
    this.setupVaultWatcher(this.vaultInfo.vaultRoot);
    return this.vaultInfo;
  }

  getVaultInfo(): VaultInfo | null {
    return this.vaultInfo;
  }

  private getWorkspaceFolder(fileName?: string): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders || [];
    if (!fileName) return folders[0];

    const resolvedFile = path.resolve(fileName);
    return folders.find((folder) => {
      const relative = path.relative(folder.uri.fsPath, resolvedFile);
      return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`));
    }) || folders[0];
  }

  private setupVaultWatcher(vaultRoot: string): void {
    if (!vaultRoot || this.watcherDisposables.has(vaultRoot)) return;
    const pattern = new vscode.RelativePattern(vaultRoot, "**/*");
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const invalidate = () => VaultIndex.invalidate(vaultRoot);
    const isWithinRoot = (filePath: string): boolean => {
      const relative = path.relative(vaultRoot, filePath);
      return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`));
    };
    const renameListener = vscode.workspace.onDidRenameFiles((event) => {
      if (event.files.some(({ oldUri, newUri }) => isWithinRoot(oldUri.fsPath) || isWithinRoot(newUri.fsPath))) {
        invalidate();
      }
    });
    this.watcherDisposables.set(vaultRoot, [
      watcher,
      watcher.onDidCreate(invalidate),
      watcher.onDidChange(invalidate),
      watcher.onDidDelete(invalidate),
      renameListener,
    ]);
  }

  private getResolver(info: VaultInfo | null): LinkResolver {
    return info?.isObsidianVault ? this.obsidianResolver : this.markdownResolver;
  }

  async resolveLink(link: string, fromFile: string): Promise<ResolvedLink | null> {
    const folder = this.getWorkspaceFolder(fromFile);
    const info = folder ? await this.vaultDetector.detect(folder) : this.vaultInfo;
    if (info) {
      this.vaultInfo = info;
      this.setupVaultWatcher(info.vaultRoot);
    }
    const vaultRoot = info?.vaultRoot || path.dirname(fromFile);
    return this.getResolver(info).resolve(link, fromFile, vaultRoot);
  }

  dispose(): void {
    for (const disposables of this.watcherDisposables.values()) {
      for (const disposable of disposables) disposable.dispose();
    }
    this.watcherDisposables.clear();
  }
}
