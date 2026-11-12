# MD Live Agent Guide

This file is the persistent engineering context for the MD Live VS Code extension. Keep it focused on durable architecture, verified behavior, and repeatable workflows. Update it when those facts change; do not turn it into a bug diary.

## A. Project Identity and Purpose

MD Live (`vscode-mdlive`) is a VS Code custom editor for Markdown files. It combines a CodeMirror 6 editor with a live React preview, GFM rendering, interactive preview actions, and navigation between Markdown notes.

The primary users are people who edit Markdown in VS Code and users with Obsidian-style vaults. Obsidian compatibility is implemented as an optional workspace behavior: when the first workspace folder contains `.obsidian/`, MD Live enables wikilink resolution and vault-wide Markdown/image lookup. The product direction is a more interactive Markdown editing experience than the built-in read-only preview, not a full Obsidian replacement.

## B. Current Implementation Status

Status below is based on the current source tree, tests, `README.md`, and `CHANGELOG.md`.

### Implemented

- A default-priority custom editor for `*.md` and `*.markdown`, registered as `mdlive.editor`.
- Split, editor-only, and preview-only modes, with the selected mode persisted in VS Code workspace state.
- CodeMirror 6 Markdown editing with VS Code dark theme, line numbers, folding, search/replace, and common editor behavior.
- Live React Markdown preview with GFM tables, task lists, strikethrough, and syntax-highlighted fenced code.
- Debounced content synchronization to the host, explicit save via `Cmd/Ctrl+S`, and a `:w` Enter-key shortcut.
- Word/character counts, saved-vs-current diff rendering, full-width preview toggle, and code-block copy controls.
- Interactive task-list checkbox handling, preview block double-click selection, heading slug anchors, and same-note heading scrolling.
- Obsidian wikilinks with aliases, heading targets, same-note headings, exact path lookup, unique basename lookup, and unique partial basename fallback.
- Standard Markdown relative links, vault-root absolute links, extension inference for Markdown targets, heading-only links, and safe external `http(s)`, `mailto`, and `tel` opening.
- Obsidian image embeds such as `![[image.png]]` and numeric width syntax such as `![[image.png|200]]`.
- Local image resolution for relative, absolute, vault-relative, and unique filename matches, plus remote `https`/`data` images allowed by the webview CSP.
- Automatic first-workspace-folder Obsidian detection and a cached recursive vault index for Markdown and image files.
- One-click sharing through the remote `https://beta-mdlive.vercel.app/api/share` service after a confirmation prompt, from the toolbar or `MdLive: Share Markdown` command.
- Pure unit tests for slugging, wikilink transformation, link resolution, vault indexing, and heading lookup.

### Partially implemented or constrained

- Vault indexing is cached per root and invalidated on file create/delete, but the watcher does not invalidate on file change or rename. Only the first workspace folder is considered.
- The host/webview message protocol is typed at compile time but does not perform runtime payload validation. Host integration and webview interaction behavior are not covered by automated tests.
- Navigation opens or reveals another MD Live panel and can carry a heading scroll request, but there is no active back/forward history API; the old dead history code was removed.
- Sharing is tied to a hard-coded beta service and sends the complete document after confirmation. The command checks `.md` but not `.markdown`, while the custom editor supports both.
- The preview allows remote image URLs but the Markdown renderer does not fetch or preprocess remote content in the extension host. Runtime behavior depends on the webview and CSP.
- The current working tree contains the link/index/image/test work described under `CHANGELOG.md`'s `Unreleased` section. It is not a clean release state: `package.json` is version `0.1.7`, while `HEAD` is tagged `v0.2.0` and the changelog has a `0.2.0` entry.

### Planned or proposed

- No separate roadmap, issue export, or explicit future-feature specification was found in the repository. Treat `Unreleased` changelog entries as pending release/review evidence, not as a product commitment unless a maintainer confirms them.

### Unknown or unverified

