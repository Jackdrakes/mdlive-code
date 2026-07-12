# MdLive

Live markdown editor for VS Code with split preview, CodeMirror editing, and GitHub Flavored Markdown support.

## Features

- **Split-pane editing** — CodeMirror 6 editor on the left, live markdown preview on the right
- **Custom editor** — opens `.md` and `.markdown` files directly in MdLive
- **GitHub Flavored Markdown** — tables, task lists, strikethrough, and syntax-highlighted code blocks
- **Double-click to navigate** — double-click any block in the preview to select the corresponding lines in the editor
- **Clickable checkboxes** — toggle task list items in the preview and the source updates automatically
- **Heading anchors** — auto-generated slug IDs with hover permalink icons
- **Diff view** — side-by-side comparison of saved vs current content
- **Find & Replace** — `Cmd+H` opens the search/replace panel
- **Full-width preview** — toggle to expand the preview panel to fill the editor
- **Status bar** — word count, character count, and save state at a glance
- **Auto-save** — debounced save back to the workspace filesystem

## Getting Started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=your-publisher.mdlive)
2. Open any `.md` file — it opens automatically in the MdLive editor
3. Or run `MdLive: Open Markdown Editor` from the Command Palette (`Cmd+Shift+P`)

## Usage

| Action | Shortcut |
|---|---|
| Open MdLive Editor | `Cmd+Shift+P` → `MdLive: Open Markdown Editor` |
| Find & Replace | `Cmd+H` |
| Save | `Cmd+S` |
| Double-click preview block | Selects corresponding lines in editor |

## View Modes

- **Split** — editor and preview side by side (default)
- **Editor** — full-width CodeMirror editor only
- **Preview** — full-width markdown preview only
- **Diff** — compare saved content against current edits

## Requirements

- VS Code `1.85.0` or later

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

[Apache 2.0](./LICENSE)
