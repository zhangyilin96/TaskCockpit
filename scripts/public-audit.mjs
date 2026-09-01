import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const execFileAsync = promisify(execFile);

const { stdout } = await execFileAsync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding:"utf8", maxBuffer:8 * 1024 * 1024 });
for (const relative of stdout.split("\0").filter(Boolean)) {
  const normalized = relative.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.slice(0, -1).some(segment => blockedDirectories.has(segment))) problems.push(`${normalized}：不应提交的本地数据文件`);
  if (blockedFilePatterns.some(pattern => pattern.test(path.basename(normalized)))) problems.push(`${normalized}：不应提交的本地文件`);
  files.push({ absolute:path.join(root,relative), relative:normalized });
}

for (const file of files) {
  if (file.relative === selfPath || !textExtensions.has(path.extname(file.absolute).toLowerCase())) continue;
  let content;
  try {
    content = await readFile(file.absolute, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
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