- There is no explicit frontmatter/YAML metadata parser or metadata model. Frontmatter-specific behavior is therefore not an MD Live compatibility guarantee.
- Note-content transclusion such as `![[other note]]` is explicitly documented as unsupported. Other Obsidian extensions, including callouts, embeds beyond images, block IDs, and dataview syntax, are not implemented or verified.
- There are no VS Code extension-host integration tests, webview component tests, packaging smoke tests, or cross-platform runtime tests in the repository.
- Multi-root workspace behavior, workspace trust behavior, very large document behavior, and Windows/macOS/Linux navigation edge cases are not verified by tests.

## C. Architecture and Component Responsibilities

### Activation and host lifecycle

- `package.json` activates on `onCustomEditor:mdlive.editor` and `onLanguage:markdown`, contributes the custom editor, and declares `mdlive.openEditor` and `mdlive.share`.
- `src/extension.ts` exports `activate()` and an empty `deactivate()`. Activation creates one shared `NavigationManager`, registers it for disposal, registers `MdLiveEditorProvider`, and registers the two commands.
- `MdLiveEditorProvider` implements `vscode.CustomTextEditorProvider`. It owns panel lookup by document path and pending heading-scroll requests. Each resolved panel registers a document-change listener, webview message listener, and disposal cleanup.

### Webview bootstrap and security boundary

- `src/extension.ts:getWebviewContent()` reads `dist/webview/index.html`, generates a cryptographic nonce, injects initial view mode, rewrites bundled asset paths to webview URIs, and fills CSP placeholders.
- `src/webview/index.html` defines the webview CSP. The host restricts `localResourceRoots` to the extension's `dist` directory, the current file directory, and the detected vault root when available.
- `src/webview/main.tsx` mounts the React app and imports `src/webview/styles/preview.css`.
- The webview communicates only through `acquireVsCodeApi()` and `postMessage`; message shapes are declared in `src/webview/vscodeApi.ts`.

### Webview UI

- `src/webview/App.tsx` owns content, saved content, loading state, file identity, vault information, image mappings, view mode, diff mode, and editor-selection requests.
- `src/webview/components/EditorPanel.tsx` wraps CodeMirror, handles editor changes, save shortcuts, `:w`, search/replace, and host-requested line selection.
- `src/webview/components/PreviewPanel.tsx` renders Markdown and implements custom links, anchors, task items, code copy, image mapping, block double-clicks, and diff output.
- `src/webview/components/Toolbar.tsx` switches view modes, diff mode, and sharing.
- `src/webview/lib/markdown.ts` contains word/character counts and Obsidian image-embed preprocessing. `src/webview/lib/diff.ts` contains the line-based LCS diff. `src/webview/lib/useScrollBounce.ts` handles preview scroll behavior.

### Host/webview message protocol

The protocol is implemented as VS Code webview messages, not as a shared RPC service. Keep message names and payloads synchronized between `src/extension.ts` and `src/webview/vscodeApi.ts`.

| Direction | Messages | Purpose |
| --- | --- | --- |
| Webview to host | `ready` | Starts the initial content, view mode, and vault information exchange. |
| Host to webview | `setContent` | Sends document text, file identity, and the current image map. |
| Webview to host | `contentChanged` | Applies debounced editor changes to the `TextDocument` through `WorkspaceEdit`. |
| Webview to host | `save` | Applies the latest content and calls `TextDocument.save()`. |
| Host to webview | `saveCompleted` | Marks the current webview content as saved. |
| Webview to host | `viewModeChanged` | Persists the selected split/editor/preview mode in workspace state. |
| Host to webview | `setViewMode` | Restores the persisted mode when the panel becomes ready. |
| Webview to host | `navigate` | Requests internal Markdown or wikilink resolution. |
| Host to webview | `scrollToHeading` | Requests preview scrolling and, when known, editor line selection. |
| Webview to host | `openExternal` | Requests allowlisted external URL handling. |
| Webview to host | `copyToClipboard` | Provides the host clipboard fallback for code-block copy. |
| Webview to host | `share` | Requests confirmation and remote sharing of the current document. |
| Host to webview | `shareCompleted` | Returns the generated share URL to the webview. |
| Host to webview | `imageMap` | Refreshes local image mappings after document edits or saves. |
| Host to webview | `vaultInfo` | Reports detected Obsidian-vault state and root path. |

