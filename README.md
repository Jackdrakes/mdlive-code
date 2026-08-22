# MdLive

[![Version](https://img.shields.io/visual-studio-marketplace/v/jackspace.vscode-mdlive.svg?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=jackspace.vscode-mdlive)
[![License](https://img.shields.io/github/license/Jackdrakes/mdlive-code.svg)](https://github.com/Jackdrakes/mdlive-code/blob/main/LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-brightgreen.svg)](https://code.visualstudio.com/)

A live markdown editor for VS Code with split preview, CodeMirror editing, GitHub Flavored Markdown, Obsidian vault support, and one-click sharing.

![MdLive split view with live preview](media/screenshot-hero.png)

---

## Why MdLive?

VS Code's built-in markdown preview is read-only, disconnected from the editor, and doesn't understand Obsidian wikilinks. MdLive replaces it with a real-time split editor where the preview is interactive — click checkboxes to toggle task items, double-click any block to jump to its source, and follow wikilinks to navigate your vault.

If you work with markdown daily and want an editor that feels like a tool rather than a viewer, MdLive is for you.

---

## Features

### Core Editing

- **Split-pane editing** — CodeMirror 6 editor on the left, live markdown preview on the right
- **Custom editor** — opens `.md` and `.markdown` files directly in MdLive, no setup required
- **GitHub Flavored Markdown** — tables, task lists, strikethrough, and syntax-highlighted code blocks
- **Find & Replace** — `Cmd+H` opens the search/replace panel
- **Full-width preview** — toggle to expand the preview panel to fill the editor
- **Auto-save** — debounced save back to the workspace filesystem
- **Status bar** — word count, character count, and save state at a glance

### Interactive Preview

- **Clickable checkboxes** — toggle task list items in the preview and the source updates automatically
- **Double-click to navigate** — double-click any block in the preview to select the corresponding lines in the editor
- **Heading anchors** — auto-generated slug IDs with hover permalink icons
- **Copy code blocks** — one-click copy button on every fenced code block

### View Modes

- **Split** — editor and preview side by side (default)
- **Editor** — full-width CodeMirror editor only
- **Preview** — full-width markdown preview only
- **Diff** — side-by-side comparison of saved vs current content

View mode preference is persisted across files and sessions.

### Obsidian Integration

MdLive auto-detects Obsidian vaults by checking for a `.obsidian/` directory. When working inside a vault:

- **Wikilink navigation** — click `[[Page Name]]` or `[[Page Name|Alias]]` to open the linked note
- **Heading links** — `[[Page#heading]]` scrolls directly to the target heading
- **Smart link resolution** — finds files by exact path, basename match, or partial match across the vault
- **Standard markdown links** — `./relative/path.md` and `../path.md` also navigate correctly

### Sharing

- **One-click share** — click the share button to upload your markdown and get a shareable URL
- Share works from the toolbar or via `MdLive: Share Markdown` command
- URL is copied to your clipboard automatically

---

## Screenshots

**Split view with rich markdown** — headings, code blocks, tables, and task lists rendered side by side:

![Split view](media/screenshot-split.png)

**Interactive preview** — click a checkbox in the preview to toggle the source:

![Interactive checkboxes](media/gif-checkboxes.gif)

**Obsidian wikilink navigation** — click a `[[wikilink]]` to navigate between notes:

![Wikilink navigation](media/gif-wikilinks.gif)

---

## Quick Start

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jackspace.vscode-mdlive)
2. Open any `.md` file — it opens automatically in the MdLive editor
3. Or run `MdLive: Open Markdown Editor` from the Command Palette (`Cmd+Shift+P`)

---

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `MdLive: Open Markdown Editor` | `Cmd+Shift+P` | Open active markdown file in MdLive |
| `MdLive: Share Markdown` | — | Share current markdown file via URL |
| Find & Replace | `Cmd+H` | Open search/replace panel |
| Save | `Cmd+S` | Save current file |
| Double-click preview block | — | Select corresponding lines in editor |

### Toolbar Actions

The floating toolbar in the top-right corner provides:

- **Split / Editor / Preview** — switch between view modes
- **Diff toggle** — compare saved content against current edits
- **Share** — upload and share current markdown

---

## Requirements

- VS Code `1.85.0` or later

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

---

## License

[Apache 2.0](./LICENSE)
