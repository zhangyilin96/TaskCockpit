const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "auto-sync.js"), "utf8");
const window = {};
vm.runInNewContext(source, { window, globalThis: window, Date, Math, JSON, Set, Map, Object, Array, String, Number, RegExp });
const AutoSync = window.ProjectOSAutoSync;

function makeState() {
  return {
    workspaceId: "normal",
    zones: [{
      id: "zone-product",
      name: "产品开发",
      summary: "原状态",
      updatedAt: "2026-08-28T08:00:00.000Z",
      projects: [{
        id: "project-studio",
        zoneId: "zone-product",
        name: "Character Studio",
        purpose: "角色一致性工具",
        goal: "完成 Beta 验证",
        currentState: "Beta 验证进行中",
        currentPhase: "VALIDATION",
        currentProgressSummary: "",
        completed: ["完成基础原型"],
        inProgress: [],
        nextActions: ["收集外部反馈"],
        openIssues: [],
        timeline: [],
        sourcePaths: ["D:\\Projects\\character-studio"],
        routingKeywords: ["installer", "beta"],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-28T08:00:00.000Z",
        lastWorkedAt: null
      }]
    }],
    settings: {},
    activityEvents: [],
    activityEvidence: [],
    syncRuns: [],
    routingRules: [],
    projectRelationshipRules: []
  };
}

function gitCandidate(message = "fix: repair one-click installer") {
  return {
    timestamp: "2026-08-29T00:10:00.000Z",
    sourceType: "git",
    sourceId: "git:d:/projects/character-studio:abc123",
    eventType: "git_commit",
    rawSummary: message,
    evidence: [{ sourceType: "git", kind: "commit", locator: "abc123", summary: `commit abc123: ${message}` }],
    metadata: {
      projectIdHint: "project-studio",
      rootPath: "D:\\Projects\\character-studio",
      repoPath: "D:\\Projects\\character-studio",
      commitHash: "abc123",
      commitMessage: message,
      changedFiles: [{ status: "M", path: "installer.ps1" }]
    }
  };
}

function goalTrendEvent(id, summary, overrides = {}) {
  return {
    id,
    timestamp: overrides.timestamp || "2026-08-29T01:00:00.000Z",
    detectedAt: overrides.detectedAt || "2026-08-29T01:01:00.000Z",
    sourceType: overrides.sourceType || "git",
    sourceId: overrides.sourceId || `git:trend:${id}`,
    projectId: "project-studio",
    eventType: overrides.eventType || "git_commit",
    rawSummary: summary,
    normalizedSummary: `代码提交：${summary}`,
    evidence: [],
    confidence: 0.99,
    status: overrides.status || "confirmed",
    confirmedAt: overrides.confirmedAt || "2026-08-29T01:02:00.000Z",
    metadata: { sourceTypes: [overrides.sourceType || "git"], effect: { type: "in_progress", value: `推进：${summary}` }, ...(overrides.metadata || {}) }
  };
}

function addVisualTrend(state) {
  state.activityEvents.push(
    goalTrendEvent("trend-1", "Meal Mode visual reconstruction scene", { timestamp: "2026-08-29T01:00:00.000Z" }),
    goalTrendEvent("trend-2", "Meal Mode visual reconstruction assets", { timestamp: "2026-08-29T02:00:00.000Z", status: "suggested" }),
    goalTrendEvent("trend-3", "Meal Mode visual reconstruction layout", { timestamp: "2026-08-29T03:00:00.000Z" })
  );
}

test("旧 Project 会迁移成一次可追溯 baseline，不重复创建", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T10:00:00.000Z" });
  assert.equal(state.activityEvents.length, 1);
  assert.equal(state.activityEvents[0].eventType, "project_state_baseline");
  assert.equal(state.activityEvents[0].status, "confirmed");
  assert.equal(state.activityEvidence.length, 1);
  assert.equal(state.activityEvents[0].metadata.snapshot.currentState, "Beta 验证进行中");
});

test("旧版单文件泛化摘要会无损升级为具体文件，并同步修正时间线显示", () => {
  const state = makeState();
  state.activityEvents.push({
    id: "legacy-file-event",
    projectId: "project-studio",
    eventType: "file_modified",
    sourceType: "filesystem",
    normalizedSummary: "更新 1 个文件",
    rawSummary: "修改文件：docs/architecture.md",
    status: "confirmed",
    metadata: { changedFiles: ["docs/architecture.md"], effect: { type: "timeline", value: "更新 1 个文件" } }
  });
  state.zones[0].projects[0].timeline.push({ eventId: "legacy-file-event", summary: "更新 1 个文件" });
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  assert.equal(state.activityEvents[0].normalizedSummary, "修改文件：docs/architecture.md");
  assert.equal(state.zones[0].projects[0].timeline[0].summary, "修改文件：docs/architecture.md");
});

