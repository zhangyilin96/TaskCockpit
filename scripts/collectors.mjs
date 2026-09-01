import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFileCallback);
const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  ".git", "node_modules", ".next", ".cache", ".tmp", "tmp", "coverage", ".idea", ".vscode", "__pycache__",
  ".expo", ".expo-shared", "dist", "dist-ios", "dist-android", "build"
]);
const MAX_PROJECTS = 50;
const MAX_PATHS_PER_PROJECT = 8;
const MAX_FILES_PER_ROOT = 10000;
const MAX_DEPTH = 14;
const MAX_TEST_REPORT_BYTES = 1024 * 1024;
const MAX_PROJECT_STATUS_BYTES = 256 * 1024;
const GOAL_INTENT_RECOVERY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const clean = value => String(value || "").trim();
const list = value => Array.isArray(value) ? value : [];
const timestampOf = value => {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const toPosix = value => String(value || "").replaceAll("\\", "/");

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizePayload(payload = {}) {
  const until = new Date(payload.until || Date.now()).toISOString();
  const fallbackSince = new Date(timestampOf(until) - 24 * 60 * 60 * 1000).toISOString();
  const since = new Date(payload.since || fallbackSince).toISOString();
  const projects = list(payload.projects).slice(0, MAX_PROJECTS).map(project => {
    const legacyPaths = [...new Set(list(project.sourcePaths).map(clean).filter(Boolean))].slice(0, MAX_PATHS_PER_PROJECT);
    const sources = (list(project.sources).length ? list(project.sources) : legacyPaths.map((sourcePath, index) => ({ id:`legacy-${stableHash(`${project.id}|${sourcePath}|${index}`)}`, path:sourcePath, aliases:[sourcePath] })))
      .slice(0, MAX_PATHS_PER_PROJECT)
      .map((source, index) => ({
        id: clean(source.id) || `source-${stableHash(`${project.id}|${source.path}|${index}`)}`,
        path: clean(source.path),
        aliases: [...new Set([source.path, ...list(source.aliases)].map(clean).filter(Boolean))],
        identity: source.identity && typeof source.identity === "object" ? source.identity : null
      }))
      .filter(source => source.path || source.aliases.length);
    return {
      id: clean(project.id),
      zoneId: clean(project.zoneId),
      name: clean(project.name),
      sourcePaths: legacyPaths,
      sources,
      routingKeywords: [...new Set(list(project.routingKeywords).map(clean).filter(Boolean))]
    };
  }).filter(project => project.id);
  return {
    since,
    until,
    projects,
    sourceCheckpoints: payload.sourceCheckpoints && typeof payload.sourceCheckpoints === "object" ? payload.sourceCheckpoints : {},
    fileIndexes: payload.fileIndexes && typeof payload.fileIndexes === "object" ? payload.fileIndexes : {}
  };
}

async function resolveDirectory(inputPath) {
  const resolved = await realpath(path.resolve(inputPath));
  const stats = await stat(resolved);
  if (!stats.isDirectory()) throw new Error("注册路径不是目录");
  return resolved;
}

function gitExecutable() {
  return clean(process.env.PROJECT_OS_GIT_PATH) || "git";
}

async function runGit(argumentsList, options = {}) {
  const result = await execFileAsync(gitExecutable(), argumentsList, {
    cwd: options.cwd,
    windowsHide: true,
    timeout: options.timeout || 15000,
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    encoding: "utf8"
  });
  return clean(result.stdout);
}

function safeRemoteIdentity(remoteValue) {
  const remote = clean(remoteValue);
  if (!remote) return "";
  try {
    const parsed = new URL(remote);
    parsed.username = "";
    parsed.password = "";
    return `${parsed.host}${parsed.pathname}`.replace(/\.git$/i, "").toLowerCase();
  } catch {
    return remote.replace(/^[^@\s]+@/, "").replace(/\.git$/i, "").toLowerCase();
  }
}

async function identifyRepository(repoPath, options = {}) {
  const rootCommit = clean((await runGit(["-C", repoPath, "rev-list", "--max-parents=0", "HEAD"], options).catch(() => "")).split(/\r?\n/)[0]);
  const remote = safeRemoteIdentity(await runGit(["-C", repoPath, "remote", "get-url", "origin"], options).catch(() => ""));
  const basis = `${remote || "local"}|${rootCommit || "no-root"}`;
  return { fingerprint: `git-${stableHash(basis)}`, rootCommit: rootCommit || null, remote: remote || null };
}

function parseGitLog(output) {
  return String(output || "").split("\x1e").map(record => record.trim()).filter(Boolean).map(record => {
    const [hash = "", committedAt = "", refs = "", ...messageParts] = record.split("\x1f");
    return { hash: clean(hash), committedAt: clean(committedAt), refs: clean(refs), message: clean(messageParts.join("\x1f")) };
  }).filter(commit => commit.hash);
}

function parseChangedFiles(output) {
  return String(output || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [statusValue = "M", ...pathParts] = line.split("\t");
    return { status: statusValue[0] || "M", path: toPosix(pathParts.at(-1) || "") };
  }).filter(item => item.path);
}

