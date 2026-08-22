import * as vscode from "vscode";
import * as path from "path";
import { VaultDetector, VaultInfo } from "./vault-detector";
import { LinkResolver, ObsidianLinkResolver, MarkdownLinkResolver, ResolvedLink } from "./link-resolver";

export class NavigationManager {
  private vaultDetector: VaultDetector;
  private obsidianResolver = new ObsidianLinkResolver();
  private markdownResolver = new MarkdownLinkResolver();
  private vaultInfo: VaultInfo | null = null;
  private history: string[] = [];
  private historyIndex = -1;

  constructor() {
    this.vaultDetector = new VaultDetector();
  }

  async initialize(): Promise<VaultInfo> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return { isObsidianVault: false, vaultRoot: "" };
    }
    this.vaultInfo = await this.vaultDetector.detect(folder);
    return this.vaultInfo;
  }

  getVaultInfo(): VaultInfo | null {
    return this.vaultInfo;
  }

  private getResolver(): LinkResolver {
    return this.vaultInfo?.isObsidianVault ? this.obsidianResolver : this.markdownResolver;
  }

  async resolveLink(link: string, fromFile: string): Promise<ResolvedLink | null> {
    const vaultRoot = this.vaultInfo?.vaultRoot || path.dirname(fromFile);
    return this.getResolver().resolve(link, fromFile, vaultRoot);
  }

  async openLink(link: string, fromFile: string): Promise<boolean> {
    const resolved = await this.resolveLink(link, fromFile);
    if (!resolved) return false;

    // Open the target file
    const doc = await vscode.workspace.openTextDocument(resolved.targetUri);
    await vscode.window.showTextDocument(doc, { preview: true });

    // If there's a heading, try to scroll to it
    if (resolved.heading) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const text = doc.getText();
        const slug = resolved.heading.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const lineSlug = lines[i]
            .replace(/^#+\s*/, "")
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-");
          if (lineSlug === slug) {
            const pos = new vscode.Position(i, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            break;
          }
        }
      }
    }

    return true;
  }

  pushHistory(filePath: string): void {
    // Remove any forward history
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(filePath);
    this.historyIndex = this.history.length - 1;
  }

  canGoBack(): boolean {
    return this.historyIndex > 0;
  }

  canGoForward(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  goBack(): string | null {
    if (!this.canGoBack()) return null;
    this.historyIndex--;
    return this.history[this.historyIndex];
  }

  goForward(): string | null {
    if (!this.canGoForward()) return null;
    this.historyIndex++;
    return this.history[this.historyIndex];
  }
}