test("Git、文件和测试证据聚合成一个事件，明确修复且测试通过才可进入 COMPLETED", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  const filesystem = {
    timestamp: "2026-08-29T00:12:00.000Z",
    sourceType: "filesystem",
    sourceId: "fs:installer",
    eventType: "file_modified",
    rawSummary: "修改文件：installer.ps1",
    evidence: [{ sourceType: "filesystem", kind: "file_modified", locator: "installer.ps1", summary: "修改 installer.ps1" }],
    metadata: { projectIdHint: "project-studio", rootPath: "D:\\Projects\\character-studio", relativePath: "installer.ps1", changedFiles: ["installer.ps1"] }
  };
  const tests = {
    timestamp: "2026-08-29T00:14:00.000Z",
    sourceType: "filesystem",
    sourceId: "test:report",
    eventType: "test_result",
    rawSummary: "测试报告通过",
    evidence: [{ sourceType: "filesystem", kind: "test_report", locator: "test-results.json", summary: "82 项测试：82 通过，0 失败" }],
    metadata: { projectIdHint: "project-studio", rootPath: "D:\\Projects\\character-studio", relativePath: "test-results.json", changedFiles: ["test-results.json"], testStatus: "passed", passed: 82, total: 82 }
  };
  const result = AutoSync.normalizeCollectedActivities([gitCandidate(), filesystem, tests], state, { detectedAt: "2026-08-29T00:20:00.000Z" });
  assert.equal(result.events.length, 1);
  assert.equal(result.deduplicatedCount, 2);
  assert.equal(result.events[0].evidence.length, 3);
  assert.equal(result.events[0].projectId, "project-studio");
  assert.equal(result.events[0].confidence, 0.99);
  assert.equal(result.events[0].metadata.effect.type, "completed");
  state.activityEvents.push(...result.events);
  state.activityEvidence.push(...result.evidence);
  AutoSync.applyReviewDecisions(state, [{ eventId: result.events[0].id, action: "confirm", projectId: "project-studio" }], { confirmedAt: "2026-08-29T00:25:00.000Z" });
  const project = state.zones[0].projects[0];
  assert.equal(project.completed.some(item => item.includes("repair one-click installer")), true);
  assert.equal(project.timeline.length, 1);
  assert.match(project.currentState, /最近确认/);
});

test("Git commit 单独只表示正在推进，不能直接判定任务完成", () => {
  const state = makeState();
  const result = AutoSync.normalizeCollectedActivities([gitCandidate("feat: add beta flow")], state, { detectedAt: "2026-08-29T00:20:00.000Z" });
  assert.equal(result.events[0].metadata.effect.type, "in_progress");
  assert.match(result.events[0].metadata.inference, /没有足够证据/);
  assert.equal(result.events[0].status, "suggested");
});

test("同批确认时语义事件不会被晚处理的纯删除文件事件覆盖当前状态", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  const git = AutoSync.normalizeCollectedActivities([gitCandidate("feat: build meaningful flow")], state, { detectedAt: "2026-08-29T00:20:00.000Z" });
  const deletion = AutoSync.normalizeCollectedActivities([{
    timestamp: "2026-08-29T00:30:00.000Z",
    sourceType: "filesystem",
    sourceId: "fs-delete:d:/projects/character-studio:dist/old.js:1:10",
    eventType: "file_deleted",
    rawSummary: "删除文件：dist/old.js",
    evidence: [{ sourceType: "filesystem", kind: "file_deleted", locator: "dist/old.js", summary: "删除 dist/old.js" }],
    metadata: { projectIdHint: "project-studio", rootPath: "D:\\Projects\\character-studio", relativePath: "dist/old.js", changedFiles: ["dist/old.js"] }
  }], state, { detectedAt: "2026-08-29T00:31:00.000Z" });
  state.activityEvents.push(...git.events, ...deletion.events);
  state.activityEvidence.push(...git.evidence, ...deletion.evidence);
  AutoSync.applyReviewDecisions(state, [...git.events, ...deletion.events].map(event => ({ eventId: event.id, action: "confirm", projectId: "project-studio" })), { confirmedAt: "2026-08-29T00:35:00.000Z" });
  assert.equal(state.zones[0].projects[0].currentState, "最近确认：代码提交：build meaningful flow");
  assert.equal(state.zones[0].projects[0].timeline.length, 2);
});