export async function collectGitForPath(registration, options = {}) {
  const rootPath = await resolveDirectory(registration.rootPath);
  let repoPath;
  try {
    repoPath = await runGit(["-C", rootPath, "rev-parse", "--show-toplevel"], options);
  } catch (error) {
    if (/not a git repository/i.test(`${error?.stderr || ""} ${error?.message || ""}`)) return { candidates: [], repoPath: null, skipped: "not-a-repository" };
    throw error;
  }
  const repositoryIdentity = await identifyRepository(repoPath, options);
  const branch = await runGit(["-C", repoPath, "branch", "--show-current"], options).catch(() => "");
  const logOutput = await runGit([
    "-C", repoPath, "log",
    `--since=${options.since}`,
    `--until=${options.until}`,
    "--date=iso-strict",
    "--pretty=format:%H%x1f%cI%x1f%D%x1f%B%x1e"
  ], options);
  const commits = parseGitLog(logOutput);
  const candidates = [];
  for (const commit of commits) {
    const changedOutput = await runGit(["-C", repoPath, "show", "--format=", "--name-status", "--no-renames", commit.hash], options);
    const changedFiles = parseChangedFiles(changedOutput);
    const shortHash = commit.hash.slice(0, 12);
    candidates.push({
      timestamp: commit.committedAt,
      sourceType: "git",
      sourceId: `git:${repositoryIdentity.fingerprint}:${commit.hash}`,
      eventType: "git_commit",
      rawSummary: commit.message.split(/\r?\n/)[0] || `commit ${shortHash}`,
      evidence: [{
        sourceType: "git",
        kind: "commit",
        locator: `${toPosix(repoPath)}#${commit.hash}`,
        summary: `commit ${shortHash}: ${commit.message.split(/\r?\n/)[0] || "无说明"}`,
        capturedAt: commit.committedAt,
        metadata: { commitHash: commit.hash, branch, changedFiles }
      }],
      metadata: {
        projectIdHint: registration.projectId,
        projectNameHint: registration.projectName,
        sourceBindingId: registration.sourceBindingId,
        repositoryIdentity,
        rootPath,
        repoPath,
        branch,
        commitHash: commit.hash,
        commitMessage: commit.message,
        refs: commit.refs,
        changedFiles
      }
    });
  }
  return { candidates, repoPath, repositoryIdentity, skipped: null };
}

function looksLikeTestReport(relativePath) {
  const normalized = toPosix(relativePath).toLowerCase();
  return /(?:^|\/)(?:test-results?|reports?|coverage)(?:\/|$)/.test(normalized)
    || /(?:junit|pytest|test-results?|tap|coverage).*(?:\.json|\.xml|\.log|\.txt)$/i.test(normalized);
}

function looksLikeProjectStatusDocument(relativePath) {
  const name = path.basename(String(relativePath || "")).toLowerCase();
  return /^(?:project[_-]?(?:status|state)|current[_-]?goal|status)\.md$/.test(name);
}

function workUnitForPath(relativePath) {
  const normalized = toPosix(relativePath).replace(/^\/+/, "").toLowerCase();
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) return "unknown";
  const filename = parts.at(-1).replace(/\.(test|spec)\b/i, "").replace(/\.[^.]+$/, "");
  if (parts.length === 1) return `root/${filename}`;
  if (["src", "app", "packages", "assets"].includes(parts[0]) && parts.length >= 3) return `${parts[0]}/${parts[1]}`;
  return `${parts[0]}/${filename}`;
}

