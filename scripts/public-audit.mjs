import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", "coverage", ".cache", ".tmp", "tmp"]);
const textExtensions = new Set([".cmd", ".css", ".html", ".js", ".json", ".md", ".mjs", ".txt"]);
const selfPath = "scripts/public-audit.mjs";
const blockedDirectories = new Set(["backup", "backups", "private", "local-data", "demo-recordings"]);
const blockedFilePatterns = [/^\.env(?:\..+)?$/i, /\.log$/i, /\.local$/i, /\.(?:db|sqlite|sqlite3|indexeddb)$/i];
const contentRules = [
  { label: "Windows 用户绝对路径", pattern: /[a-z]:[\\/]users[\\/][^\\/\s"']+/i },
  { label: "疑似密钥赋值", pattern: /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["'][^"']{8,}["']/i }
];

const files = [];
const problems = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (blockedDirectories.has(entry.name)) problems.push(`${relative}/：不应提交的本地数据目录`);
      await walk(absolute);
      continue;
    }
    if (blockedFilePatterns.some(pattern => pattern.test(entry.name))) problems.push(`${relative}：不应提交的本地文件`);
    files.push({ absolute, relative });
  }
}

await walk(root);

for (const file of files) {
  if (file.relative === selfPath || !textExtensions.has(path.extname(file.absolute).toLowerCase())) continue;
  const content = await readFile(file.absolute, "utf8");
  for (const rule of contentRules) {
    if (rule.pattern.test(content)) problems.push(`${file.relative}：${rule.label}`);
  }
}

if (problems.length) {
  console.error("公开发布检查未通过：");
  problems.forEach(problem => console.error(`- ${problem}`));
  process.exit(1);
}

console.log(`公开发布检查通过：已扫描 ${files.length} 个文件，未发现本地数据库、绝对用户路径或疑似密钥。`);
