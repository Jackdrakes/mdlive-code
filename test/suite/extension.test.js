const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const vscode = require("vscode");

suite("MdLive extension host", () => {
  test("activates and registers the public commands", async () => {
    const extension = vscode.extensions.getExtension("jackspace.vscode-mdlive");
    assert.ok(extension, "MdLive extension should be available in the test host");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("mdlive.openEditor"));
    assert.ok(commands.includes("mdlive.share"));
  });

  test("opens a Markdown document with the custom editor", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdlive-test-"));
    const filePath = path.join(directory, "smoke.md");
    await fs.writeFile(filePath, "# Smoke test\n\n- [ ] checkbox\n", "utf8");

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.commands.executeCommand("vscode.openWith", document.uri, "mdlive.editor");

    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(activeTab, "A custom-editor tab should be active");
    assert.strictEqual(activeTab.input?.viewType, "mdlive.editor");
  });
});