export function extractProjectGoalIntent(content, projectName = "") {
  const source = String(content || "").slice(0, MAX_PROJECT_STATUS_BYTES);
  const exactPatterns = [
    /(?:当前目标|项目目标)\s*(?:改为|调整为|变更为|切换为|转为|[:：])\s*[*_`“"']*([^\n。；;]{3,180})/i,
    /(?:下一阶段(?:做|目标是|重点是)|接下来(?:重点是|主要做|目标是|集中做))\s*[:：]?\s*[*_`“"']*([^\n。；;]{3,180})/i,
    /(?:current\s+goal|next\s+phase|next\s+focus)\s*(?:is|to|becomes?|changes?\s+to|[:：])\s*[*_`“"']*([^\n.;]{3,180})/i
  ];
  for (const pattern of exactPatterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;
    const target = clean(match[1]).replace(/[*_`”"']+$/g, "").replace(/[。.!！?？]+$/, "");
    if (target) return { target, matchedText: clean(match[0]), reason: "explicit_goal_statement" };
  }
  const phase = source.match(/\b([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){0,3}\s+Phase)\b/)?.[1];
  if (!phase) return null;
  const prefix = clean(projectName) ? `${clean(projectName)} 的 ` : "";
  return {
    target: `推进 ${prefix}${phase}`,
    matchedText: phase,
    reason: "structured_status_phase"
  };
}

export function parseTestResult(content) {
  const text = String(content || "");
  const jsonPassed = text.match(/"(?:numPassedTests|passed)"\s*:\s*(\d+)/i);
  const jsonFailed = text.match(/"(?:numFailedTests|failed|failures)"\s*:\s*(\d+)/i);
  const tapPassed = text.match(/#\s*pass\s+(\d+)/i);
  const tapFailed = text.match(/#\s*fail\s+(\d+)/i);
  const xml = text.match(/tests=["'](\d+)["'][^>]*(?:failures=["'](\d+)["'])?[^>]*(?:errors=["'](\d+)["'])?/i);
  const prosePassed = [...text.matchAll(/(?:^|\s)(\d+)\s+(?:tests?\s+)?passed\b/gi)].at(-1);
  const proseFailed = [...text.matchAll(/(?:^|\s)(\d+)\s+(?:tests?\s+)?failed\b/gi)].at(-1);
  const passed = Number(jsonPassed?.[1] || tapPassed?.[1] || prosePassed?.[1] || 0);
  const failed = Number(jsonFailed?.[1] || tapFailed?.[1] || proseFailed?.[1] || 0);
  const xmlTotal = Number(xml?.[1] || 0);
  const xmlFailed = Number(xml?.[2] || 0) + Number(xml?.[3] || 0);
  const total = xmlTotal || passed + failed;
  const finalFailed = xmlTotal ? xmlFailed : failed;
  const finalPassed = xmlTotal ? Math.max(0, xmlTotal - xmlFailed) : passed;
  if (!total && !/\b(pass|fail|passed|failed|success)\b/i.test(text)) return null;
  const testStatus = finalFailed > 0 || /\b(failed|failure|error)\b/i.test(text) && !/0\s+(?:failed|failures|errors)/i.test(text) ? "failed" : "passed";
  return { testStatus, passed: finalPassed, failed: finalFailed, total: total || finalPassed + finalFailed };
}

async function walkFiles(rootPath) {
  const files = [];
  let visited = 0;
  let truncated = false;
  async function walk(directory, depth) {
    if (depth > MAX_DEPTH || truncated) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) break;
      if (entry.isDirectory() && DEFAULT_EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      visited += 1;
      if (visited > MAX_FILES_PER_ROOT) {
        truncated = true;
        break;
      }
      try {
        const fileStats = await stat(absolute);
        files.push({ absolute, relativePath: toPosix(path.relative(rootPath, absolute)), mtimeMs: fileStats.mtimeMs, size: fileStats.size });
      } catch {}
    }
  }
  await walk(rootPath, 0);
  return { files, truncated };
}

export async function collectFilesystemForPath(registration, options = {}) {
  const rootPath = await resolveDirectory(registration.rootPath);
  const sourceBindingId = clean(registration.sourceBindingId) || `legacy-${registration.projectId}-${stableHash(toPosix(rootPath).toLowerCase())}`;
  const indexKey = `${registration.projectId}:${sourceBindingId}`;
  const previousIndex = options.previousIndex && typeof options.previousIndex === "object" ? options.previousIndex : {};
  const hasPreviousIndex = Object.keys(previousIndex).length > 0;
  const { files, truncated } = await walkFiles(rootPath);
  const nextIndex = {};
  const candidates = [];
  const sinceMs = timestampOf(options.since);
  const untilMs = timestampOf(options.until);
  for (const file of files) {
    const previous = previousIndex[file.relativePath];
    const inCurrentWindow = file.mtimeMs > sinceMs && file.mtimeMs <= untilMs;
    let goalIntent = null;
    let goalIntentHash = "";
    if (looksLikeProjectStatusDocument(file.relativePath) && file.size <= MAX_PROJECT_STATUS_BYTES && file.mtimeMs <= untilMs) {
      try {
        goalIntent = extractProjectGoalIntent(await readFile(file.absolute, "utf8"), registration.projectName);
        if (goalIntent?.target) goalIntentHash = stableHash(`${goalIntent.target}|${goalIntent.matchedText}`);
      } catch {}
    }
    nextIndex[file.relativePath] = {
      mtimeMs: file.mtimeMs,
      size: file.size,
      ...(goalIntentHash ? { goalIntentHash } : {})
    };
    const canRecoverNewIntentField = Boolean(
      hasPreviousIndex
      && previous
      && !Object.prototype.hasOwnProperty.call(previous, "goalIntentHash")
      && file.mtimeMs >= untilMs - GOAL_INTENT_RECOVERY_WINDOW_MS
    );
    const goalIntentChanged = Boolean(
      goalIntent?.target
      && previous?.goalIntentHash !== goalIntentHash
      && (inCurrentWindow || canRecoverNewIntentField)
    );
    if (goalIntentChanged) {
      candidates.push({
        timestamp: new Date(file.mtimeMs).toISOString(),
        sourceType: "filesystem",
        sourceId: `goal-intent:${sourceBindingId}:${file.relativePath}:${goalIntentHash}`,
        eventType: "project_goal_intent",
        rawSummary: `当前目标改为：${goalIntent.target}`,
        evidence: [{
          sourceType: "filesystem",
          kind: "project_goal_intent",
          locator: toPosix(file.absolute),
          summary: `项目状态文档明确方向：${goalIntent.target}`,
          capturedAt: new Date(file.mtimeMs).toISOString(),
          metadata: { matchedText: goalIntent.matchedText, reason: goalIntent.reason }
        }],
        metadata: {
          projectIdHint: registration.projectId,
          projectNameHint: registration.projectName,
          sourceBindingId,
          workUnitKey: workUnitForPath(file.relativePath),
          rootPath,
          path: file.absolute,
          relativePath: file.relativePath,
          changedFiles: [file.relativePath],
          size: file.size,
          mtimeMs: file.mtimeMs,
          goalIntent: true,
          goalIntentTarget: goalIntent.target,
          goalIntentReason: goalIntent.reason,
          recoveredAfterCheckpoint: !inCurrentWindow
        }
      });
      continue;
    }
    if (!inCurrentWindow) continue;
    const existed = !hasPreviousIndex || Object.prototype.hasOwnProperty.call(previousIndex, file.relativePath);
    const baseMetadata = {
      projectIdHint: registration.projectId,
      projectNameHint: registration.projectName,
      sourceBindingId,
      workUnitKey: workUnitForPath(file.relativePath),
      rootPath,
      path: file.absolute,
      relativePath: file.relativePath,
      changedFiles: [file.relativePath],
      size: file.size,
      mtimeMs: file.mtimeMs
    };
    let testResult = null;
    if (looksLikeTestReport(file.relativePath) && file.size <= MAX_TEST_REPORT_BYTES) {
      try { testResult = parseTestResult(await readFile(file.absolute, "utf8")); } catch {}
    }
    if (testResult) {
      candidates.push({
        timestamp: new Date(file.mtimeMs).toISOString(),
        sourceType: "filesystem",
        sourceId: `test:${sourceBindingId}:${file.relativePath}:${Math.round(file.mtimeMs)}:${file.size}`,
        eventType: "test_result",
        rawSummary: testResult.testStatus === "passed" ? `测试报告通过：${file.relativePath}` : `测试报告存在失败：${file.relativePath}`,
        evidence: [{
          sourceType: "filesystem",
          kind: "test_report",
          locator: toPosix(file.absolute),
          summary: `${testResult.total || "?"} 项测试：${testResult.passed} 通过，${testResult.failed} 失败`,
          capturedAt: new Date(file.mtimeMs).toISOString(),
          metadata: testResult
        }],
        metadata: { ...baseMetadata, ...testResult }
      });
      continue;
    }
    const changeType = existed ? "file_modified" : "file_created";
    candidates.push({
      timestamp: new Date(file.mtimeMs).toISOString(),
      sourceType: "filesystem",
      sourceId: `fs:${sourceBindingId}:${file.relativePath}:${Math.round(file.mtimeMs)}:${file.size}`,
      eventType: changeType,
      rawSummary: `${existed ? "修改" : "新增"}文件：${file.relativePath}`,
      evidence: [{
        sourceType: "filesystem",
        kind: changeType,
        locator: toPosix(file.absolute),
        summary: `${existed ? "修改" : "新增"} ${file.relativePath}`,
        capturedAt: new Date(file.mtimeMs).toISOString(),
        metadata: { size: file.size, mtimeMs: file.mtimeMs }
      }],
      metadata: baseMetadata
    });
  }
  if (!truncated) {
    for (const [relativePath, previous] of Object.entries(previousIndex)) {
      if (Object.prototype.hasOwnProperty.call(nextIndex, relativePath)) continue;
      candidates.push({
        timestamp: options.until,
        sourceType: "filesystem",
        sourceId: `fs-delete:${sourceBindingId}:${relativePath}:${Math.round(previous.mtimeMs || 0)}:${previous.size || 0}`,
        eventType: "file_deleted",
        rawSummary: `删除文件：${relativePath}`,
        evidence: [{
          sourceType: "filesystem",
          kind: "file_deleted",
          locator: toPosix(path.join(rootPath, relativePath)),
          summary: `上次检查存在，本次已不存在：${relativePath}`,
          capturedAt: options.until,
          metadata: previous
        }],
        metadata: {
          projectIdHint: registration.projectId,
          projectNameHint: registration.projectName,
          sourceBindingId,
          workUnitKey: workUnitForPath(relativePath),
          rootPath,
          relativePath,
          changedFiles: [relativePath],
          previous
        }
      });
    }
  }
  return { candidates, indexKey, nextIndex, truncated };
}

function deduplicateCandidates(candidates) {
  const bySourceId = new Map();
  for (const candidate of candidates) {
    const existing = bySourceId.get(candidate.sourceId);
    if (!existing) {
      bySourceId.set(candidate.sourceId, candidate);
      continue;
    }
    if (existing.metadata?.projectIdHint !== candidate.metadata?.projectIdHint) {
      existing.metadata.projectIdHint = null;
      existing.metadata.routingConflict = true;
    }
  }
  return [...bySourceId.values()];
}

export async function collectWorkspaceActivities(payload, options = {}) {
  const input = normalizePayload(payload);
  const candidates = [];
  const fileIndexes = { ...input.fileIndexes };
  const registrations = [];
  const invalidPaths = [];
  const sourceReports = [];
  for (const project of input.projects) {
    for (const source of project.sources) {
      let resolvedPath = "";
      let recoveredFrom = "";
      let lastError = null;
      for (const candidatePath of [...new Set([source.path, ...source.aliases].filter(Boolean))]) {
        try {
          resolvedPath = await resolveDirectory(candidatePath);
          if (toPosix(candidatePath).toLowerCase() !== toPosix(source.path).toLowerCase()) recoveredFrom = candidatePath;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!resolvedPath) {
        const message = clean(lastError?.message) || "路径不可用";
        invalidPaths.push({ projectId: project.id, sourceBindingId: source.id, sourcePath: source.path, message });
        sourceReports.push({ projectId: project.id, sourceBindingId: source.id, configuredPath: source.path, resolvedPath: null, status: "missing", message });
        continue;
      }
      registrations.push({
        projectId: project.id,
        projectName: project.name,
        sourceBindingId: source.id,
        configuredPath: source.path,
        rootPath: resolvedPath,
        previousIdentity: source.identity
      });
      sourceReports.push({
        projectId: project.id,
        sourceBindingId: source.id,
        configuredPath: source.path,
        resolvedPath,
        identity: source.identity || { fingerprint:`directory-${source.id}`, kind:"directory" },
        status: "available",
        recoveryReason: recoveredFrom ? `配置路径不可用，已从历史别名 ${recoveredFrom} 恢复` : "",
        message: recoveredFrom ? "已通过历史路径映射恢复" : "目录可用"
      });
    }
  }

  const collectorStatuses = [];
  const gitSince = input.sourceCheckpoints.git || input.since;
  let gitDiscovered = 0;
  let gitFailures = 0;
  let gitConfigured = false;
  for (const registration of registrations) {
    gitConfigured = true;
    try {
      const result = await collectGitForPath(registration, { since: gitSince, until: input.until, ...options });
      candidates.push(...result.candidates);
      gitDiscovered += result.candidates.length;
      if (result.repositoryIdentity) {
        const report = sourceReports.find(item => item.sourceBindingId === registration.sourceBindingId);
        if (report) report.identity = { ...result.repositoryIdentity, kind:"git" };
      }
    } catch (error) {
      gitFailures += 1;
      options.onDiagnostic?.({ sourceType: "git", rootPath: registration.rootPath, message: clean(error.message) });
    }
  }
  collectorStatuses.push({
    sourceType: "git",
    status: gitFailures && gitFailures === registrations.length ? "failed" : "success",
    configured: gitConfigured,
    discovered: gitDiscovered,
    failedPaths: gitFailures,
    message: !gitConfigured ? "尚未注册项目目录" : gitFailures ? `${gitFailures} 个目录暂时无法读取 Git` : "Git 增量采集完成"
  });

  const filesystemSince = input.sourceCheckpoints.filesystem || input.since;
  let filesystemDiscovered = 0;
  let filesystemFailures = 0;
  let truncatedRoots = 0;
  for (const registration of registrations) {
    try {
      const indexKey = `${registration.projectId}:${registration.sourceBindingId}`;
      const legacyIndexKey = `${registration.projectId}:${stableHash(toPosix(registration.rootPath).toLowerCase())}`;
      const result = await collectFilesystemForPath(registration, {
        since: filesystemSince,
        until: input.until,
        previousIndex: input.fileIndexes[indexKey] || input.fileIndexes[legacyIndexKey]
      });
      candidates.push(...result.candidates);
      fileIndexes[result.indexKey] = result.nextIndex;
      filesystemDiscovered += result.candidates.length;
      if (result.truncated) truncatedRoots += 1;
    } catch (error) {
      filesystemFailures += 1;
      options.onDiagnostic?.({ sourceType: "filesystem", rootPath: registration.rootPath, message: clean(error.message) });
    }
  }
  collectorStatuses.push({
    sourceType: "filesystem",
    status: filesystemFailures && filesystemFailures === registrations.length ? "failed" : "success",
    configured: registrations.length > 0,
    discovered: filesystemDiscovered,
    failedPaths: filesystemFailures,
    truncatedRoots,
    message: !registrations.length ? "尚未注册项目目录" : truncatedRoots ? `${truncatedRoots} 个大目录达到扫描上限，已保留安全边界` : "本地文件增量采集完成"
  });
  collectorStatuses.push({
    sourceType: "codex",
    status: "unavailable",
    configured: false,
    discovered: 0,
    message: "当前没有可靠的 Codex Activity 接口；adapter 已预留，未写死到采集器"
  });
  collectorStatuses.push({
    sourceType: "project_os",
    status: "success",
    configured: true,
    discovered: 0,
    message: "Project OS 确认与人工状态由浏览器事件日志记录"
  });
  if (invalidPaths.length) {
    collectorStatuses.push({
      sourceType: "configuration",
      status: "failed",
      configured: true,
      discovered: 0,
      failedPaths: invalidPaths.length,
      message: `${invalidPaths.length} 个已注册目录不可用`,
      details: invalidPaths
    });
  }
  const deduplicated = deduplicateCandidates(candidates);
  return {
    since: input.since,
    until: input.until,
    candidates: deduplicated,
    collectorStatuses,
    sourceReports,
    fileIndexes,
    discoveredCount: candidates.length,
    sourceDuplicateCount: Math.max(0, candidates.length - deduplicated.length)
  };
}

export const CollectorLimits = Object.freeze({ MAX_PROJECTS, MAX_PATHS_PER_PROJECT, MAX_FILES_PER_ROOT, MAX_DEPTH });
