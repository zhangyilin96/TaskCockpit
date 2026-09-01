import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { collectFilesystemForPath } from "./collectors.mjs";

const projectRoot = process.env.PROJECT_OS_GOAL_E2E_PATH || "D:\\Dev\\Nibbi";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const autoSyncSource = await readFile(path.join(root, "auto-sync.js"), "utf8");
const browserWindow = {};
vm.runInNewContext(autoSyncSource, { window: browserWindow, globalThis: browserWindow, Date, Math, JSON, Set, Map, Object, Array, String, Number, RegExp });
const AutoSync = browserWindow.ProjectOSAutoSync;
const statusPath = path.join(projectRoot, "PROJECT_STATUS.md");
const statusStats = await stat(statusPath);
const oldGoal = "完成 V0.1 历史编辑、连续模拟时钟和 iPhone Haptic 的真机验收；在收到真机反馈前不进入 V0.2。";
const projectId = "project-nibbi-e2e";
const previousIndex = { "PROJECT_STATUS.md": { mtimeMs: statusStats.mtimeMs, size: statusStats.size } };
const first = await collectFilesystemForPath({ projectId, projectName: "饭点啦 / Nibbi V0.1", rootPath: projectRoot }, {
  since: new Date(statusStats.mtimeMs + 10_000).toISOString(),
  until: new Date(statusStats.mtimeMs + 60_000).toISOString(),
  previousIndex
});
assert.equal(first.candidates.filter(candidate => candidate.eventType === "project_goal_intent").length, 1);

const state = {
  workspaceId: "normal",
  zones: [{
    id: "zone-nibbi",
    name: "Nibbi",
    summary: "V0.1 验收中",
    updatedAt: new Date(statusStats.mtimeMs - 60_000).toISOString(),
    projects: [{
      id: projectId,
      zoneId: "zone-nibbi",
      name: "饭点啦 / Nibbi V0.1",
      goal: oldGoal,
      currentState: "V0.1 真机验收中",
      currentPhase: "VALIDATION",
      currentProgressSummary: "",
      completed: [],
      inProgress: [],
      nextActions: [],
      openIssues: [],
      timeline: [],
      sourcePaths: [projectRoot],
      routingKeywords: ["Nibbi", "Meal Mode"]
    }]
  }],
  settings: { autoSync: { firstSyncLookbackHours: 24, collectorCheckpoints: {}, fileIndexes: {} } }
};
AutoSync.ensureState(state, { createBaselines: true, detectedAt: new Date(statusStats.mtimeMs - 60_000).toISOString() });
const normalized = AutoSync.normalizeCollectedActivities(first.candidates, state, { detectedAt: new Date(statusStats.mtimeMs + 60_000).toISOString() });
state.activityEvents.push(...normalized.events);
state.activityEvidence.push(...normalized.evidence);
const [suggestion] = AutoSync.detectGoalDriftSuggestions(state, { createdAt: new Date(statusStats.mtimeMs + 120_000).toISOString() });
assert.ok(suggestion);
assert.equal(suggestion.status, "pending");
assert.equal(state.zones[0].projects[0].goal, oldGoal);
const accepted = AutoSync.acceptGoalSuggestion(state, suggestion.id, { acceptedAt: new Date(statusStats.mtimeMs + 180_000).toISOString() });
assert.equal(state.zones[0].projects[0].goal, suggestion.suggestedGoal);
assert.equal(AutoSync.rejectEvent(state, accepted.id, { rejectedAt: new Date(statusStats.mtimeMs + 240_000).toISOString() }), true);
assert.equal(state.zones[0].projects[0].goal, oldGoal);

const second = await collectFilesystemForPath({ projectId, projectName: "饭点啦 / Nibbi V0.1", rootPath: projectRoot }, {
  since: new Date(statusStats.mtimeMs + 60_000).toISOString(),
  until: new Date(statusStats.mtimeMs + 300_000).toISOString(),
  previousIndex: first.nextIndex
});
assert.equal(second.candidates.length, 0);

console.log(JSON.stringify({
  result: "passed",
  projectRoot,
  detectedEvent: normalized.events[0].normalizedSummary,
  suggestedGoal: suggestion.suggestedGoal,
  currentGoalBeforeAcceptance: oldGoal,
  acceptedGoal: suggestion.suggestedGoal,
  goalAfterUndo: state.zones[0].projects[0].goal,
  duplicateEventsOnSecondSync: second.candidates.length
}, null, 2));