The current host handler accepts unvalidated message payloads at runtime. Do not assume the TypeScript union is a security boundary when adding a message or consuming user-controlled values.

### Document and panel lifecycle

1. VS Code invokes `resolveCustomTextEditor()` for a Markdown document.
2. The provider configures scripts and local resource roots, loads the built webview HTML, and registers the panel by document filesystem path.
3. `NavigationManager.initialize()` detects the first workspace folder and installs the vault watcher once.
4. The webview sends `ready`; the provider responds with document content, image mappings, persisted view mode, vault information, and any pending heading scroll.
5. CodeMirror changes update React state immediately and send a full-document `contentChanged` message after a 300 ms debounce. The host replaces the document through `WorkspaceEdit`.
6. Explicit save applies the full current text, calls `document.save()`, refreshes image mappings, and sends `saveCompleted`.
7. Disposing the panel removes the document-change listener and panel lookup entry. `NavigationManager.dispose()` removes vault watcher resources when the extension is disposed.

The document is the source of truth in the extension host. Avoid introducing a second persisted content store or treating webview state as authoritative.

### Markdown rendering pipeline

1. The host sends document content and an image map in a `setContent` message.
2. `PreviewPanel` converts supported Obsidian image embeds to marked Markdown image URLs, preserving width in a `mdlive-embed:` marker.
3. `react-markdown` parses the result with `remark-gfm` and the custom `remarkWikilinks` plugin from `src/lib/wikilinks.ts`.
4. Rehype sanitizes the generated tree with a custom schema, then applies `rehype-highlight`.
5. Custom React components in `PreviewPanel` add anchors, navigation messages, checkbox actions, copy buttons, image URI substitution, and source-line callbacks.

Keep sanitization before highlighting when changing this pipeline. Changes to parsing or link rendering must preserve ordinary Markdown unless an intentional compatibility change is documented and tested.

### Navigation and file resolution

- `src/navigation-manager.ts` selects the Obsidian or standard Markdown resolver, initializes vault detection, creates a vault watcher, and disposes watcher resources.
- `src/vault-detector.ts` caches whether the first workspace folder contains `.obsidian/` and reports that folder as the vault root.
- `src/link-resolver.ts` adapts pure path-resolution results into VS Code `Uri` values.
- `src/lib/link-core.ts` is the testable core for wikilink parsing, Markdown/Obsidian target resolution, same-file comparison, and heading line lookup. Modify this file for resolution rules rather than duplicating path logic in the host.
- `src/lib/vault-index.ts` recursively scans a vault once per root, ignores `node_modules`, `.git`, and `.obsidian`, and caches Markdown/image paths. `NavigationManager` invalidates it on create/delete events.
- `src/lib/slug.ts` is the canonical heading slug implementation used by both preview anchors and host heading navigation.
- `src/image-resolver.ts` extracts Markdown/Obsidian image targets and maps resolved local files to `asWebviewUri()` values.

For a new navigation feature, start in `src/lib/link-core.ts` and its tests, then update the resolver/host message path and preview link handling as needed. For a new rendering feature, start in `src/webview/lib/markdown.ts` or `PreviewPanel.tsx` and check sanitization/CSP implications.

### Configuration and extension points

There is currently no `contributes.configuration` section in `package.json`. The only persisted user preference is the workspace-state key `mdlive.viewMode`; there is no settings API for vault roots, sharing, endpoint selection, rendering options, or compatibility modes. A new setting must be added to the manifest and documented rather than silently using an unregistered configuration key.

The main extension points are the custom editor provider, the pure resolver/index utilities, the typed webview message boundary, and the React Markdown component overrides. Prefer extending those boundaries over adding parallel host services or a second Markdown renderer.

### State and persistence

