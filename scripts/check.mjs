import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const syntaxChecks = [
  ["--check", "app.js"],
  ["--check", "storage.js"],
  ["--check", "lifecycle.js"],
  ["--check", "planning.js"],
  ["--check", "bootstrap.js"],
  ["--check", "ai-workflow.js"],
  ["--check", "auto-sync.js"],
  ["--check", "scripts/collectors.mjs"],
  ["--check", "scripts/serve.mjs"]
];

const testFiles = readdirSync("tests")
  .filter(file => file.endsWith(".test.js"))
  .map(file => `tests/${file}`);

for (const args of [...syntaxChecks, ["--test", ...testFiles]]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("代码语法与自动化测试均已通过。");
