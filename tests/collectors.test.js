const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");

async function collectors() {
  return import(pathToFileURL(path.join(__dirname, "..", "scripts", "collectors.mjs")).href);
}

test("测试报告解析区分通过和失败", async () => {
  const { parseTestResult } = await collectors();
  assert.deepEqual(parseTestResult("# tests 82\n# pass 82\n# fail 0"), { testStatus: "passed", passed: 82, failed: 0, total: 82 });
  assert.deepEqual(parseTestResult('{"numPassedTests":80,"numFailedTests":2}'), { testStatus: "failed", passed: 80, failed: 2, total: 82 });
});

test("Filesystem Collector 只返回 checkpoint 之后的增量并生成下一版索引", async () => {
  const { collectFilesystemForPath } = await collectors();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-os-collector-"));
  try {
    const reportDirectory = path.join(root, "test-results");
    await fs.mkdir(reportDirectory);
    await fs.writeFile(path.join(root, "installer.ps1"), "Write-Output ok", "utf8");
    await fs.writeFile(path.join(reportDirectory, "results.txt"), "82 tests passed", "utf8");
    const result = await collectFilesystemForPath({ projectId: "project-1", projectName: "Demo", rootPath: root }, {
      since: new Date(Date.now() - 60_000).toISOString(),
      until: new Date(Date.now() + 60_000).toISOString(),
      previousIndex: {}
    });
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates.some(item => item.eventType === "test_result" && item.metadata.testStatus === "passed"), true);
    assert.equal(Object.keys(result.nextIndex).length, 2);
    assert.equal(result.truncated, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("项目状态文档中的明确 Phase 会生成一次可追溯目标意图，checkpoint 后补读也不重复", async () => {
  const { collectFilesystemForPath, extractProjectGoalIntent } = await collectors();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-os-goal-intent-"));
  try {
    const statusPath = path.join(root, "PROJECT_STATUS.md");
    await fs.writeFile(statusPath, "# Nibbi\n\n> 当前结论：Visual Reconstruction Phase 已启动，等待正式资产集成。\n", "utf8");
    const fileStats = await fs.stat(statusPath);
    assert.equal(extractProjectGoalIntent(await fs.readFile(statusPath, "utf8"), "Nibbi").target, "推进 Nibbi 的 Visual Reconstruction Phase");
    const previousIndex = { "PROJECT_STATUS.md": { mtimeMs: fileStats.mtimeMs, size: fileStats.size } };
    const first = await collectFilesystemForPath({ projectId: "project-nibbi", projectName: "Nibbi", rootPath: root }, {
      since: new Date(fileStats.mtimeMs + 10_000).toISOString(),
      until: new Date(fileStats.mtimeMs + 60_000).toISOString(),
      previousIndex
    });
    assert.equal(first.candidates.length, 1);
    assert.equal(first.candidates[0].eventType, "project_goal_intent");
    assert.equal(first.candidates[0].metadata.recoveredAfterCheckpoint, true);
    const second = await collectFilesystemForPath({ projectId: "project-nibbi", projectName: "Nibbi", rootPath: root }, {
      since: new Date(fileStats.mtimeMs + 60_000).toISOString(),
      until: new Date(fileStats.mtimeMs + 120_000).toISOString(),
      previousIndex: first.nextIndex
    });
    assert.equal(second.candidates.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("同一 Git 仓库移动目录后保持相同来源标识，不因绝对路径重复创建活动", async () => {
  const { collectGitForPath } = await collectors();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "project-os-git-move-"));
  const original = path.join(parent, "before");
  const moved = path.join(parent, "after");
  try {
    await fs.mkdir(original);
    execFileSync("git", ["init"], { cwd: original, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "project-os-test@example.invalid"], { cwd: original });
    execFileSync("git", ["config", "user.name", "Project OS Test"], { cwd: original });
    await fs.writeFile(path.join(original, "progress.md"), "first verified step", "utf8");
    execFileSync("git", ["add", "progress.md"], { cwd: original });
    execFileSync("git", ["commit", "-m", "feat: record verified step"], { cwd: original, stdio: "ignore" });
    const window = { since: new Date(Date.now() - 86_400_000).toISOString(), until: new Date(Date.now() + 60_000).toISOString() };
    const before = await collectGitForPath({ projectId: "project-1", projectName: "Demo", sourceBindingId: "source-stable", rootPath: original }, window);
    await fs.rename(original, moved);
    const after = await collectGitForPath({ projectId: "project-1", projectName: "Demo", sourceBindingId: "source-stable", rootPath: moved }, window);
    assert.equal(before.repositoryIdentity.fingerprint, after.repositoryIdentity.fingerprint);
    assert.equal(before.candidates[0].sourceId, after.candidates[0].sourceId);
    assert.notEqual(before.candidates[0].metadata.repoPath, after.candidates[0].metadata.repoPath);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("配置路径失效时可从历史别名恢复，并按稳定 binding 隔离多目录索引", async () => {
  const { collectWorkspaceActivities } = await collectors();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "project-os-alias-"));
  const first = path.join(parent, "first");
  const second = path.join(parent, "second");
  try {
    await fs.mkdir(first);
    await fs.mkdir(second);
    await fs.writeFile(path.join(first, "progress.md"), "first", "utf8");
    await fs.writeFile(path.join(second, "progress.md"), "second", "utf8");
    const result = await collectWorkspaceActivities({
      since: new Date(Date.now() - 60_000).toISOString(),
      until: new Date(Date.now() + 60_000).toISOString(),
      projects: [{
        id: "project-1",
        name: "Demo",
        sources: [
          { id: "source-first", path: path.join(parent, "missing-first"), aliases: [first] },
          { id: "source-second", path: second, aliases: [second] }
        ]
      }]
    });
    const recovered = result.sourceReports.find(item => item.sourceBindingId === "source-first");
    assert.equal(recovered.status, "available");
    assert.match(recovered.recoveryReason, /历史别名/);
    assert.equal(result.candidates.filter(item => item.sourceType === "filesystem").length, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(result.fileIndexes, "project-1:source-first"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(result.fileIndexes, "project-1:source-second"), true);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
