interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

export const vscode = api;

export type Message =
  | { type: "setContent"; content: string; fileName: string; filePath?: string; fileDir?: string; imageMap?: Record<string, string>; documentVersion?: number }
  | { type: "documentSynced"; documentVersion: number }
  | { type: "contentApplied" }
  | { type: "imageMap"; imageMap: Record<string, string> }
  | { type: "save"; content: string }
  | { type: "ready" }
  | { type: "contentChanged"; content: string; documentVersion?: number }
  | { type: "share"; content: string; fileName: string }
  | { type: "shareCompleted"; url: string }
  | { type: "saveCompleted" }
  | { type: "viewModeChanged"; viewMode: string }
  | { type: "setViewMode"; viewMode: string }
  | { type: "navigate"; link: string; fromFile: string }
  | { type: "openExternal"; url: string }
  | { type: "copyToClipboard"; text: string }
  | { type: "scrollToHeading"; slug: string; line?: number }
  | { type: "vaultInfo"; isObsidianVault: boolean; vaultRoot: string };

export function postMessage(message: Message) {
  api.postMessage(message);
}
