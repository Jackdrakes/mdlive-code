import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";
import { NavigationManager } from "./navigation-manager";
import { findHeadingLine, isSameFileTarget } from "./lib/link-core";
import { computeTextEdit } from "./lib/document-sync";
import { slugify } from "./lib/slug";
import {
  extractMarkdownImageSrcs,
  extractObsidianEmbedTargets,
  findImageFiles,
  resolveLocalImage,
  tryDecode,
} from "./image-resolver";

export interface ImageMap {
  [src: string]: string;
}

function isMarkdownFile(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}

function isMessage(value: unknown): value is { type: string } & Record<string, unknown> {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

async function buildImageMap(
  webview: vscode.Webview,
  content: string,
  fromFile: string,
  vaultRoot: string,
  isObsidianVault: boolean,
  vaultImageIndex: string[] | null
): Promise<ImageMap> {
  const map: ImageMap = {};
  const add = (src: string, abs: string | null) => {
    if (!abs) return;
    const uri = webview.asWebviewUri(vscode.Uri.file(abs)).toString();
    map[src] = uri;
    const decoded = tryDecode(src);
    if (decoded !== src) map[decoded] = uri;
  };

  try {
    const localSrcs = extractMarkdownImageSrcs(content);
    for (const src of localSrcs) {
      add(src, await resolveLocalImage(src, fromFile, vaultRoot, vaultImageIndex));
    }

    if (isObsidianVault) {
      const targets = extractObsidianEmbedTargets(content);
      for (const target of targets) {
        add(target, await resolveLocalImage(target, fromFile, vaultRoot, vaultImageIndex));
      }
    }
  } catch (err) {
    console.error("[Image Map] Failed to build image map:", err);
  }

  return map;
}

function getWebviewContent(extensionPath: string, panel: vscode.WebviewPanel, initialViewMode: string): string {
  const webviewPath = vscode.Uri.file(path.join(extensionPath, "dist", "webview"));
  const htmlPath = path.join(webviewPath.fsPath, "index.html");

  let html = fs.readFileSync(htmlPath, "utf-8");
  const nonce = getNonce();

  // Inject initial view mode before any scripts
  html = html.replace(
    "<body>",
    `<body><script nonce="${nonce}">window.__MDLIVE_INITIAL_VIEW_MODE__=${JSON.stringify(initialViewMode)}</script>`
  );

  // Replace asset paths with webview URIs
  html = html.replace(/(src|href)="\.\//g, (_match, attr) => {
    const uri = panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewPath, ""));
    return `${attr}="${uri}/`;
  });

  // Add nonce to all script tags
  html = html.replace(/<script/g, `<script nonce="${nonce}"`);

  // Replace CSP placeholders
  html = html.replace(/\{\{NONCE\}\}/g, nonce);
  html = html.replace(/\{\{CDN\}\}/g, panel.webview.cspSource);

  return html;
}

function getNonce(): string {
  return randomBytes(32).toString("base64");
}

async function shareDocument(
  content: string,
  fileName: string,
  panel?: vscode.WebviewPanel
): Promise<void> {
  const confirm = await vscode.window.showInformationMessage(
    "This will send your document content to a remote server. Continue?",
    "Share", "Cancel"
  );
  if (confirm !== "Share") return;
  const base64Content = Buffer.from(content).toString("base64");
  const endpoint = vscode.workspace
    .getConfiguration("mdlive")
    .get<string>("shareEndpoint", "https://beta-mdlive.vercel.app/api/share");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64: base64Content, filename: fileName }),
  });
  if (!response.ok) throw new Error(`Share failed (${response.status})`);
  const { url } = await response.json() as { url: string };
  await vscode.env.clipboard.writeText(url);
  if (panel) {
    panel.webview.postMessage({ type: "shareCompleted", url });
  }
  vscode.window.showInformationMessage("Share URL copied to clipboard!", "Open in Browser").then((action) => {
    if (action === "Open in Browser") vscode.env.openExternal(vscode.Uri.parse(url));
  });
}

class MdLiveEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "mdlive.editor";
  private readonly navManager: NavigationManager;
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly pendingScroll = new Map<string, { slug: string; line?: number }>();

  constructor(
    private readonly extensionPath: string,
    private readonly context: vscode.ExtensionContext,
    navManager: NavigationManager
  ) {
    this.navManager = navManager;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const fileDir = path.dirname(document.fileName);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspaceRoot = workspaceFolder?.uri.fsPath;
    const resourceRoots = [
      vscode.Uri.file(path.join(this.extensionPath, "dist")),
      vscode.Uri.file(fileDir),
      ...(workspaceRoot ? [vscode.Uri.file(workspaceRoot)] : []),
    ];

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: resourceRoots,
    };

    const savedViewMode = this.context.workspaceState.get<string>("mdlive.viewMode", "split");
    panel.webview.html = getWebviewContent(this.extensionPath, panel, savedViewMode);

    this.panels.set(document.uri.fsPath, panel);

    const vaultInfo = await this.navManager.initialize(document.fileName);

    const isObsidianVault = vaultInfo.isObsidianVault;
    const vaultRoot = vaultInfo.vaultRoot;
    if (vaultRoot && !resourceRoots.some((root) => root.fsPath === vaultRoot)) {
      panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          ...resourceRoots,
          vscode.Uri.file(vaultRoot),
        ],
      };
    }

    let isWebviewChange = false;

    const getVaultImageIndex = async (): Promise<string[] | null> => {
      if (!isObsidianVault || !vaultRoot) return null;
      // VaultIndex is invalidated by NavigationManager's watcher. Do not keep
      // a panel-local snapshot, otherwise newly created or renamed images stay
      // invisible until the panel is reopened.
      return findImageFiles(vaultRoot);
    };

    const sendContent = async () => {
      const imageMap = await buildImageMap(
        panel.webview,
        document.getText(),
        document.fileName,
        vaultRoot,
        isObsidianVault,
        await getVaultImageIndex()
      );
      panel.webview.postMessage({
        type: "setContent",
        content: document.getText(),
        documentVersion: document.version,
        fileName: path.basename(document.fileName),
        filePath: document.fileName,
        fileDir,
        imageMap,
      });
    };

    const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString() && !isWebviewChange) {
        sendContent();
      }
      isWebviewChange = false;
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      if (!isMessage(message)) return;

      switch (message.type) {
        case "ready":
          sendContent();
          const savedViewMode = this.context.workspaceState.get<string>("mdlive.viewMode", "split");
          panel.webview.postMessage({ type: "setViewMode", viewMode: savedViewMode });
          panel.webview.postMessage({
            type: "vaultInfo",
            isObsidianVault: vaultInfo.isObsidianVault,
            vaultRoot: vaultInfo.vaultRoot,
          });
          break;

        case "contentApplied":
          const pending = this.pendingScroll.get(document.uri.fsPath);
          if (pending) {
            panel.webview.postMessage({ type: "scrollToHeading", slug: pending.slug, line: pending.line });
            this.pendingScroll.delete(document.uri.fsPath);
          }
          break;

        case "contentChanged":
          if (
            typeof message.content !== "string" ||
            (message.documentVersion !== undefined && typeof message.documentVersion !== "number")
          ) return;
          isWebviewChange = true;
          if (message.documentVersion !== undefined && message.documentVersion !== document.version) {
            isWebviewChange = false;
            await sendContent();
            break;
          }
          const oldContent = document.getText();
          const contentEdit = computeTextEdit(oldContent, message.content);
          if (contentEdit) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.replace(
              document.uri,
              new vscode.Range(document.positionAt(contentEdit.startOffset), document.positionAt(contentEdit.endOffset)),
              contentEdit.newText
            );
            const applied = await vscode.workspace.applyEdit(workspaceEdit);
            if (!applied) {
              isWebviewChange = false;
              await sendContent();
              vscode.window.showWarningMessage("MdLive could not apply the document change.");
              break;
            }
          }
          isWebviewChange = false;
          panel.webview.postMessage({ type: "documentSynced", documentVersion: document.version });
          const refreshedMap = await buildImageMap(
            panel.webview,
            message.content,
            document.fileName,
            vaultRoot,
            isObsidianVault,
            await getVaultImageIndex()
          );
          panel.webview.postMessage({ type: "imageMap", imageMap: refreshedMap });
          break;

        case "save":
          if (typeof message.content !== "string") return;
          isWebviewChange = true;
          const saveEdit = computeTextEdit(document.getText(), message.content);
          if (saveEdit) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.replace(
              document.uri,
              new vscode.Range(document.positionAt(saveEdit.startOffset), document.positionAt(saveEdit.endOffset)),
              saveEdit.newText
            );
            const applied = await vscode.workspace.applyEdit(workspaceEdit);
            if (!applied) {
              isWebviewChange = false;
              await sendContent();
              vscode.window.showWarningMessage("MdLive could not apply the document change.");
              break;
            }
          }
          const saved = await document.save();
          isWebviewChange = false;
          if (!saved) {
            await sendContent();
            vscode.window.showWarningMessage("MdLive could not save the document.");
            break;
          }
          panel.webview.postMessage({ type: "documentSynced", documentVersion: document.version });
          const saveImageMap = await buildImageMap(
            panel.webview,
            message.content,
            document.fileName,
            vaultRoot,
            isObsidianVault,
            await getVaultImageIndex()
          );
          panel.webview.postMessage({ type: "imageMap", imageMap: saveImageMap });
          panel.webview.postMessage({ type: "saveCompleted" });
          break;

        case "share":
          if (typeof message.content !== "string" || typeof message.fileName !== "string") return;
          try {
            await shareDocument(message.content, message.fileName, panel);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Share failed: ${err.message}`);
          }
          break;

        case "viewModeChanged":
          if (typeof message.viewMode !== "string") return;
          this.context.workspaceState.update("mdlive.viewMode", message.viewMode);
          break;

        case "openExternal":
          if (typeof message.url !== "string") return;
          if (/^(https?:|mailto:|tel:)/i.test(message.url)) {
            await vscode.env.openExternal(vscode.Uri.parse(message.url));
          } else {
            vscode.window.showWarningMessage(`Cannot open external link: ${message.url}`);
          }
          break;

        case "copyToClipboard":
          if (typeof message.text !== "string") return;
          await vscode.env.clipboard.writeText(message.text);
          panel.webview.postMessage({ type: "copyCompleted" });
          break;

        case "navigate":
          if (typeof message.link !== "string" || typeof message.fromFile !== "string") return;
          try {
            const fromFile = message.fromFile || document.fileName;
            const resolved = await this.navManager.resolveLink(message.link, fromFile);
            if (!resolved) {
              vscode.window.showWarningMessage(`Could not resolve link: ${message.link}`);
              break;
            }

            const targetPath = resolved.targetUri.fsPath;
            const headingSlug = resolved.heading ? slugify(resolved.heading) : undefined;

            if (headingSlug && isSameFileTarget(targetPath, fromFile)) {
              const hit = findHeadingLine(document.getText(), headingSlug);
              if (hit !== -1) {
                const line = hit;
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document.uri.toString() === document.uri.toString()) {
                  const pos = new vscode.Position(line - 1, 0);
                  editor.selection = new vscode.Selection(pos, pos);
                  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                }
                panel.webview.postMessage({ type: "scrollToHeading", slug: headingSlug, line });
              }
              break;
            }

            const existingPanel = this.panels.get(targetPath);
            if (existingPanel) {
              existingPanel.reveal();
              if (headingSlug) {
                let line: number | undefined;
                try {
                  const targetDoc = await vscode.workspace.openTextDocument(resolved.targetUri);
                  const hit = findHeadingLine(targetDoc.getText(), headingSlug);
                  if (hit !== -1) line = hit;
                } catch {
                  line = undefined;
                }
                existingPanel.webview.postMessage({ type: "scrollToHeading", slug: headingSlug, line });
              }
              break;
            }

            if (headingSlug) {
              let line: number | undefined;
              try {
                const targetDoc = await vscode.workspace.openTextDocument(resolved.targetUri);
                const hit = findHeadingLine(targetDoc.getText(), headingSlug);
                if (hit !== -1) line = hit;
              } catch {
                line = undefined;
              }
              this.pendingScroll.set(targetPath, { slug: headingSlug, line });
            }
            await vscode.commands.executeCommand("vscode.openWith", resolved.targetUri, MdLiveEditorProvider.viewType);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Navigation failed: ${err.message}`);
          }
          break;
      }
    });

    panel.onDidDispose(() => {
      changeListener.dispose();
      this.panels.delete(document.uri.fsPath);
      this.pendingScroll.delete(document.uri.fsPath);
    });
  }
}

export function activate(context: vscode.ExtensionContext) {
  const navManager = new NavigationManager();
  context.subscriptions.push(navManager);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MdLiveEditorProvider.viewType,
      new MdLiveEditorProvider(context.extensionPath, context, navManager)
    )
  );

  const disposable = vscode.commands.registerCommand("mdlive.openEditor", () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && (editor.document.fileName.endsWith(".md") || editor.document.fileName.endsWith(".markdown"))) {
      vscode.commands.executeCommand("vscode.openWith", editor.document.uri, MdLiveEditorProvider.viewType);
    }
  });

  context.subscriptions.push(disposable);

  const shareDisposable = vscode.commands.registerCommand("mdlive.share", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isMarkdownFile(editor.document.fileName)) {
      vscode.window.showWarningMessage("No active Markdown file to share.");
      return;
    }
    try {
      const fileName = editor.document.fileName.split(/[/\\]/).pop() || "document.md";
      await shareDocument(editor.document.getText(), fileName);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Share failed: ${err.message}`);
    }
  });

  context.subscriptions.push(shareDisposable);
}

export function deactivate() {}
