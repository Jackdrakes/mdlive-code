# Changelog

All notable changes to **MdLive** will be documented in this file.

---

## [0.1.1] — 2026-07-12

### Features

- Side-by-side diff view comparing saved vs current content
- Clickable task checkboxes in preview that toggle source markdown on click
- Heading anchors with slug IDs and hover permalink icons
- Content change sync to extension host on every edit
- GitHub Actions publish workflow for VS Code Marketplace and Open VSX
- Webview TypeScript type-checking via `tsc --noEmit`
- Cryptographically secure CSP nonce (`crypto.randomBytes` replacing `Math.random()`)
- Extension icon for vsce packaging (`media/icon.png`)

### Bug Fixes

- Fixed full-width toggle SVG icon and toggle applying to the wrong container
- Fixed fullwidth-btn split icon overlapping with the floating action button
- Fixed EditorPanel keyboard listener memory leak on unmount
- Fixed preview panel not filling full window height when content is short
- Fixed rehype plugin ordering (`rehype-sanitize` now correctly applied last for security)
- Fixed `package.json` manifest fields for valid `vsce package` output

---

## [0.1.0] — 2026-06-23

### Features

- Split-pane markdown editor with CodeMirror 6 and live preview
- Custom editor provider for `.md` and `.markdown` files (`CustomTextEditorProvider`)
- Markdown preview with GFM tables, task lists, and syntax highlighting via `react-markdown`, `remark-gfm`, and `rehype-highlight`
- Sidebar file tree listing all markdown files in the workspace
- Status bar with word count, character count, and save state
- Obsidian Dark theme ported from the web app
- Debounced auto-save from webview to workspace filesystem
- PostMessage protocol between extension host and webview
- Vite + esbuild dual build pipeline for webview and extension
