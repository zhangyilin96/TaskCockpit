import { createServer } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.error("当前版本仅支持 Windows 10 / Windows 11。macOS / Linux 暂未适配，也未完成测试。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = ["index.html", "styles.css", "app.js", "storage.js", "lifecycle.js", "planning.js", "bootstrap.js", "ai-workflow.js"];

async function verifyProjectFiles() {
  for (const relativePath of requiredFiles) {
    await access(path.join(projectRoot, relativePath), constants.R_OK);
  }
}

await verifyProjectFiles();

if (process.argv.includes("--check")) {
  console.log("启动检查通过：Windows 环境与应用文件均已就绪。");
  process.exit(0);
}

const portArgument = process.argv.find(argument => argument.startsWith("--port="));
const port = Number(portArgument?.split("=")[1] || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("端口无效，请使用 --port=4173 这样的格式。");
  process.exit(1);
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

const server = createServer(async (request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const resolved = path.resolve(projectRoot, requested);
    const relative = path.relative(projectRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const fileStats = await stat(resolved);
    if (!fileStats.isFile()) throw new Error("not-file");
    const body = await readFile(resolved);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(resolved).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。请关闭旧的 Project OS 服务后重试。`);
  } else {
    console.error("本地服务启动失败：", error.message);
  }
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`项目存档驾驶舱已启动：http://127.0.0.1:${port}`);
  console.log("关闭此窗口即可停止本地服务。");
});