test("纯文件时间线不会把更有语义的已确认进度降级成文件计数", () => {
  const state = makeState();
  const git = AutoSync.normalizeCollectedActivities([gitCandidate("feat: build meaningful flow")], state, { detectedAt: "2026-08-29T00:20:00.000Z" });
  state.activityEvents.push(...git.events);
  state.activityEvidence.push(...git.evidence);
  AutoSync.applyReviewDecisions(state, git.events.map(event => ({ eventId: event.id, action: "confirm", projectId: "project-studio" })), { confirmedAt: "2026-08-29T00:25:00.000Z" });
  const file = AutoSync.normalizeCollectedActivities([{
    timestamp: "2026-08-29T01:00:00.000Z",
    sourceType: "filesystem",
    sourceId: "fs:d:/projects/character-studio:acceptance.md:2:20",
    eventType: "file_added",
    rawSummary: "新增文件：acceptance.md",
    evidence: [{ sourceType: "filesystem", kind: "file_added", locator: "acceptance.md", summary: "新增 acceptance.md" }],
    metadata: { projectIdHint: "project-studio", rootPath: "D:\\Projects\\character-studio", relativePath: "acceptance.md", changedFiles: ["acceptance.md"] }
  }], state, { detectedAt: "2026-08-29T01:01:00.000Z" });
  state.activityEvents.push(...file.events);
  state.activityEvidence.push(...file.evidence);
  AutoSync.applyReviewDecisions(state, file.events.map(event => ({ eventId: event.id, action: "confirm", projectId: "project-studio" })), { confirmedAt: "2026-08-29T01:05:00.000Z" });
  assert.equal(state.zones[0].projects[0].currentState, "最近确认：代码提交：build meaningful flow");
  assert.equal(state.zones[0].projects[0].timeline.some(item => item.summary === "新增文件：acceptance.md"), true);
});

test("项目根目录文件不会仅因同目录和时间接近而被粗暴聚合", () => {
  const state = makeState();
  const file = (name, minute) => ({
    timestamp: `2026-08-29T00:${minute}:00.000Z`,
    sourceType: "filesystem",
    sourceId: `fs:${name}`,
    eventType: "file_modified",
    rawSummary: `修改文件：${name}`,
    evidence: [{ sourceType: "filesystem", kind: "file_modified", locator: name, summary: `修改 ${name}` }],
    metadata: { projectIdHint: "project-studio", rootPath: "D:\\Projects\\character-studio", relativePath: name, changedFiles: [name] }
  });
  const result = AutoSync.normalizeCollectedActivities([file("app.js", "01"), file("styles.css", "05"), file("README.md", "12")], state, { detectedAt: "2026-08-29T00:20:00.000Z" });
  assert.equal(result.events.length, 3);
  assert.deepEqual([...result.events.map(event => event.normalizedSummary)].sort(), ["修改文件：README.md", "修改文件：app.js", "修改文件：styles.css"].sort());
});

test("同一同步周期按有意义目录拆成工作单元，不把整个项目压成一条", () => {
  const state = makeState();
  const file = (name, minute) => ({
    timestamp: `2026-08-29T00:${minute}:00.000Z`,
    sourceType: "filesystem",
    sourceId: `fs:${name}`,
    eventType: "file_modified",
    rawSummary: `修改文件：${name}`,
    evidence: [{ sourceType: "filesystem", kind: "file_modified", locator: name, summary: `修改 ${name}` }],
    metadata: { projectIdHint: "project-studio", rootPath: "D:\\Projects\\character-studio", relativePath: name, changedFiles: [name] }
  });
  const result = AutoSync.normalizeCollectedActivities([
    file("src/visual/assetManifest.ts", "01"),
    file("src/visual/VisualAsset.tsx", "03"),
    file("src/components/NibbiRoom.tsx", "05"),
    file("tests/visual-assets.test.ts", "07")
  ], state, { detectedAt: "2026-08-29T00:20:00.000Z" });
  assert.equal(result.events.length, 3);
  assert.equal(result.events.some(event => event.metadata.changedFiles.length === 2), true);
});

