interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

export const vscode = api;

export type Message =
  | { type: "setContent"; content: string; fileName: string; fileDir?: string; imageMap?: Record<string, string> }
  | { type: "imageMap"; imageMap: Record<string, string> }
  | { type: "save"; content: string }
  | { type: "ready" }
  | { type: "contentChanged"; content: string }
  | { type: "share"; content: string; fileName: string }
  | { type: "shareCompleted"; url: string }
  | { type: "saveCompleted" }
  | { type: "viewModeChanged"; viewMode: string }
  | { type: "setViewMode"; viewMode: string }
  | { type: "navigate"; link: string; fromFile: string }
  | { type: "openExternal"; url: string }
  | { type: "vaultInfo"; isObsidianVault: boolean; vaultRoot: string };

export function postMessage(message: Message) {
  api.postMessage(message);
}
