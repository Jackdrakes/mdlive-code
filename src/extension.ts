import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";
import { NavigationManager } from "./navigation-manager";
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
  const response = await fetch("https://beta-mdlive.vercel.app/api/share", {
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
  private navManager: NavigationManager;

  constructor(
    private readonly extensionPath: string,
    private readonly context: vscode.ExtensionContext
  ) {
    this.navManager = new NavigationManager();
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const fileDir = path.dirname(document.fileName);

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.extensionPath, "dist")),
        vscode.Uri.file(fileDir),
      ],
    };

    const savedViewMode = this.context.workspaceState.get<string>("mdlive.viewMode", "split");
    panel.webview.html = getWebviewContent(this.extensionPath, panel, savedViewMode);

    const vaultInfo = await this.navManager.initialize();

    const isObsidianVault = vaultInfo.isObsidianVault;
    const vaultRoot = vaultInfo.vaultRoot;
    if (vaultRoot) {
      panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.extensionPath, "dist")),
          vscode.Uri.file(fileDir),
          vscode.Uri.file(vaultRoot),
        ],
      };
    }

    let isWebviewChange = false;

    let vaultImageIndex: string[] | null | undefined;
    const getVaultImageIndex = async (): Promise<string[] | null> => {
      if (isObsidianVault && vaultRoot && vaultImageIndex === undefined) {
        vaultImageIndex = await findImageFiles(vaultRoot);
      }
      return vaultImageIndex ?? null;
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
        fileName: path.basename(document.fileName),
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

        case "contentChanged":
          isWebviewChange = true;
          const editRange = new vscode.Range(
            document.lineAt(0).range.start,
            document.lineAt(document.lineCount - 1).range.end
          );
          const contentEdit = new vscode.WorkspaceEdit();
          contentEdit.replace(document.uri, editRange, message.content);
          await vscode.workspace.applyEdit(contentEdit);
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
          isWebviewChange = true;
          const fullRange = new vscode.Range(
            document.lineAt(0).range.start,
            document.lineAt(document.lineCount - 1).range.end
          );
          const edit = new vscode.WorkspaceEdit();
          edit.replace(document.uri, fullRange, message.content);
          await vscode.workspace.applyEdit(edit);
          await document.save();
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
          try {
            await shareDocument(message.content, message.fileName, panel);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Share failed: ${err.message}`);
          }
          break;

        case "viewModeChanged":
          this.context.workspaceState.update("mdlive.viewMode", message.viewMode);
          break;

        case "openExternal":
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;

        case "navigate":
          try {
            const success = await this.navManager.openLink(message.link, message.fromFile);
            if (success) {
              this.navManager.pushHistory(message.link);
            } else {
              vscode.window.showWarningMessage(`Could not resolve link: ${message.link}`);
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`Navigation failed: ${err.message}`);
          }
          break;
      }
    });

    panel.onDidDispose(() => {
      changeListener.dispose();
    });
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      MdLiveEditorProvider.viewType,
      new MdLiveEditorProvider(context.extensionPath, context)
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
    if (!editor || !editor.document.fileName.endsWith(".md")) {
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