test("未确认事件不修改 Project；确认后投影，撤销后从 baseline 重算", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  const result = AutoSync.normalizeCollectedActivities([gitCandidate("feat: add beta flow")], state, { detectedAt: "2026-08-29T00:20:00.000Z" });
  state.activityEvents.push(...result.events);
  state.activityEvidence.push(...result.evidence);
  assert.deepEqual(state.zones[0].projects[0].inProgress, []);
  AutoSync.applyReviewDecisions(state, [{ eventId: result.events[0].id, action: "confirm", projectId: "project-studio" }], { confirmedAt: "2026-08-29T00:25:00.000Z" });
  assert.equal(state.zones[0].projects[0].inProgress.length, 1);
  assert.equal(AutoSync.reopenEventForReview(state, result.events[0].id, { reopenedAt: "2026-08-29T00:27:00.000Z" }), true);
  assert.equal(result.events[0].status, "suggested");
  assert.deepEqual(state.zones[0].projects[0].inProgress, []);
  AutoSync.applyReviewDecisions(state, [{ eventId: result.events[0].id, action: "confirm", projectId: "project-studio" }], { confirmedAt: "2026-08-29T00:28:00.000Z" });
  assert.equal(AutoSync.rejectEvent(state, result.events[0].id, { rejectedAt: "2026-08-29T00:30:00.000Z" }), true);
  assert.deepEqual(state.zones[0].projects[0].inProgress, []);
  assert.equal(state.zones[0].projects[0].currentState, "Beta 验证进行中");
});

test("用户修正是可追溯事件，撤销自动事件后不会回退用户修正", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  const auto = AutoSync.normalizeCollectedActivities([gitCandidate("feat: temporary auto state")], state, { detectedAt: "2026-08-29T00:20:00.000Z" });
  state.activityEvents.push(...auto.events);
  state.activityEvidence.push(...auto.evidence);
  AutoSync.applyReviewDecisions(state, [{ eventId: auto.events[0].id, action: "confirm", projectId: "project-studio" }], { confirmedAt: "2026-08-29T00:25:00.000Z" });
  const manual = AutoSync.recordProjectChange(state, "project-studio", {
    changedAt: "2026-08-29T00:30:00.000Z",
    summary: "用户纠正当前状态",
    reason: "自动记录把准备工作误判为正式推进",
    patch: { currentState: "等待用户访谈后再继续", nextActions: ["安排 3 位用户访谈"] }
  });
  AutoSync.reopenEventForReview(state, auto.events[0].id, { reopenedAt: "2026-08-29T00:35:00.000Z" });
  const project = state.zones[0].projects[0];
  assert.equal(project.currentState, "等待用户访谈后再继续");
  assert.deepEqual(project.nextActions, ["安排 3 位用户访谈"]);
  assert.equal(manual.metadata.changeReason, "自动记录把准备工作误判为正式推进");
  assert.equal(state.activityEvidence.some(item => item.eventId === manual.id && item.kind === "user_correction"), true);
});

test("移动单一监听目录时保留稳定来源标识和历史路径", () => {
  const state = makeState();
  const project = state.zones[0].projects[0];
  const original = AutoSync.ensureProjectSourceBindings(project)[0];
  const result = AutoSync.reconcileProjectSources(project, ["E:\\Moved\\character-studio"], "2026-08-29T02:00:00.000Z");
  assert.equal(result.moved.length, 1);
  assert.equal(project.sourceBindings[0].id, original.id);
  assert.equal(project.sourceBindings[0].canonicalPath, "E:\\Moved\\character-studio");
  assert.equal(project.sourceBindings[0].aliases.includes("D:\\Projects\\character-studio"), true);
  assert.equal(project.sourceBindings[0].aliases.includes("E:\\Moved\\character-studio"), true);
});

