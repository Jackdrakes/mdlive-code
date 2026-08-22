# Changelog

All notable changes to **MdLive** will be documented in this file.

---

## [0.1.6] — 2026-08-22

### Features

- Add Obsidian vault integration with automatic detection and file navigation
- Add loading spinner during vault detection for better UX
- Rewrite README with comprehensive documentation

### Bug Fixes

- Open external links in browser instead of routing through local resolver
- Allow external images in preview CSP (was blocking remote images)
- Add confirmation dialog before sharing document content
- Log filesystem errors in vault scanner instead of silently swallowing them

### Refactoring

- Extract shared `shareDocument()` function to deduplicate share logic between webview handler and command
- Remove unused `@codemirror/theme-one-dark` dependency
- Remove unused `IncomingMessage` type and `VaultDetector.invalidate()` method
- Tighten `.vscodeignore` to exclude build config and test files from `.vsix`

### Chores

- Update marketplace keywords for better discoverability
- Add `.DS_Store` to gitignore and untrack

---

## [0.1.5] — 2026-08-01

### Features

- Obsidian wikilink navigation (`[[target]]`, `[[target|alias]]`, `[[target#heading]]`)
- Standard markdown link resolution (relative paths, absolute paths, heading anchors)
- Navigation history with back/forward support
- External link handling via `vscode.env.openExternal()`

### Bug Fixes

- Fixed wikilink resolution across vault with basename and partial matching

---

## [0.1.4] — 2026-07-25

### Performance

- Code-split Vite build into vendor chunks: react-vendor (3.9 kB), app (200 kB), codemirror-lang (210 kB), codemirror-core (420 kB), markdown (340 kB)
- Eliminated monolithic 1,177 kB bundle — all chunks now under 500 kB

---

## [0.1.3] — 2026-07-25

### Features

- Remember user's view mode preference (split/editor/preview) across .md files
- View mode persisted via VS Code workspace state for cross-session retention
- Instant view mode restoration via HTML-injected initial state (no flicker on large files)

---

## [0.1.2] — 2026-07-12

### Features

- Double-click any block in preview to select corresponding lines in the CodeMirror editor
- Find & Replace panel (`Cmd+H`) via `@codemirror/search`
- Editor theme switched from `oneDark` to `vscodeDark` for native VS Code appearance
- CodeMirror UI polish: gutter styling, active line highlight, selection color, cursor, fold gutter, and search panel

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
- Fixed rehype plugin ordering (`rehype-sanitize` now correctly applied first before highlighting for security)
- Fixed `package.json` manifest fields for valid `vsce package` output

---

## [0.1.0] — 2026-06-23

### Features

- Split-pane markdown editor with CodeMirror 6 and live preview
- Custom editor provider for `.md` and `.markdown` files (`CustomTextEditorProvider`)
- Markdown preview with GFM tables, task lists, and syntax highlighting via `react-markdown`, `remark-gfm`, and `rehype-highlight`
- Status bar with word count, character count, and save state
- Obsidian Dark theme ported from the web app
- Debounced auto-save from webview to workspace filesystem
- PostMessage protocol between extension host and webview
- Vite + esbuild dual build pipeline for webview and extension