- Document content remains authoritative in the VS Code `TextDocument`; webview edits are applied through `WorkspaceEdit`, and explicit save calls `document.save()`.
- `mdlive.viewMode` is stored in `ExtensionContext.workspaceState` and mirrored in webview state for fast restoration.
- There is no application database, custom settings store, or persisted vault index.

### Build and packaging architecture

- `vite.config.ts` builds the React webview from `src/webview` into `dist/webview`, uses the `@` alias for `src`, and splits React, CodeMirror, and Markdown dependencies into chunks.
- `esbuild.js` bundles `src/extension.ts` into `out/extension.js` for Node 16, leaving the `vscode` module external.
- `package.json` points VS Code at `out/extension.js`; the packaged extension includes `dist/webview`, `out`, manifest/docs, and icons while `.vscodeignore` excludes source, tests, config, and development files.

## D. Repository Structure

```text
src/
  extension.ts                 VS Code activation, custom editor, host/webview protocol
  navigation-manager.ts        Resolver selection, vault watcher, lifecycle disposal
  vault-detector.ts             First-workspace-folder .obsidian detection
  link-resolver.ts              VS Code URI adapters for link-core results
  image-resolver.ts             Local/remote/Obsidian image target resolution
  lib/                          Testable link, slug, wikilink, and vault-index logic
  webview/
    App.tsx                     Webview state and top-level layout
    components/                 Editor, preview, and toolbar UI
    lib/                        Markdown preprocessing, diff, constants, scroll behavior
    styles/                     Webview styling and responsive layout
    vscodeApi.ts                acquireVsCodeApi wrapper and message types
tests/                           Vitest unit tests and vault fixtures
.vscode/                         F5 launch configuration and compile task
.github/workflows/               Marketplace and Open VSX publishing workflow
package.json                     Extension manifest, contributions, dependencies, scripts
package-lock.json                Locked dependency graph
README.md                        User-facing feature and usage documentation
CHANGELOG.md                     Release history and current unreleased notes
.vscodeignore                   VSIX inclusion/exclusion rules
```

Generated or local artifacts include `out/`, `dist/webview/`, `node_modules/`, and `*.vsix`; they are ignored by Git. Do not edit generated bundles when changing source.

## E. Engineering Conventions

- Use TypeScript with strict checking. The host uses CommonJS/Node-oriented compilation; the webview uses ES modules, bundler resolution, React JSX, and DOM libraries.
- Use double quotes and semicolons in TypeScript/TSX, matching the current source. Prefer small named functions and interfaces near their boundary.
- Keep host-only code under `src/` root and webview-only code under `src/webview/`. Put reusable, environment-independent logic in `src/lib/` so it can be unit tested without VS Code.
- Prefer dependency injection through small function interfaces for filesystem behavior, as `link-core.ts` does. Do not add a second resolver or scanner when an existing abstraction can be extended.
- Use `async`/`await` for filesystem and VS Code operations. Catch expected filesystem misses locally; surface user-visible failures with VS Code warning/error messages and log diagnostic details where appropriate.
- Dispose VS Code watchers, event listeners, and timers. Panel disposal must remove panel registrations and document listeners. React effects must clean up listeners and timers.
- Use `console.error` for host failures that need diagnostics and `showWarningMessage`/`showErrorMessage` for actionable user feedback. Avoid logging document contents or secrets.
- Keep dependency changes deliberate. Update `package.json` and `package-lock.json` together; prefer existing React, CodeMirror, unified/remark, rehype, and VS Code APIs.
- Unit tests use Vitest with a Node environment and live in `tests/**/*.test.ts`. Pure logic should have focused tests, including ambiguous/missing path cases and compatibility edge cases.
- There is no lint script or formatter configuration. Do not invent a lint command as a required check; preserve local style and run the available type checks instead.
- User-facing behavior changes belong in `README.md` and/or `CHANGELOG.md` when appropriate. Release/version edits require explicit release intent because the current tree has unresolved version/changelog state.

## F. Markdown and Obsidian Compatibility Rules

### Verified behavior