test("人工工作记录进入昨日时间线，并保留来源、归属、摘要和变更原因", () => {
  const state = makeState();
  const project = state.zones[0].projects[0];
  project.blockers = [{ id: "blocker-1", text: "等待真实用户反馈", status: "OPEN", priority: "HIGH", createdAt: "2026-08-30T10:00:00" }];
  const event = AutoSync.recordWorkLog(state, project.id, {
    sessionId: "session-1",
    summary: "完成访谈脚本并验证第一轮流程",
    completed: ["完成访谈脚本"],
    nextAction: "安排第一位用户访谈",
    currentState: "访谈准备完成",
    endedAt: "2026-08-30T12:00:00"
  }, { changedAt: "2026-08-30T12:05:00", reason: "用户结束并保存本次工作" });
  const brief = AutoSync.buildDailyBrief(state, "2026-08-31T12:00:00");
  assert.equal(event.sourceType, "manual");
  assert.equal(event.projectId, project.id);
  assert.equal(event.metadata.changeReason, "用户结束并保存本次工作");
  assert.equal(brief.yesterday[0].summary, "完成访谈脚本并验证第一轮流程");
  assert.equal(brief.todayActions[0].action, "安排第一位用户访谈");
  assert.equal(brief.blocked[0].text, "等待真实用户反馈");
});

test("部分 Collector 失败时只推进成功来源的 checkpoint", () => {
  const state = makeState();
  const run = AutoSync.createSyncRun(state, { since: "2026-08-28T00:00:00.000Z", until: "2026-08-29T00:00:00.000Z", startedAt: "2026-08-29T00:00:00.000Z" });
  AutoSync.finishSyncRun(state, run.id, {
    collectorStatuses: [
      { sourceType: "git", status: "failed", configured: true },
      { sourceType: "filesystem", status: "success", configured: true }
    ]
  }, { finishedAt: "2026-08-29T00:01:00.000Z" });
  assert.equal(state.settings.autoSync.lastSyncAt, "2026-08-29T00:00:00.000Z");
  assert.equal(state.settings.autoSync.collectorCheckpoints.git, undefined);
  assert.equal(state.settings.autoSync.collectorCheckpoints.filesystem, "2026-08-29T00:00:00.000Z");
});

test("先启动后注册目录时，新 Collector 仍从首次 24 小时窗口开始", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-29T00:00:00.000Z" });
  state.settings.autoSync.lastSyncAt = "2026-08-29T00:30:00.000Z";
  state.settings.autoSync.collectorCheckpoints = {};
  const request = AutoSync.collectorRequest(state, { until: "2026-08-29T01:00:00.000Z" });
  assert.equal(request.since, "2026-08-29T00:30:00.000Z");
  assert.equal(request.sourceCheckpoints.git, "2026-08-28T01:00:00.000Z");
  assert.equal(request.sourceCheckpoints.filesystem, "2026-08-28T01:00:00.000Z");
});

test("Goal Case 1：单个与当前目标不同的 commit 不产生目标建议", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  state.activityEvents.push(goalTrendEvent("single-drift", "Meal Mode visual reconstruction"));
  const suggestions = AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" });
  assert.equal(suggestions.length, 0);
  assert.equal(state.goalSuggestions.length, 0);
  assert.equal(state.zones[0].projects[0].goal, "完成 Beta 验证");
});

test("普通 Filesystem 修改即使数量很多也不触发 Goal Drift", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  state.activityEvents.push(...[1, 2, 3, 4].map(index => goalTrendEvent(`file-${index}`, `Meal Mode visual file ${index}`, {
    sourceType: "filesystem",
    eventType: "file_modified",
    timestamp: `2026-08-29T0${index}:00:00.000Z`
  })));
  assert.equal(AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" }).length, 0);
});

test("重复项目设置修改不构成 Goal Drift，并会关闭旧版误报建议", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  for (let index = 1; index <= 3; index += 1) {
    AutoSync.recordProjectChange(state, "project-studio", {
      changedAt: `2026-08-29T0${index}:00:00.000Z`,
      sourceId: `project-settings-${index}`,
      summary: "用户更新了项目设置与 Auto Sync 数据源",
      reason: "项目设置修改",
      patch: { routingKeywords: [`keyword-${index}`] }
    });
  }
  const settingsEvents = state.activityEvents.filter(event => event.metadata?.effect?.type === "manual_patch");
  state.goalSuggestions.push({
    id: "legacy-false-positive",
    projectId: "project-studio",
    oldGoal: "完成 Beta 验证",
    suggestedGoal: "集中推进：用户更新了项目设置与 Auto Sync 数据源",
    evidenceEventIds: settingsEvents.map(event => event.id),
    status: "pending"
  });
  assert.equal(AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" }).length, 0);
  assert.equal(state.goalSuggestions[0].status, "rejected");
  assert.match(state.goalSuggestions[0].rejectionReason, /非进度变更/);
});

