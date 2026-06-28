# MdLive VS Code Extension — Phase Plan

> Ordered development phases, progressing from simple preview to full feature parity with `modern-preview`.

---

## Phase 0: Extract Shared Logic from `modern-preview`

**Goal:** Copy the markdown rendering pipeline and theming constants into the extension.

| What | Source | Destination |
|---|---|---|
| Types | `src/types/index.ts` | `src/webview/types/index.ts` |
| Markdown utility functions | `src/lib/markdown.ts` | `src/webview/lib/markdown.ts` |
| Constants (`DEFAULT_CONTENT`, `MARKDOWN_DEBOUNCE`, etc.) | `src/lib/constants.ts` | `src/webview/lib/constants.ts` |
| Theme CSS variables (Obsidian Dark) | `src/app/globals.css`, `tailwind.config.ts` | `src/webview/styles/preview.css` |
| react-markdown setup + custom components | `src/components/PreviewPanel.tsx` | `src/webview/components/PreviewPanel.tsx` |
| Highlight.js syntax theme | `src/app/globals.css` (`.hljs-*` classes) | `src/webview/styles/highlight.css` |

**Deliverable:** Pure-`core/` package with markdown parsing, types, and constants — no React, no vscode API.

---

## Phase 1: Basic Markdown Preview (Webview Only)

**Goal:** A single VS Code command that opens a webview panel rendering a sample `.md` file — identical styling to the web app.

### Steps

1. **Create `src/webview/` directory with Vite + React**
   - `src/webview/index.html` — minimal HTML shell with CSP
   - `src/webview/main.tsx` — React root mount
   - `src/webview/App.tsx` — single component rendering `PreviewPanel` with `DEFAULT_CONTENT`
   - `src/webview/components/PreviewPanel.tsx` — copy from `modern-preview`
   - `src/webview/styles/preview.css` — Obsidian Dark theme CSS variables + markdown preview styles (port of `globals.css` `.markdown-preview*` rules)
   - `src/webview/styles/highlight.css` — highlight.js syntax theme from web app
   - `src/webview/constants.ts` — copy from modern-preview
   - `vite.config.ts` — builds webview to `dist/webview/`

2. **Update `extension.ts`**
   - Command `mdlive.preview` opens a `WebviewPanel`
   - Loads the bundled `dist/webview/index.html`
   - Sets `enableScripts: true`

3. **Build scripts**
   - `npm run build:webview` — `vite build`
   - `npm run build:extension` — `node esbuild.js`
   - `npm run build` — runs both
   - `npm run watch` — runs both in watch mode

4. **Test**
   - F5 → run `MdLive: Preview Markdown` from command palette
   - Webview opens with rendered `DEFAULT_CONTENT` — heading, code block, table, task list all styled
   - Appearance matches web app exactly (colors, fonts, spacing)

**Files to create:**
```
vscode-mdlive/
├── src/
│   └── webview/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   └── PreviewPanel.tsx
│       ├── styles/
│       │   ├── preview.css
│       │   └── highlight.css
│       ├── types/
│       │   └── index.ts
│       └── constants.ts
├── dist/
│   └── webview/     # Vite output (gitignored)
├── vite.config.ts
└── package.json     # + react, react-dom, react-markdown, etc.
```

---

## Phase 2: Add CodeMirror 6 Editor

**Goal:** Split webview into editor (left) + preview (right), same as web app's split view.

### Steps

1. **Add `EditorPanel.tsx`** — copy from `modern-preview/src/components/EditorPanel.tsx`
   - Same CodeMirror 6 config: `@codemirror/lang-markdown`, `@codemirror/theme-one-dark`
   - Same extensions, keymaps, placeholder
   - Same editor state management

2. **Add `Toolbar.tsx`** — simplified version from web app
   - View mode toggle buttons: **Edit**, **Preview**, **Split**, **Diff**
   - Open file button
   - Save button

3. **Update `App.tsx`** — same orchestrator pattern as `page.tsx`
   - State: `content`, `viewMode`
   - Render logic: same split/editor/preview switching
   - No file system yet — use `DEFAULT_CONTENT` as initial value

4. **Add view mode toggle CSS**
   - Active/inactive toolbar button styles
   - Split panel layout (side-by-side with border)

**Deliverable:** `Cmd+Shift+P` → `MdLive: Open Editor` → full split editor with live preview, view mode switching.

---

## Phase 3: VS Code File Integration

**Goal:** Open any `.md` file from VS Code's file explorer into the MdLive webview.

### Steps

1. **Register Custom Editor** in `package.json`
   - `customEditors` entry for `.md` and `.markdown`
   - `MdLiveEditorProvider` class implementing `CustomTextEditorProvider`

2. **Create `src/editorProvider.ts`**
   - `resolveCustomTextEditor(document, panel, token)`
   - Read document text → postMessage `{ type: 'setContent', content }` to webview
   - Listen for `{ type: 'save', content }` → write back via `WorkspaceEdit` + `document.save()`
   - Listen for `{ type: 'openFile', path }` → open another file in editor

3. **Wire file open in webview**
   - Add "Open File" button in toolbar
   - postMessage `{ type: 'requestOpenFile' }` → extension host → `vscode.window.showOpenDialog` filtered to `.md`
   - Return file path + content back to webview

4. **Status bar** — word count, char count, save state
   - Extension host creates `StatusBarItem`
   - Updated via postMessage from webview on content change

**Deliverable:** Click any `.md` file in VS Code explorer → opens in MdLive custom editor → edit → save (Ctrl+S).

---

## Phase 4: Sidebar & File Tree

**Goal:** Add a VS Code sidebar view showing all `.md` files in the workspace.

### Steps

1. **Register sidebar view** in `package.json`
   - `views.explorer` container with `mdlive.sidebar`
   - Activation event `onView:mdlive.sidebar`

2. **Create `src/sidebarProvider.ts`**
   - `WebviewViewProvider` with file tree UI
   - Reads workspace via `workspace.fs.readDirectory()` recursively
   - Filters to `.md`/`.markdown` files
   - Click file → opens in MdLive custom editor

**Deliverable:** Sidebar lists all markdown files in workspace. Click to open.

---

## Phase 5: Diff View & Polish

**Goal:** Feature parity with web app.

### Steps

1. **Diff View** — same component as `page.tsx`
   - `originalContent` captured on file open
   - "Show Diff" button when `content !== originalContent`
   - Same green/red line highlighting

2. **Task list checkbox click** — same as web app
   - Click checkbox in preview → modifies source in editor

3. **Double-click heading → navigate** — same as web app
   - Double-click heading in preview → CodeMirror scrolls to line

4. **PDF Export** — same `html2pdf.js` flow

5. **Copy code button** — already in PreviewPanel

**Deliverable:** Complete feature parity.

---

## Phase 6: Distribution

**Goal:** Package and publish to VS Code Marketplace + Open VSX.

- Add `media/icon.png`
- Write `README.md`
- `vsce package` → `.vsix`
- Publish to marketplace

---

## Quick Start Commands

```bash
# Phase 1 — build webview + extension
npm run build:webview
npm run build:extension
npm run compile        # runs both

# Dev — watch mode (both)
npm run watch

# Test
F5                     # opens Extension Dev Host
Cmd+Shift+P > MdLive:  # run any command
```