- Standard Markdown is parsed by `react-markdown`; GFM is enabled through `remark-gfm`.
- Fenced code is syntax highlighted after sanitization, and wikilink/image preprocessing skips fenced code in the supported image-transform path.
- Wikilinks are transformed only in text nodes, not inside inline/fenced code, existing links, or image nodes. `![[...]]` is reserved for image-embed handling and is not converted to a note link.
- Supported wikilink forms include `[[Note]]`, `[[Note|Alias]]`, `[[Note#Heading]]`, `[[Note#Heading|Alias]]`, and `[[#Heading]]`.
- In an Obsidian vault, resolution tries exact absolute/vault-relative/current-file-relative paths, unique basename matches, unique partial basename matches, and same-directory partial matches. Ambiguous or missing matches return no result.
- Standard Markdown links resolve relative to the current note, `/...` links against the detected vault root when present, and missing `.md`/`.markdown` extensions are tried. Heading-only links target the current file.
- Heading slugs are generated by `src/lib/slug.ts`: lowercase text, preserve Unicode letters/numbers, remove punctuation, collapse whitespace/hyphens, and trim edge hyphens.
- Supported image formats are defined in `src/lib/vault-index.ts` and include AVIF, BMP, GIF, ICO, JPEG, JPG, PNG, SVG, TIFF, and WebP.
- Obsidian image embeds support a filename/path target and an optional numeric pixel width. Unique vault filename fallback is available for images. Note transclusion is not performed.

### Compatibility boundaries

- Frontmatter is not parsed into metadata, and no frontmatter-specific rendering contract exists.
- Obsidian callouts, block references, block IDs, dataview, embedded notes, and other plugins/syntax are unsupported or unverified.
- Vault detection is based only on a `.obsidian/` directory directly under the first workspace folder. There is no user-configurable vault root.
- Link resolution uses filesystem paths and platform `path` utilities. Preserve platform separators and avoid case-sensitive assumptions when changing it.
- New Markdown features must preserve existing standard Markdown behavior by default. Any syntax interception, preprocessing, sanitization exception, or link-routing change must be intentional, documented, and covered by tests.

### Resolution details for future changes

- `src/lib/wikilinks.ts` converts wikilinks in Markdown text nodes into link nodes while avoiding inline code, fenced code, existing links, and image nodes. It does not resolve files; that remains a host-side concern.
- `src/lib/link-core.ts` parses the target, heading, alias, and embed marker. An empty wikilink target resolves to the current file so same-note headings can be handled by the provider.
- Obsidian resolution first tries explicit paths, then unique case-insensitive basename matches, then unique partial basename matches, and finally unique same-directory partial matches. Ambiguous results deliberately return `null` rather than choosing arbitrarily.
- Standard Markdown resolution handles `#heading`, relative paths, vault-root `/path` targets when a vault root exists, and inferred `.md`/`.markdown` files. HTTP links are not local targets.
- The provider uses `slugify()` and `findHeadingLine()` for heading navigation. Keep preview anchor generation and host line lookup on the same slug implementation.
- `src/webview/lib/markdown.ts` rewrites supported image embeds outside fenced code into an internal marker format. The host builds a local image map using `src/image-resolver.ts`; the preview then converts mapped paths to webview URIs.
- Image resolution is intentionally separate from note navigation. Do not route image embeds through the Markdown note resolver or add note transclusion without an explicit product decision.

## G. Security, Stability, and Performance

### Existing safeguards

- The webview CSP uses `default-src 'none'`, a cryptographically random script nonce, strict dynamic script loading, no XHR/fetch connections via `connect-src 'none'`, and restricted image/style/font sources.
- `rehype-sanitize` runs before `rehype-highlight`. The custom schema only adds the `data` and `mdlive-embed` image protocols needed by current behavior.
- Webview local resource roots are limited to extension assets, the current file directory, and the detected vault root.
- External opening is allowlisted to `http(s)`, `mailto`, and `tel`; arbitrary schemes are rejected with a warning.
- Sharing requires an explicit confirmation before sending document content to the remote service.
- Vault scans skip `node_modules`, `.git`, and `.obsidian`, cache results, share in-flight scans, and invalidate on relevant create/delete events.