test("明确用户意图只生成建议，仍不静默修改 CURRENT_GOAL", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  state.activityEvents.push(goalTrendEvent("explicit-intent", "当前目标改为：完成 Nibbi 美术重构", {
    sourceType: "project_os",
    eventType: "manual_note"
  }));
  const [suggestion] = AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" });
  assert.equal(suggestion.suggestedGoal, "完成 Nibbi 美术重构");
  assert.equal(suggestion.status, "pending");
  assert.equal(state.zones[0].projects[0].goal, "完成 Beta 验证");
});

test("结构化项目状态文档可作为明确目标意图，但普通文件仍不可触发", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  state.activityEvents.push(goalTrendEvent("status-intent", "当前目标改为：推进 Nibbi 的 Visual Reconstruction Phase", {
    sourceType: "filesystem",
    eventType: "project_goal_intent",
    metadata: { goalIntent: true }
  }));
  const [suggestion] = AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" });
  assert.equal(suggestion.suggestedGoal, "推进 Nibbi 的 Visual Reconstruction Phase");
  assert.equal(suggestion.status, "pending");
  assert.equal(state.zones[0].projects[0].goal, "完成 Beta 验证");
});

test("Goal Case 2：连续多个 Event 指向新方向时只产生 pending 建议，不修改 CURRENT_GOAL", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  addVisualTrend(state);
  const suggestions = AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].status, "pending");
  assert.equal(suggestions[0].evidenceEventIds.join(","), "trend-1,trend-2,trend-3");
  assert.equal(state.zones[0].projects[0].goal, "完成 Beta 验证");
});

test("Goal Case 3：用户接受后更新 CURRENT_GOAL，并写入带 Evidence 的 Timeline", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  addVisualTrend(state);
  const [suggestion] = AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" });
  AutoSync.recalculateProjectState(state, "project-studio");
  const stateBeforeGoalAcceptance = state.zones[0].projects[0].currentState;
  const event = AutoSync.acceptGoalSuggestion(state, suggestion.id, {
    goal: "重构 Nibbi Meal Mode 视觉体系",
    edited: true,
    acceptedAt: "2026-08-30T00:05:00.000Z"
  });
  const project = state.zones[0].projects[0];
  assert.equal(project.goal, "重构 Nibbi Meal Mode 视觉体系");
  assert.equal(suggestion.status, "accepted");
  assert.equal(event.eventType, "goal_change");
  assert.equal(event.status, "confirmed");
  assert.match(project.timeline[0].summary, /项目目标由/);
  assert.equal(event.metadata.sourceEventIds.length, 3);
  assert.equal(project.currentState, stateBeforeGoalAcceptance);
});

test("Goal Case 4：拒绝后保持当前目标，相同 Evidence 再同步不重复生成", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  addVisualTrend(state);
  const [suggestion] = AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" });
  AutoSync.setGoalSuggestionStatus(state, suggestion.id, AutoSync.GOAL_SUGGESTION_STATUS.REJECTED, { reviewedAt: "2026-08-30T00:05:00.000Z" });
  const repeated = AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:10:00.000Z" });
  assert.equal(state.zones[0].projects[0].goal, "完成 Beta 验证");
  assert.equal(suggestion.status, "rejected");
  assert.equal(repeated.length, 0);
  assert.equal(state.goalSuggestions.length, 1);
});

test("Goal Case 5：Undo 目标修改后恢复旧 CURRENT_GOAL，并记录恢复事件", () => {
  const state = makeState();
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: "2026-08-28T09:00:00.000Z" });
  addVisualTrend(state);
  const [suggestion] = AutoSync.detectGoalDriftSuggestions(state, { createdAt: "2026-08-30T00:00:00.000Z" });
  const accepted = AutoSync.acceptGoalSuggestion(state, suggestion.id, { goal: "重构 Nibbi Meal Mode 视觉体系", acceptedAt: "2026-08-30T00:05:00.000Z" });
  assert.equal(AutoSync.rejectEvent(state, accepted.id, { rejectedAt: "2026-08-30T00:10:00.000Z" }), true);
  const undo = state.activityEvents.find(event => event.id === suggestion.undoEventId);
  const project = state.zones[0].projects[0];
  assert.equal(project.goal, "完成 Beta 验证");
  assert.equal(accepted.status, "rejected");
  assert.equal(suggestion.status, "rejected");
  assert.equal(undo.eventType, "goal_change_undo");
  assert.match(project.timeline[0].summary, /恢复为/);
});
