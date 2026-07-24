import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";

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

class MdLiveEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "mdlive.editor";

  constructor(
    private readonly extensionPath: string,
    private readonly context: vscode.ExtensionContext
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.extensionPath, "dist")),
      ],
    };

    const savedViewMode = this.context.workspaceState.get<string>("mdlive.viewMode", "split");
    panel.webview.html = getWebviewContent(this.extensionPath, panel, savedViewMode);

    let isWebviewChange = false;

    const sendContent = () => {
      panel.webview.postMessage({
        type: "setContent",
        content: document.getText(),
        fileName: path.basename(document.fileName),
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
          panel.webview.postMessage({ type: "saveCompleted" });
          break;

        case "viewModeChanged":
          this.context.workspaceState.update("mdlive.viewMode", message.viewMode);
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
}

export function deactivate() {}
