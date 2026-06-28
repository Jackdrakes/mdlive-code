# MdLive VS Code Extension — Portability Plan

> Project: `vscode-mdlive` — a VS Code extension packaging the core of [MdLive](https://github.com/jackdrakes/modern-preview) (Next.js 15 markdown editor with live preview, two-way file sync, and local file operations).

---

## 1. Feature Audit & Scoping

### App Profile (MdLive)

A Next.js 15 client-side markdown editor with live preview and two-way file system sync via the File System Access API. All rendering is client-side. The only server-dependent feature is the **Share** endpoint (`/api/share`) which persists base64-encoded markdown to MongoDB and returns a short code, plus a **health check** endpoint.

#### Core (must ship in extension — "aha moment", works fully offline, no login)

| Feature | How it works in the web app | VS Code extension equivalent |
|---|---|---|
| CodeMirror 6 markdown editor | `@uiw/react-codemirror` + `@codemirror/lang-markdown` | Same package, bundled in webview. **Strict identical config, theme, extensions.** |
| Live GFM preview | `react-markdown` + `remark-gfm` + `rehype-highlight` | Same package stack in webview. **Identical rendering pipeline.** |
| Split/Editor/Preview/Diff view modes | React state toggling which panels render | Same state pattern in webview. Diff requires `originalContent` tracking. |
| Open local .md files | `window.showOpenFilePicker()` + drag-and-drop | VS Code `workspace.openTextDocument` + file system watcher. Drag-drop onto editor tab. |
| Save to disk (auto-save + manual) | `FileSystemFileHandle.createWritable()` | VS Code `workspace.fs.writeFile` + `TextDocument.save()`. Auto-save via VS Code's built-in or debounced on content change. |
| Status bar (word count, char count, save state) | Custom `<StatusBar>` component | VS Code native status bar item (`window.createStatusBarItem`), updated from webview state. |
| File tree explorer | `showDirectoryPicker()` + recursive `FileNode` tree | VS Code's built-in file explorer + custom tree data provider for `.md`-filtered view. |
| Dark theme | Tailwind dark classes (`bg-gray-900`, etc.) | CSS variables driven by VS Code theme (`body.vscode-dark`). Identical visual output. |
| PDF export | `html2pdf.js` on content | Same package in webview or delegate to extension host for native save dialog. |
| Copy code blocks | Clipboard API in `CopyButton` component | Same web API in webview (`navigator.clipboard.writeText`), or VS Code clipboard API via `postMessage`. |
| Task list checkbox | Click handler in `PreviewPanel` → modifies source `content` string | Identical logic in webview. |
| Double-click heading → scroll to line | `onNavigateToLine` callback → `EditorView.scrollIntoView` | Identical in webview. `postMessage` not needed — both panels are in the same webview. |
| Large file warning (>5MB) | Size check on file open → toast | Same check on file open, VS Code notification instead of sonner toast. |
| `:w` Vim-style save | CodeMirror keymap interceptor | Identical CodeMirror extension in webview. |

#### Lite / Teaser (partial in extension — gated, nudges to website)

| Feature | Gating Strategy |
|---|---|
| **Share / publish link** (MongoDB-backed) | Show "Share" button → "Sign in on [mdlive.dev] to share documents" modal. In web app, the `/api/share` persists to MongoDB. Extension cannot expose MongoDB creds client-side. Instead, deep-link to the website's share page with `?utm_source=vscode`. |
| **Export PDF with custom templates** | Offer basic PDF export for free via `html2pdf.js` in the webview. Gated: "Professional PDF templates available on mdlive.dev" with link + CTA. |
| **Folder-level features** (open entire workspace as a markdown project) | VS Code already gives you the workspace folder. Expose enhanced "markdown project dashboard" as a gated teaser: "Visualize your docs — try full project mode on mdlive.dev" |
| **Custom themes** beyond dark | Offer one dark theme (same as web). Gated: "More themes available on mdlive.dev" |

#### Web-Only (stays on the site — requires backend infra)

| Feature | Why It Stays |
|---|---|
| **Share links** (`/api/share`) | Requires MongoDB + server endpoint. Extension cannot embed backend credentials. |
| **Account management, billing, subscription** | SaaS concerns. VS Code Marketplace does not support in-app purchases. |
| **Real-time collaboration** | Requires WebSocket server + presence infrastructure. Way beyond scope. |
| **Backend processing** (e.g., PDF rendering at scale) | Any heavy server-side computation. |
| **Analytics dashboard** (user's documents, usage stats) | Requires a database of user activity. |

---

## 2. Architecture Plan: Next.js → VS Code Extension

### 2.1 What Transports and What Doesn't

| Next.js Feature | Extension Strategy |
|---|---|
| **Server Components** (`async function Page`) | Not used in MdLive — all components are `"use client"`. Nothing to change. |
| **API Routes** (`/api/share`, `/api/health`) | `/api/share` → replaced by deep-link to hosted site. `/api/health` → dropped entirely. |
| **SSR / SSG** | Not used. App renders client-side only. |
| **Next.js Router** (`useRouter`, `<Link>`) | Not used in MdLive. `page.tsx` is a single-page app. Replace with `react-router` or manage state without routing. |
| **`@/` path aliases** | Replace with relative imports or configure in vite/esbuild for the webview bundle. |
| **`next.config.ts`** | Not ported. Webview uses Vite config. |
| **`next/link`, `next/image`, `next/script`** | Not used in MdLive. |
| **`next/dynamic`** | Not used. |
| **`process.env` / `.env`** | Extension webview gets env via `postMessage` from extension host (for API base URL, UTM params). Never embed secrets. |

### 2.2 Recommended Architecture

```
┌─────────────────────────────────────────────────────┐
│                  VS Code Extension Host              │
│  ┌──────────────────────────────────────────────┐   │
│  │           extension.ts (activation)          │   │
│  │  • registerWebviewViewProvider (sidebar)     │   │
│  │  • registerCustomEditorProvider (.md files)  │   │
│  │  • commands: 'mdlive.open', 'mdlive.save'    │   │
│  │  • file system ops (read/write via vscode.fs)│   │
│  │  • status bar integration                    │   │
│  │  • auth token management (SecretStorage)     │   │
│  │  • telemetry                                 │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │ postMessage()              │
│                         ▼                            │
│  ┌──────────────────────────────────────────────┐   │
│  │         Webview (React + Vite)               │   │
│  │  ┌────────────────────────────────────────┐  │   │
│  │  │  EditorPanel (CodeMirror 6)           │  │   │
│  │  │  PreviewPanel (react-markdown)        │  │   │
│  │  │  Toolbar, StatusBar (React)           │  │   │
│  │  │  vscodeApi.ts (postMessage wrapper)   │  │   │
│  │  └────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.3 Custom Editor vs. Webview Panel

**Recommendation: Hybrid approach — Custom Editor (primary) + Sidebar View (secondary)**

**Primary: Custom Editor (`customEditors`)**
- Binds to `*.md` and `*.markdown` files
- When a user opens any `.md` file in VS Code, MdLive takes over rendering
- Automatically reads from VS Code's file system (no permission prompts)
- Saves via VS Code's built-in save (Ctrl+S, Auto Save)
- This is the exact model Excalidraw uses (`.excalidraw` files → custom editor)
- **ActivationEvent:** `onCustomEditor:mdlive.editor`

**Secondary: Sidebar Webview View**
- `mdlive.sidebar` view container
- Shows file tree (`.md` files in workspace), recent files, open/quick-open
- Status info, save state, word count
- Gated features / CTAs

### 2.4 Defining the Extension in package.json

```jsonc
{
  "name": "mdlive",
  "displayName": "MdLive — Markdown Live Preview",
  "description": "Live markdown editor with real-time preview, diff view, and workspace file browser",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Programming Languages", "Visualization", "Other"],
  "activationEvents": [
    "onCustomEditor:mdlive.editor",
    "onView:mdlive.sidebar",
    "onCommand:mdlive.open",
    "onCommand:mdlive.openProject"
  ],
  "contributes": {
    "customEditors": [
      {
        "viewType": "mdlive.editor",
        "displayName": "MdLive Editor",
        "selector": [
          { "filenamePattern": "*.md" },
          { "filenamePattern": "*.markdown" }
        ],
        "priority": "default"
      }
    ],
    "views": {
      "explorer": [
        {
          "id": "mdlive.sidebar",
          "name": "MdLive"
        }
      ]
    },
    "commands": [
      {
        "command": "mdlive.open",
        "title": "MdLive: Open Markdown File"
      },
      {
        "command": "mdlive.signIn",
        "title": "MdLive: Sign in to mdlive.dev"
      },
      {
        "command": "mdlive.openOnWebsite",
        "title": "MdLive: Open in Full Editor (mdlive.dev)"
      }
    ],
    "keybindings": [
      { "command": "mdlive.open", "key": "ctrl+alt+m", "when": "editorFocus" }
    ]
  }
}
```

### 2.5 Local File Handling

| Operation | Extension Strategy |
|---|---|
| **Read file** | Custom editor provider receives `Uri` → `workspace.fs.readFile(uri)` → UTF-8 string → send to webview via `postMessage({ type: 'setContent', ... })` |
| **Write file** | Webview → `postMessage({ type: 'save', content })` → extension host → `workspace.fs.writeFile(uri, Buffer.from(content))`. VS Code handles conflict detection. |
| **Auto-save** | Option 1 (recommended): VS Code's built-in auto-save (`files.autoSave`). Option 2: Debounced (2s) `postMessage` to extension host → `workspace.fs.writeFile`. |
| **File watcher** | `workspace.onDidChangeTextDocument` and `workspace.onDidSaveTextDocument` for active file. `FileSystemWatcher` for external changes to the file tree. |
| **External changes** | `workspace.onDidOpenTextDocument` + polling fallback (same pattern as web app's `useFileWatcher`). |
| **New file** | Custom editor backs new untitled files. `workspace.fs.writeFile` with user-chosen path via `window.showSaveDialog`. |
| **Drag-and-drop** | `window.registerExternalUriDrop` (VS Code 1.78+) or register a `DocumentDropProvider` for `.md` files. |
| **Undo/redo** | VS Code's native undo stack operates on `TextDocument`. The webview manages its own CodeMirror history, but source of truth is the VS Code document. Two options: (a) Let CodeMirror handle undo/redo in the webview and sync only on save; (b) Use VS Code's `workspace.applyEdit` for every keystroke (latency risk). **Recommendation: (a)** — treat the webview as the edit buffer, write to VS Code document on save only. This avoids flicker from VS Code → webview round-trips on every keystroke. |

### 2.6 Undo/Redo Strategy

The tension: CodeMirror has its own undo stack, VS Code `TextDocument` has its own.

**Recommended approach (same as Excalidraw):**
1. Webview edits are purely local to CodeMirror's undo stack
2. On save, the webview sends the final content to the extension host
3. Extension host writes to `TextDocument` via `workspace.fs.writeFile`
4. VS Code picks up the external change → `onDidChangeTextDocument` fires
5. Webview ignores echo-back of its own save

This means **Ctrl+Z inside the webview** uses CodeMirror's native undo. **Ctrl+Z outside the webview** (in VS Code) is irrelevant because the document only changes on save.

### 2.7 Bundling & Build Tooling

Two separate build targets:

| Target | Tool | Config | Output |
|---|---|---|---|
| **Extension host** (Node.js) | `esbuild` via `@vscode/vsce` (predefined `esbuild.js` script) | `esbuild.config.mjs` — target `node18`, external `vscode` | `dist/extension.js` |
| **Webview** (browser) | **Vite** with `@vitejs/plugin-react` | `vite.config.ts` — target `es2020`, no SSR | `dist/webview/` (static HTML + JS + CSS) |

**Key config details:**

`vite.config.ts` for webview:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/webview',
    rollupOptions: {
      input: 'src/webview/index.html',
    },
  },
})
```

**CSP for webview HTML:**
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
```

---

## 3. Repo Structure Proposal

### Recommended: pnpm Workspace Monorepo

```
/brain/Projects/
├── modern-preview/                      # Existing Next.js app (unchanged)
│   ├── src/
│   ├── package.json
│   └── ...
│
└── vscode-mdlive/                       # New extension repo
    ├── package.json                     # pnpm workspace root
    ├── pnpm-workspace.yaml
    ├── tsconfig.base.json
    │
    ├── packages/
    │   ├── core/                        # Framework-agnostic shared logic
    │   │   ├── package.json
    │   │   ├── src/
    │   │   │   ├── markdown/
    │   │   │   │   ├── parsing.ts       # markdown utilities (re-export from existing lib/markdown.ts)
    │   │   │   │   ├── processing.ts    # react-markdown config, GFM plugins
    │   │   │   │   └── constants.ts     # DEFAULT_CONTENT, FILE_TYPES, etc.
    │   │   │   ├── types/
    │   │   │   │   └── index.ts         # ViewMode, FileNode, shared TS interfaces
    │   │   │   └── index.ts
    │   │   └── vitest.config.ts
    │   │
    │   └── ui/                          # Shared React components (optional, may be too coupled)
    │       ├── package.json
    │       ├── src/
    │       │   ├── components/
    │       │   │   ├── EditorPanel.tsx   # CodeMirror wrapper (same as web)
    │       │   │   ├── PreviewPanel.tsx  # react-markdown + custom components (same as web)
    │       │   │   ├── StatusBar.tsx     # Re-used in webview
    │       │   │   └── Toolbar.tsx       # Adapted for extension (different open/save flow)
    │       │   └── index.ts
    │       └── vitest.config.ts
    │
    └── apps/
        └── vscode-ext/                  # The extension itself
            ├── package.json             # vsce manifest — name, contributes, etc.
            ├── tsconfig.json
            ├── esbuild.config.mjs       # Extension host build
            ├── vite.config.ts           # Webview build
            ├── src/
            │   ├── extension.ts         # activate() / deactivate()
            │   ├── editorProvider.ts    # CustomEditorProvider implementation
            │   ├── sidebarProvider.ts   # WebviewViewProvider for sidebar
            │   ├── commands.ts          # Command registrations
            │   ├── fileSystem.ts        # VS Code fs wrapper (read/write/dispose)
            │   ├── authBridge.ts        # Auth token handling, OAuth deep-link
            │   ├── telemetry.ts         # Opt-in telemetry
            │   └── webview/             # Vite-bundled webview app
            │       ├── index.html       # Entry HTML with CSP
            │       ├── main.tsx         # React root
            │       ├── App.tsx          # App orchestrator (simplified version of page.tsx)
            │       ├── vscodeApi.ts     # getVsCodeApi() wrapper
            │       └── styles.css       # Tailwind or plain CSS (via Vite)
            ├── media/                   # Extension icons, README screenshots
            │   ├── icon.png             # 128x128 icon
            │   ├── icon-dark.png
            │   └── banner.png
            └── README.md                # Marketplace README (separate from repo README)
```

### Extraction Strategy from `modern-preview/`

| File in modern-preview | Destination in vscode-mdlive | Action |
|---|---|---|
| `src/types/index.ts` | `packages/core/src/types/index.ts` | Copy verbatim, drop `next/navigation`-related types (none exist) |
| `src/lib/markdown.ts` | `packages/core/src/markdown/parsing.ts` | Copy `countWords`, `countCharacters`; drop `downloadFile`/`exportAsHtml` (VS Code handles export dialogs) |
| `src/lib/constants.ts` | `packages/core/src/markdown/constants.ts` | Copy `DEFAULT_CONTENT`, `AUTO_SAVE_DELAY`, `MARKDOWN_DEBOUNCE`; drop `BROWSER_SUPPORT_LINKS` and `ERROR_MESSAGES` (extension has no browser restrictions) |
| `src/components/EditorPanel.tsx` | `packages/ui/src/components/EditorPanel.tsx` | Copy verbatim — CodeMirror is framework-agnostic |
| `src/components/PreviewPanel.tsx` | `packages/ui/src/components/PreviewPanel.tsx` | Copy verbatim |
| `src/components/StatusBar.tsx` | `packages/ui/src/components/StatusBar.tsx` | Adapt: remove `isLoading` prop (not relevant in extension), add VSCode-specific styling hooks |
| `src/components/Toolbar.tsx` | `apps/vscode-ext/src/webview/components/Toolbar.tsx` | Adapt: different open/save flows (`onOpen` triggers VS Code file dialog via `postMessage`), add "Open on website" and "Sign in" buttons |
| `src/components/FileTree.tsx` | Not needed as a component | VS Code has its own file explorer. The sidebar view will show a simplified list. |
| `src/components/DropZone.tsx` | Not needed | VS Code handles drag via `DocumentDropProvider` |
| `src/hooks/useFileSystem.ts` | `apps/vscode-ext/src/fileSystem.ts` | Rewrite entirely — VS Code `workspace.fs` instead of File System Access API |
| `src/hooks/useAutoSave.ts` | `packages/core/src/hooks/useAutoSave.ts` | Copy, but rename `fileHandle` → `fileUri` typed parameter |
| `src/hooks/useFileWatcher.ts` | `apps/vscode-ext/src/fileSystem.ts` | Replace polling with `workspace.onDidChangeTextDocument` + `FileSystemWatcher` |
| `src/app/page.tsx` | `apps/vscode-ext/src/webview/App.tsx` | Rewrite as a simplified orchestrator that communicates via `postMessage` |
| `src/lib/fileSystem.ts` | Not ported | File System Access API is Chromium-only. VS Code's `workspace.fs` replaces all of it. |
| `src/lib/base64.ts` | `packages/core/src/markdown/encoding.ts` | Copy if share/deep-link encoding is needed |
| `.env.local` | Not ported | Extension webview receives config via `vscode.ExtensionMode` + `postMessage` |

### Monorepo vs. Standalone Repo

| Factor | Monorepo (recommended) | Standalone Repo |
|---|---|---|
| **Shared code reuse** | Direct import from `packages/core` and `packages/ui` | Copy code or publish npm packages |
| **Extraction cost** | One-time: refactor shared code into packages | Each sync is manual |
| **Web app drift** | Both apps evolve against same core | Web can change and break the copy |
| **CI complexity** | Single CI for both | Two separate CIs |
| **Learning curve** | pnpm workspace + Turborepo basics | Simple repo |
| **When to choose** | You'll maintain both actively | You're experimenting and may abandon either |

**Recommendation: Start as a standalone repo** with a manual copy of the relevant source files, then extract into a monorepo if the web app and extension both see active development. The reason: the web app is a stable, completed MVP. The extension is exploratory. Coupling them prematurely adds overhead. Extract only when both are proven.

---

## 4. Feature Parity Implementation Plan

### 4.1 CodeMirror Editor in Webview

**How it works:**
- Webview loads `EditorPanel.tsx` (same CodeMirror 6 config as the web app)
- On file open, extension host reads the file and sends `{ type: 'setContent', content, fileName }` via `postMessage`
- Webview sets CodeMirror value + filename state
- On edit, webview updates local state + debounced preview
- On save (Ctrl+S or auto-save), webview sends `{ type: 'save', content }` to extension host
- Extension host calls `workspace.fs.writeFile(uri, content)`

**State persistence:**
- Editor content: lives in webview React state. Persisted only on save.
- View mode preference: `context.workspaceState` (via extension host, retrieved on webview init as `{ type: 'setInitialState', viewMode: 'split' }`)
- Recent files list: `context.globalState` (persisted across workspaces)

### 4.2 Live GFM Preview

**How it works:**
- Same `react-markdown` + `remark-gfm` + `rehype-sanitize` + `rehype-highlight` stack as web app
- 200ms debounce on markdown → preview re-render (copy `MARKDOWN_DEBOUNCE` from constants)
- Code block copy button: `navigator.clipboard.writeText` works in webview sandbox
- Task list checkboxes: same inline click handler → modify source line in CodeMirror

**Offline behavior:**
- Everything works offline. The only online requirement is the "Sign in" and "Open on website" CTAs.
- Dependencies are bundled into the webview by Vite. No CDN dependencies.

### 4.3 Diff View

- Same `DiffView` component as `page.tsx` — pure string comparison
- `originalContent` is captured when the file is first opened
- Same dedup logic as web app: "Show diff" button enabled only when `originalContent !== content`

### 4.4 File Tree (Sidebar)

- Register a `WebviewViewProvider` for `mdlive.sidebar`
- Extension host reads workspace folder structure via `workspace.fs.readDirectory` with `.md` filtering
- Sends file tree to webview via `postMessage({ type: 'setFileTree', files: [...] })`
- On file click in sidebar: webview → `postMessage({ type: 'openFile', path })` → extension host opens the file using the custom editor
- Folder open/close: handled entirely in the sidebar webview (React state)

### 4.5 PDF Export

- Same `html2pdf.js` import + render flow as web app
- Instead of triggering a download in the browser, the webview sends `postMessage({ type: 'exportPdf', blob: base64Data })` to the extension host
- Extension host writes to a temporary file and calls `vscode.commands.executeCommand('revealInExplorer')` or opens the native save dialog
- **Alternative (simpler):** The webview can use a `<a download>` element — this works in VS Code's webview for Electron

### 4.6 API Calls to Backend (Share / Sign-in)

**Share feature:**
- Webview → `postMessage({ type: 'signIn', returnUrl: '/share?content=...' })`
- Extension host → opens `https://mdlive.dev/auth/vscode?utm_source=vscode&utm_medium=extension` in the system browser
- After auth, the website redirects to a deep link or the extension handles a custom protocol
- For pure share: deep-link to `https://mdlive.dev/new?content=<encoded>&utm_source=vscode` — user pastes/edits on the site

**Auth bridge (OAuth flow):**
1. User clicks "Sign in" in extension
2. Extension host launches `vscode.env.openExternal(url)` with the website's OAuth URL + state + `redirect_uri=vscode://mdlive.auth`
3. User authenticates in browser
4. Website redirects to `vscode://mdlive.auth?token=...`
5. VS Code's `UriHandler` event fires (registered in `package.json` as `onUri`)
6. Extension stores token in `secrets.store('mdlive.authToken', token)`
7. Token is passed to webview via `postMessage({ type: 'authToken', token })` for subsequent API calls

**CORS / Rate limiting:**
- No CORS issues: the extension's HTTP calls (via `https.fetch` or Node.js `https`) are server-side, not browser-origin-restricted
- Rate limiting: add `X-Extension-Version` header to all outgoing requests for the website's API to track

### 4.7 Offline Behavior Summary

| Feature | Online Required? | Degradation |
|---|---|---|
| Edit .md files | No | Full functionality |
| Live preview | No | Full functionality |
| Diff view | No | Full functionality |
| PDF export | No | Full functionality |
| File tree browsing | No | Full functionality |
| Open on website CTA | No (button shown, link opens browser when clicked) | Button always visible, graceful offline toast |
| Sign in / Share | Yes | "Sign in to share" message, ability to copy content manually |
| Telemetry | Yes (opt-in, fires-and-forgets) | Compensated: cached and sent on next online |
| Auth token refresh | Yes | Token expires → re-auth prompt on gated feature access |

---

## 5. Conversion & Growth Mechanics

### 5.1 Persistent CTAs (Non-Intrusive)

**Location: Status bar (right side)**
```
[words: 234 | chars: 1024]    [🔓 Open in Full Editor on mdlive.dev →]
```
- Subtle, doesn't interfere with editing
- UTM: `?utm_source=vscode&utm_medium=statusbar&utm_campaign=extension_cta`
- Click opens `vscode.env.openExternal(url)`

**Location: Sidebar header**
```
┌──────────────────────────────────────┐
│ MdLive                         [⚡]  │
│ ──────────────────────────────────── │
│ [Open in Full Editor on mdlive.dev]  │
│ [Sign in for Cloud Sync & Sharing]   │
│ ──────────────────────────────────── │
│ ... file tree ...                    │
└──────────────────────────────────────┘
```

### 5.2 Deep Links with UTM Parameters

Every "open on website" link includes:
```
https://mdlive.dev/?utm_source=vscode-ext&utm_medium=sidebar-button&utm_campaign=v0.1.0&utm_content={viewMode}
```

Params:
- `utm_source`: `vscode-ext` (constant)
- `utm_medium`: `statusbar` | `sidebar` | `command-palette` | `share-gate` | `export-gate`
- `utm_campaign`: `v{version}` (auto-populated from extension version)
- `utm_content`: context-specific (e.g. `split-view`, `pdf-export`, `share`)

### 5.3 Command: `MdLive: Sign In`

- Registers in `package.json` commands + keybinding
- Opens OAuth flow as described in §4.6
- After success: webview receives `{ type: 'authToken', token }`
- Status bar updates: "Signed in as user@example.com" → CTA changes to "Open on website" (less desperate)
- Gated features update their modal copy: instead of "Sign in", they show "Upgrade on mdlive.dev"

### 5.4 Gated Feature Prompts (Not Errors)

**Pattern for every gated feature:**
```typescript
// Instead of:
toast.error("Share requires a subscription")

// Show:
showUpgradeModal({
  title: "Share Documents Online",
  description: "Publish your markdown as a shareable link with live preview.",
  cta: "Sign in on mdlive.dev",
  secondaryCta: "Copy content manually",
  utmMedium: "share-gate",
})
```

### 5.5 Telemetry (Opt-In)

```typescript
// telemetry.ts
import { getExtension } from 'vscode'

const TELEMETRY = 'mdlive.telemetry.enabled' // setting key

export function trackEvent(event: string, properties?: Record<string, string>) {
  if (!vscode.workspace.getConfiguration(TELEMETRY).get('enabled')) return
  // Send to https://mdlive.dev/api/telemetry (your analytics endpoint)
  // Or use a service like PostHog / Plausible via server proxy
}
```

**Events to track:**
- `extension.activated` — version, OS, VS Code version
- `file.opened` — file count (not path) per session
- `file.saved` — save count per session
- `viewMode.changed` — with mode param
- `export.pdf` — count
- `cta.clicked` — with `utm_medium` param
- `signin.started` / `signin.completed`
- `conversion.pixel` — when a user creates an account on the website

**Privacy:** Set the `__GDPR__` compliance flag in TelemetryReporter. Declare all events in the extension's `README.md` and marketplace listing.

---

## 6. Marketplace Publishing Plan

### 6.1 Package with `vsce`

```bash
npm install -g @vscode/vsce
cd apps/vscode-ext
vsce package       # produces mdlive-0.1.0.vsix
vsce publish       # publishes to VS Code Marketplace
```

**`package.json` manifest requirements:**

| Field | Value |
|---|---|
| `publisher` | Your publisher ID (e.g., `yourname` — must be claimed at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)) |
| `repository` | `{ "type": "git", "url": "https://github.com/jackdrakes/vscode-mdlive" }` |
| `icon` | `media/icon.png` (128x128, PNG, and `icon-dark.png`) |
| `galleryBanner` | `{ "color": "#1a1b1e", "theme": "dark" }` |
| `license` | `SEE LICENSE IN LICENSE` |
| `markdown` | `github` |
| `categories` | `["Programming Languages", "Visualization", "Other"]` |
| `tags` | `markdown`, `preview`, `editor`, `live-preview`, `codemirror`, `gfm` |
| `badges` | List of badges for marketplace listing |

**Versioning strategy:**
- Follow semver strictly
- Pre-release versions: `vsce publish --pre-release` → tagged as `Pre-Release` in marketplace
- Extension updates: VS Code auto-checks for updates. No manual user action needed.

### 6.2 Publishing to Open VSX (VSCodium, Cursor, Theia)

```bash
npm install -g ovsx
ovsx publish mdlive-0.1.0.vsix -p <OVSX_PAT>
```

**Differences from VS Code Marketplace:**
- No Microsoft account needed. Use Eclipse Foundation account at [open-vsx.org](https://open-vsx.org).
- Namespace must be claimed per publisher on Open VSX
- No pre-release channel support (yet)
- Otherwise identical `.vsix` file

### 6.3 CI/CD with GitHub Actions

`.github/workflows/publish.yml`:

```yaml
name: Publish Extension
on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build:webview
      - run: npm run build:extension
      
      # Package
      - run: npx @vscode/vsce package
      
      # Publish to VS Code Marketplace
      - run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }}
      
      # Publish to Open VSX
      - run: npx ovsx publish *.vsix -p ${{ secrets.OVSX_PAT }}
```

**Secrets needed:**
- `VSCE_PAT`: Personal Access Token from [dev.azure.com](https://dev.azure.com) → Publish permissions
- `OVSX_PAT`: Access token from [open-vsx.org](https://open-vsx.org)

**Workflow trigger:** `git tag v0.1.0 && git push origin v0.1.0`

### 6.4 Marketplace SEO & Discoverability

**Extension name:** `mdlive` (short, memorable, keyword-rich)

**Description (max 160 chars for VS Code gallery):**
> Live markdown editor with real-time preview, diff view, and file tree. Edit .md files with CodeMirror 6, see changes instantly in GFM preview.

**README structure for marketplace:**
```markdown
# MdLive — Markdown Live Preview ✨

## Features
- [Screenshot of split view] Live edit + preview
- [Screenshot of diff view] Diff view
- [Screenshot of file tree] Workspace file browser

## Usage

## Keyboard Shortcuts

## Requirements

## Extension Settings

## Known Issues

## Release Notes

## Privacy & Telemetry

## ❤️ Support
Love MdLive? Try the full version at [mdlive.dev](https://mdlive.dev)
```

**Tags:** `markdown preview live-preview codemirror gfm md`

---

## 7. Monetization Options

### 7.1 Recommended: Free Extension → Paid Web/SaaS Funnel

The extension is **free and fully featured for local editing**. Monetization comes from converting users to the website:

| Conversion Source | Mechanism | Value Prop |
|---|---|---|
| "Open in Full Editor" CTA | Persistent sidebar + status bar links | Cloud sync, sharing, collaboration, templates |
| "Sign in" OAuth | `cmd+shift+p` → `MdLive: Sign in` | Account for cloud storage, sharing |
| Share gate | "Sign in to share" modal | Shareable links with live preview |
| Export gate | "Try professional templates on mdlive.dev" | Better formatting, custom PDF templates |
| Command palette | `MdLive: Open on Website` | Full web app with all features |

**Metrics to track:**
- Installs (from marketplace API)
- Active users (from telemetry heartbeats)
- CTA click rate
- Sign-in completion rate
- Account creation on website (from UTM-attributed traffic)

### 7.2 Freemium with License Keys (Not Recommended for Phase 1)

```typescript
// authBridge.ts — license key activation
export async function activateLicense(key: string): Promise<boolean> {
  const response = await fetch('https://mdlive.dev/api/license/activate', {
    method: 'POST',
    body: JSON.stringify({ key, hardwareId: await getMachineId() }),
  })
  if (!response.ok) return false
  const { token } = await response.json()
  await secrets.store('mdlive.licenseToken', token)
  return true
}
```

**Constraints:**
- Microsoft's Marketplace ToS requires that paid features are implemented server-side (not gated local-only features)
- You cannot charge for features that work entirely locally — they must require cloud infrastructure
- **Safe gating model:** Only gate features that hit your backend (share, cloud sync, collaboration)
- Do not gate: editing, preview, diff view, PDF export, file tree — these must remain free

### 7.3 Marketplace Terms of Service Summary

| Constraint | Implication |
|---|---|
| No in-app purchases via Marketplace | Monetization must happen on your website |
| Must be upfront about telemetry | Declare in README, provide opt-out setting |
| Must not charge for core editing features | Editing/preview/diff must be free and unrestricted |
| Must not use Marketplace to distribute paid software keys | License key activation must call your backend |
| Extensions cannot themselves be paid | Only free extensions (you cannot sell the extension) |

---

## 8. Phased Roadmap

### Phase 0: Extraction & Setup (Week 1)
- [ ] Create `vscode-mdlive` repo with the proposed structure
- [ ] Create `packages/core/` — extract `types`, `markdown` utils, `constants` from `modern-preview`
- [ ] Create `packages/ui/` — copy `EditorPanel.tsx`, `PreviewPanel.tsx`, `StatusBar.tsx` as-is
- [ ] Set up `apps/vscode-ext/` with `package.json`, `esbuild.config.mjs`, `vite.config.ts`
- [ ] Verify `pnpm dev` or `pnpm build` compiles both packages
- [ ] Verify shared tests pass (`pnpm -r test`)

### Phase 1: MVP Extension — Custom Editor (Week 2-3)
- [ ] Implement `extension.ts`: `activate()` registers custom editor provider, sidebar provider, commands
- [ ] Implement `editorProvider.ts`: `CustomReadonlyEditorProvider` (or full `CustomEditorProvider`) that:
  - Resolves custom editor for `.md` URIs
  - Creates webview panel
  - Sends file content via `postMessage`
  - Receives save requests and writes via `workspace.fs.writeFile`
- [ ] Build webview `App.tsx`: simplified orchestrator with EditorPanel + PreviewPanel + DiffView
- [ ] Build `vscodeApi.ts`: typed wrapper around `acquireVsCodeApi()`
- [ ] Implement `commands.ts`: `mdlive.open`, `mdlive.save`, `mdlive.openProject`
- [ ] Implement sidebar `sidebarProvider.ts`: list `.md` files in workspace, open on click
- [ ] Implement `fileSystem.ts`: VS Code fs adapter (read, write, watch)
- [ ] Wire keyboard shortcuts (Ctrl+S, Ctrl+Shift+P for commands)
- [ ] Implement status bar items (word count, save state)
- [ ] `vsce package` → test install locally:
  ```bash
  code --install-extension mdlive-0.1.0.vsix
  ```

**Gate:** Manual testing of all core features with real .md files in a workspace.

### Phase 2: Auth + CTAs + Telemetry (Week 4)
- [ ] Implement OAuth URI handler (`onUri`) in `extension.ts`
- [ ] Build `authBridge.ts`: token storage in `secrets`, deep-link generation
- [ ] Add "Sign in" command + button in webview toolbar
- [ ] Add persistent CTAs in status bar and sidebar
- [ ] Add share gate modal
- [ ] Implement `telemetry.ts` with opt-in setting
- [ ] Add telemetry events for key actions
- [ ] Verify offline mode: disable network, confirm full local functionality

**Gate:** Auth flow works end-to-end, telemetry opt-in/opt-out works, all CTAs appear correctly.

### Phase 3: Publish v1 to Both Marketplaces (Week 5)
- [ ] Create publisher account on VS Code Marketplace
- [ ] Claim namespace on Open VSX
- [ ] Create `media/icon.png` (128x128), `media/icon-dark.png`, gallery banner
- [ ] Write README.md for marketplace (SEO-optimized)
- [ ] Set up GitHub Actions workflow (`.github/workflows/publish.yml`)
- [ ] Add `LICENSE` file (MIT or custom)
- [ ] Tag `v0.1.0` → CI publishes automatically
- [ ] Verify listings on both marketplaces
- [ ] Blog post / tweet about the extension

**Gate:** Both marketplace pages are live and installable.

### Phase 4: Iterate (Ongoing)
- [ ] Monitor install counts and conversion funnel
- [ ] Collect user feedback (GitHub Issues template)
- [ ] Prioritize Phase 3 features based on data:
  - Low CTA clicks → improve copy / placement
  - High sign-in failures → fix OAuth flow
  - Low installs → improve README / SEO
- [ ] Consider monorepo merge if web app also iterating
- [ ] Release v0.2.0 with bug fixes and polish

---

## 9. Risks & Open Questions

### Questions for You

1. **Do you have an existing user account / auth system on mdlive.dev?** If yes, I need the OAuth endpoint URL, client ID, and redirect scheme. If no, the extension's auth bridge is blocked until the website has auth.

2. **Is the Share feature (`/api/share`) important enough to ship in the extension?** If yes, we need to build the auth bridge first. If no, we can ship v1 without share and add it as a Phase 2 CTA.

3. **Do you own the domain `mdlive.dev` (or similar)?** This is assumed in the plan. If not, acquire it or use a subdomain of your existing site. All deep-links and UTM tracking depend on having a target URL.

4. **What's the licensing status of the modern-preview codebase?** If it's MIT, the extension can use the same license. If unlicensed, add a license file before publishing.

5. **Is MongoDB required for anything beyond Share?** If the extension ever needs to call your backend, the `mongodb` dependency in `modern-preview` is server-side only. The extension itself has no MongoDB dependency.

### Technical Risks

| Risk | Mitigation |
|---|---|
| **Webview CSP blocks inline styles** | Use `style-src 'unsafe-inline'` or migrate to CSS classes. Tailwind generates classes, not inline styles, so this is low risk. |
| **CodeMirror bundle size (webview)** | CodeMirror 6 is tree-shakeable. Configure Vite to exclude unused extensions. Target <500KB gzipped. |
| **react-markdown + rehype-highlight bundle** | Use dynamic imports + lazy rendering. The preview panel can mount lazily. |
| **VS Code API breaking changes** | Pin `engines.vscode` to a specific minor (e.g., `^1.85.0`). Test against latest stable before each release. |
| **Electron vs native webview quirks** | `navigator.clipboard`, `fetch`, and `<a download>` work in webviews. Test each in Electron. File System Access API is NOT available (replaced by `workspace.fs`). |
| **Multiple open editors for the same file** | Custom editor provider's `resolveCustomEditor` receives a `WebviewPanel`. Each file gets its own webview. VS Code handles singleton enforcement. |
| **Large file performance** | Same 5MB warning as web app. For files >1MB, defer syntax highlighting and preview rendering until after the first render cycle. |

### Legal / Policy Risks

| Risk | Mitigation |
|---|---|
| **Marketplace ToS violation for gating local features** | Only gate cloud-dependent features (share, sync). Editing/preview/diff must be free. |
| **Licensing conflict between extension code and dependencies** | Audit all deps: `CodeMirror` (MIT), `react-markdown` (MIT), `rehype-*` (MIT), `html2pdf.js` (MIT). No GPL or AGPL found in current stack. |
| **Telemetry GDPR/CCPA compliance** | Use VS Code's `TelemetryReporter` which respects global telemetry setting. Add opt-in prompt on first activation. Document all events in README. |
| **Trademark infringement on extension name** | Search VS Code Marketplace for "mdlive" / "md-live" / similar names to confirm availability. |

### Maintenance Risks

| Risk | Mitigation |
|---|---|
| **Web app evolves away from extension** | Keep extraction minimal. Only share types and pure utility functions. The webview UI can be its own version. |
| **VS Code API deprecations** | Subscribe to VS Code release notes. Test extension against latest insiders build before each release. |
| **Dependency drift** | Use exact versions in `apps/vscode-ext/package.json`. Renovate or Dependabot for automated updates. |

---

## Appendix: Key Files to Create in `apps/vscode-ext/src/`

### extension.ts (skeleton)
```typescript
import * as vscode from 'vscode'
import { MdLiveEditorProvider } from './editorProvider'
import { MdLiveSidebarProvider } from './sidebarProvider'
import { registerCommands } from './commands'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'mdlive.editor',
      new MdLiveEditorProvider(context)
    ),
    vscode.window.registerWebviewViewProvider(
      'mdlive.sidebar',
      new MdLiveSidebarProvider(context)
    ),
    ...registerCommands(context)
  )
  
  // Track activation
  trackEvent('extension.activated', {
    version: context.extension.packageJSON.version,
    vscodeVersion: vscode.version,
    platform: process.platform,
  })
}
```

### editorProvider.ts (skeleton)
```typescript
import * as vscode from 'vscode'

export class MdLiveEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Create webview
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    }
    panel.webview.html = this.getHtml(panel.webview)

    // Send initial content
    panel.webview.postMessage({
      type: 'setContent',
      content: document.getText(),
      fileName: document.fileName,
    })

    // Listen for saves from webview
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'save') {
        const edit = new vscode.WorkspaceEdit()
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          msg.content
        )
        await vscode.workspace.applyEdit(edit)
        await document.save()
      }
    })
  }

  private getHtml(webview: vscode.Webview): string {
    // Load bundled Vite output from dist/webview/
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.js')
    )
    const nonce = getNonce()
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `
  }
}
```
