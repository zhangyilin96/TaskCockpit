const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { gzipSync } = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitUntilReady(port, child) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`测试服务提前退出：${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auto-sync/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error("等待本地测试服务超时");
}

function largeCollectorPayload() {
  const index = {};
  for (let i = 0; i < 55000; i += 1) {
    index[`src/module-${String(i).padStart(5, "0")}/snapshot-${i}.json`] = { mtimeMs: 1787980000000 + i, size: 100 + i };
  }
  return {
    since: "2026-08-28T18:34:00.000Z",
    until: "2026-08-29T09:10:00.000Z",
    sourceCheckpoints: { git: "2026-08-28T18:34:00.000Z", filesystem: "2026-08-28T18:34:00.000Z" },
    fileIndexes: { "project-large:D:/Projects/large": index },
    projects: []
  };
}

test("超过旧 2MB 上限的完整 fileIndexes 可通过 gzip 发送并保留", async () => {
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(appSource, /new CompressionStream\("gzip"\)/);
  assert.match(appSource, /"Content-Encoding":"gzip"/);

  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(root, "scripts", "serve.mjs"), `--port=${port}`], {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitUntilReady(port, child);
    const payload = largeCollectorPayload();
    const raw = Buffer.from(JSON.stringify(payload));
    assert.ok(raw.length > 2 * 1024 * 1024, `fixture 应超过旧上限，实际 ${raw.length}`);
    const compressed = gzipSync(raw);
    assert.ok(compressed.length < 4 * 1024 * 1024, `压缩请求应处于安全上线内，实际 ${compressed.length}`);

    const response = await fetch(`http://127.0.0.1:${port}/api/auto-sync/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
      body: compressed
    });
    const result = await response.json();
    assert.equal(response.status, 200, result.error);
    assert.equal(Object.keys(result.fileIndexes["project-large:D:/Projects/large"]).length, 55000);
    assert.equal(result.collectorStatuses.some(item => item.status === "failed"), false);
  } finally {
    child.kill();
    await new Promise(resolve => child.once("exit", resolve)).catch(() => {});
  }
});