### Constraints and required care

- Markdown and link targets are untrusted input. Do not weaken sanitization or CSP to make a feature work without documenting the exact required protocol/source and adding a regression test.
- Do not broaden `localResourceRoots` casually. Resolve local files through the existing image resolver and verify that new resource paths remain within intended workspace/vault boundaries.
- Treat workspace trust and arbitrary filesystem links as security-sensitive. The current code does not implement an explicit workspace-trust policy; changes that add broader file access need an intentional design review.
- Do not add network fetching from the extension host or webview without considering CSP, privacy, failure behavior, and user consent. The share endpoint is an existing external data flow.
- Avoid a full vault scan per click or per render. Extend `VaultIndex` and its invalidation strategy rather than introducing recursive scans in UI handlers.
- Large documents can make the current line-based diff and full React render expensive. Preserve existing behavior first, then measure before introducing optimization.
- Dispose listeners, timers, watchers, and panels. In particular, preserve the cleanup patterns in `extension.ts`, `EditorPanel.tsx`, and `PreviewPanel.tsx`.
- Test path resolution with relative paths, absolute paths, missing extensions, duplicate basenames, URL-encoded targets, and platform separators before changing navigation.

Recommended improvements above are not current guarantees or approved roadmap items.

## H. Development and Validation Workflow

Run commands from the repository root after installing Node dependencies.

### Install

- Local install: `npm install`
- Clean/CI install: `npm ci`
- The publishing workflow uses Node 20 and `npm ci`.

### Build and development

- Full production compile: `npm run compile` (webview Vite build, then extension esbuild bundle)
- Webview only: `npm run build:webview`
- Extension host only: `npm run build:extension`
- Extension bundle watch: `npm run watch:extension`
- Webview build watch: `npm run watch:webview`
- Extension bundle watch alias: `npm run watch` (does not watch the webview)
- VS Code development host: press F5 using `.vscode/launch.json`; it runs the `npm: compile` task first.

### Type checking and tests

- Extension host type check: `npm run typecheck:extension`
- Webview/shared type check: `npm run typecheck:webview`
- Unit tests: `npm test`
- Test selection is `tests/**/*.test.ts`, with Node as the Vitest environment.

There is no `lint` script and no VS Code extension-host integration test command. Do not claim either check was run unless one is added explicitly.

### Packaging and publishing

- Package a VSIX: `npm run package` (runs `vscode:prepublish`, which runs `npm run compile`, then `vsce package`).
- Direct prepublish compile: `npm run vscode:prepublish`
- Publish from a configured environment: `npm run publish` (requires `vsce` credentials).
- CI publishes `extension.vsix` to the VS Code Marketplace and Open VSX on pushes to `prod` or manual dispatch, using `MARKETPLACE_TOKEN` and `OPENVSX_TOKEN` secrets.

Before considering a code modification finished, run the relevant unit tests and both type checks. For source changes, run `npm run compile`; for manifest, packaging, CSP, resource, or release changes, also run `npm run package`. Report each command and its result, including skipped checks and why they were not applicable.

## I. AI Agent Operating Instructions

### Before implementing a feature

1. Read `AGENTS.md`.
2. Inspect the relevant source files, tests, manifest contributions, and current documentation.
3. Check existing functionality before introducing new abstractions.
4. Identify the impact on Markdown rendering, Obsidian compatibility, navigation, CSP, filesystem access, and panel lifecycle.
5. Review relevant dependencies and tests.
6. Prepare a concise implementation plan for nontrivial changes.
7. Identify compatibility risks and unknowns.

### During implementation

