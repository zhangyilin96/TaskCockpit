import { createServer } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { collectWorkspaceActivities } from "./collectors.mjs";

if (process.platform !== "win32") {
  console.error("当前版本仅支持 Windows 10 / Windows 11。macOS / Linux 暂未适配，也未完成测试。");
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = ["index.html", "styles.css", "app.js", "storage.js", "lifecycle.js", "planning.js", "bootstrap.js", "ai-workflow.js", "auto-sync.js"];

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

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

const MAX_WIRE_BODY_BYTES = 4 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 32 * 1024 * 1024;

async function readJsonBody(request, maxWireBytes = MAX_WIRE_BODY_BYTES, maxJsonBytes = MAX_JSON_BODY_BYTES) {
  const encoding = String(request.headers["content-encoding"] || "identity").trim().toLowerCase();
  if (!["identity", "gzip"].includes(encoding)) throw new Error(`不支持的请求压缩格式：${encoding}`);
  const wireLimit = encoding === "gzip" ? maxWireBytes : maxJsonBytes;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > wireLimit) throw new Error(encoding === "gzip" ? "压缩后的同步请求仍超过本地采集上限" : "同步请求超过本地采集上限");
    chunks.push(chunk);
  }
  const wireBody = Buffer.concat(chunks);
  let decoded = wireBody;
  if (encoding === "gzip") {
    try {
      decoded = gunzipSync(wireBody, { maxOutputLength: maxJsonBytes });
    } catch (error) {
      if (error?.code === "ERR_BUFFER_TOO_LARGE" || /larger than|output length/i.test(error?.message || "")) throw new Error("同步请求解压后超过本地采集上限");
      throw new Error("无法解压本地同步请求");
    }
  }
  if (decoded.length > maxJsonBytes) throw new Error("同步请求解压后超过本地采集上限");
  const raw = decoded.toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function acceptsLocalOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }

  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  if (pathname === "/api/auto-sync/health" && request.method === "GET") {
    sendJson(response, 200, { status: "ready", collectors: ["git", "filesystem", "project_os"], codex: "adapter-unavailable" });
    return;
  }

  if (pathname === "/api/auto-sync/collect" && request.method === "POST") {
    if (!acceptsLocalOrigin(request)) {
      sendJson(response, 403, { error: "只接受 Project OS 本机页面发起的采集请求" });
      return;
    }
    try {
      const payload = await readJsonBody(request);
      const result = await collectWorkspaceActivities(payload);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { error: error?.message || "本地采集请求失败" });
    }
    return;
  }

  if (!["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }

  try {
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
