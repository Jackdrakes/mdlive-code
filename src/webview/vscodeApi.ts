interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

export const vscode = api;

export type Message = 
  | { type: "setContent"; content: string; fileName: string }
  | { type: "save"; content: string }
  | { type: "ready" }
  | { type: "contentChanged"; content: string }
  | { type: "saveRequest"; content: string };

export function postMessage(message: Message) {
  api.postMessage(message);
}