1. Follow existing project conventions.
2. Prefer minimal, targeted changes.
3. Reuse existing utilities and abstractions, especially `link-core`, `slug`, `VaultIndex`, and the typed message boundary.
4. Avoid unnecessary dependencies.
5. Maintain backward compatibility where practical.
6. Handle errors and lifecycle cleanup appropriately.
7. Add or update tests for changed pure behavior and compatibility rules.
8. Avoid unrelated refactoring.
9. Do not remove existing functionality without an explicit reason and approval.
10. Do not edit generated `out/`, `dist/webview/`, or VSIX artifacts as source.

### After implementation

1. Run relevant validation commands.
2. Report exactly which checks passed or failed.
3. Summarize modified components.
4. Explain architectural decisions.
5. Report known limitations.
6. Identify follow-up work.
7. Update `AGENTS.md` only when durable architecture, conventions, build/test procedures, or verified feature status changed.

## J. Feature Development and Planning Protocol

For every requested feature:

1. Understand the requirement and its user-visible behavior.
2. Find the existing implementation related to it.
3. Determine whether it is implemented, partial, unsupported, or new.
4. Identify dependencies and the relevant host/webview message flow.
5. Evaluate Markdown, Obsidian, navigation, security, performance, and regression risks.
6. Break nontrivial work into meaningful technical steps.
7. Implement only the requested scope.
8. Validate the result with the narrowest applicable tests, then the required build/type checks.
9. Summarize completion, limitations, and remaining work.

For complex or ambiguous requests, propose the architecture and implementation plan before making substantial changes. Do not implement unrelated improvements discovered during the audit.

## K. Roadmap and Technical Debt

### Confirmed limitations or incomplete behavior

- Note transclusion (`![[other note]]`) is explicitly unsupported.
- Frontmatter metadata is not modeled or specially parsed.
- Obsidian features beyond wikilinks, headings, and image embeds are not implemented or verified.
- Vault invalidation misses file-content changes and renames, and vault detection only covers the first workspace folder.
- There are no host/webview integration tests or cross-platform runtime tests.
- There is no contributed settings surface for vault roots, sharing, rendering, or compatibility options.
- Sharing uses a hard-coded beta endpoint and the current command path only accepts `.md`.
- Release metadata is currently inconsistent (`package.json` `0.1.7` versus `v0.2.0` history/tag and `Unreleased` changes). Resolve only as part of an intentional release task.

### Existing repository evidence

- `CHANGELOG.md` records the current link/index/image work under `Unreleased` and documents prior released behavior.
- No TODO/FIXME/HACK markers, issue tracker export, architecture document, or separate roadmap was found in the repository.

### Agent-generated recommendations

- Add extension-host integration tests for custom editor activation, webview messages, save behavior, panel reuse, and heading navigation.
- Add webview/component tests for checkbox updates, link routing, image embeds, sanitization, diff mode, and copy fallbacks.
- Extend watcher invalidation for file changes and renames, with tests for cache refresh and large-vault behavior.
- Define an explicit workspace-trust/path-containment policy before broadening filesystem access.
- Reconcile release version, changelog, branch/tag state, and generated VSIX naming in a dedicated release change.

Recommendations are not commitments. Confirm scope before implementing them.

## L. Definition of Done

A feature is complete when:

- The requested behavior works through the correct host/webview/component path.
- Existing Markdown behavior and supported Obsidian link/image behavior do not regress.
- Link and filesystem changes handle missing, ambiguous, relative, absolute, and cross-platform cases safely.
- Webview CSP, sanitization, external-link handling, workspace boundaries, and resource roots remain appropriately constrained.
- Event listeners, timers, watchers, and panels are cleaned up correctly.
- Appropriate unit tests are added or updated; known lack of integration coverage is stated.
- Applicable type checks, tests, compile, and package validation pass.
- User-facing documentation or changelog entries are updated when behavior or release status warrants it.
- The final report names changed components, architectural decisions, validation results, limitations, and follow-up work.

## Maintaining This File

Update `AGENTS.md` when the architecture changes meaningfully, a major extension capability is added, development conventions change, build/test procedures change, or verified feature status materially changes. Keep persistent facts separate from temporary implementation notes. Do not rewrite this file after every small bug fix, and do not record speculative plans as implemented behavior.
