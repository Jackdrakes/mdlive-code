const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  await runTests({
    extensionDevelopmentPath: path.resolve(__dirname, ".."),
    extensionTestsPath: path.resolve(__dirname, "suite"),
    launchArgs: ["--disable-workspace-trust"],
  });
}

main().catch((error) => {
  console.error("Extension integration tests failed:", error);
  process.exit(1);
});
