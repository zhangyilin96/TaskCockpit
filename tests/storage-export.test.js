const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "storage.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "lifecycle.js"), "utf8"));

function fixture() {
  return {
    zones: [{
      id: "zone-1",
      projects: [{
        id: "project-1",
        sessions: [
          { id: "formal-1", isDemo: false },
          { id: "demo-1", isDemo: true, generatedPrompts: [{ id: "prompt-1" }], importedResults: [{ id: "result-1" }] },
          { id: "deleted-1", isDemo: false, deletedAt: "2026-08-25T00:00:00.000Z" }
        ]
      }]
    }],
    inspirations: [{ id: "idea-1", text: "独立灵感", source: "dashboard" }],
    skills: [{ id: "skill-1" }],
    zoneLinks: [{ id: "link-1" }]
  };
}

test("正式备份默认排除演示和已删除 Session", async () => {
  const adapter = new window.ProjectOSStorage.MemoryStorageAdapter();
  const backup = await adapter.exportBackup(fixture());
  assert.equal(backup.schemaVersion, 2);
  assert.ok(backup.exportedAt);
  assert.deepEqual(backup.workspace.zones[0].projects[0].sessions.map(item => item.id), ["formal-1"]);
  assert.equal(backup.workspace.skills.length, 1);
  assert.equal(backup.workspace.zoneLinks.length, 1);
  assert.equal(backup.workspace.inspirations[0].text, "独立灵感");
});

test("勾选后附加独立演示工作区，正式工作区仍排除旧版演示记录", async () => {
  const adapter = new window.ProjectOSStorage.MemoryStorageAdapter();
  const demo = { zones: [{ id: "demo-zone", projects: [{ id: "demo-project", sessions: [{ id: "demo-session" }] }] }] };
  const backup = await adapter.exportBackup(fixture(), { includeDemo: true, demoWorkspace: demo });
  assert.deepEqual(backup.workspace.zones[0].projects[0].sessions.map(item => item.id), ["formal-1"]);
  assert.equal(backup.demoWorkspace.zones[0].id, "demo-zone");
});

test("导出、序列化、导入和恢复接口可以组成完整本地备份链路", async () => {
  const adapter = new window.ProjectOSStorage.MemoryStorageAdapter();
  const exported = await adapter.exportState(fixture());
  const serialized = adapter.serializeState(exported);
  const hydrated = adapter.hydrateState(serialized);
  const imported = await adapter.importState(serialized);
  assert.equal(hydrated.zones[0].id, "zone-1");
  assert.deepEqual(imported, hydrated);
});

test("云端适配器是禁用占位，不会替代当前本地存储", async () => {
  const adapter = new window.ProjectOSStorage.CloudAdapterStub();
  assert.equal((await adapter.getStatus()).status, "cloud-disabled");
  assert.equal((await adapter.saveWorkspace(fixture())).saved, false);
});

test("normal 与 demo 工作区使用独立命名空间", async () => {
  const adapter = new window.ProjectOSStorage.MemoryStorageAdapter();
  await adapter.saveWorkspace({ marker: "formal", zones: [] }, "normal");
  await adapter.saveWorkspace({ marker: "demo", zones: [] }, "demo");
  assert.equal((await adapter.loadWorkspace("normal")).marker, "formal");
  assert.equal((await adapter.loadWorkspace("demo")).marker, "demo");
});

test("独立演示状态导出不会伪装成正式备份", () => {
  const adapter = new window.ProjectOSStorage.MemoryStorageAdapter();
  const backup = adapter.exportDemoState({ zones: [] });
  assert.equal(backup.workspaceMode, "demo");
  assert.equal(backup.demoWorkspace, undefined);
});

function emptyProject(overrides = {}) {
  return {
    id: "project-1", name: "空项目", keepWhenEmpty: false, sessions: [], projectMemory: [], assets: [], completed: [],
    backlog: [], parkingLot: [], openIssues: [], decisions: [], constraints: [], inProgress: [], nextActions: [],
    currentState: "刚刚建立，尚未开始第一轮工作。", ...overrides
  };
}

test("删除最后一条内容后只有真正空壳项目才进入 Orphan 判断", () => {
  assert.equal(window.ProjectOSLifecycle.isOrphanProject(emptyProject()), true);
  assert.equal(window.ProjectOSLifecycle.isOrphanProject(emptyProject({ keepWhenEmpty: true })), false);
  assert.equal(window.ProjectOSLifecycle.isOrphanProject(emptyProject({ projectMemory: [{ text: "用户确认的重要记忆", source: "manual" }] })), false);
  assert.equal(window.ProjectOSLifecycle.isOrphanProject(emptyProject({ projectMemory: [{ text: "初始化", source: "system" }] })), true);
});

test("移除项目时仅删除实时引用，正式确认事件保留并标记来源已移除", () => {
  const project = { id: "project-1", name: "示例文字识别工具" };
  const events = [
    { id: "live", sourceProjectId: "project-1", status: "live" },
    { id: "confirmed", sourceProjectId: "project-1", confirmedAt: "2026-08-25T00:00:00.000Z" },
    { id: "other", sourceProjectId: "project-2" }
  ];
  const result = window.ProjectOSLifecycle.reconcileContextEvents(events, project);
  assert.deepEqual(result.map(item => item.id), ["confirmed", "other"]);
  assert.equal(result[0].sourceStatus, "来源项目已移除");
  assert.equal(result[0].sourceProjectId, null);
});
