const path = require("path");
const Mocha = require("mocha");

function run() {
  const mocha = new Mocha({ ui: "tdd", timeout: 30000, color: true });
  mocha.addFile(path.resolve(__dirname, "extension.test.js"));
  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) reject(new Error(`${failures} integration test(s) failed.`));
      else resolve();
    });
  });
}

module.exports = { run };
