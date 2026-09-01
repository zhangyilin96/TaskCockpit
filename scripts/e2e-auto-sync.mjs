import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { collectWorkspaceActivities } from "./collectors.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const autoSyncSource = await readFile(path.join(root, "auto-sync.js"), "utf8");
const browserWindow = {};
vm.runInNewContext(autoSyncSource, { window: browserWindow, globalThis: browserWindow, Date, Math, JSON, Set, Map, Object, Array, String, Number, RegExp });
const AutoSync = browserWindow.ProjectOSAutoSync;
const git = process.env.PROJECT_OS_GIT_PATH || "git";
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "project-os-e2e-"));
const runGit = args => execFileSync(git, args, { cwd: fixtureRoot, encoding: "utf8", windowsHide: true });

try {
  runGit(["init"]);
  runGit(["config", "user.name", "Project OS E2E"]);
  runGit(["config", "user.email", "project-os-e2e@example.invalid"]);
  await mkdir(path.join(fixtureRoot, "test-results"));
  await writeFile(path.join(fixtureRoot, "installer.ps1"), "Write-Output 'one-click installer ready'\n", "utf8");
  await writeFile(path.join(fixtureRoot, "test-results", "results.txt"), "82 tests passed\n", "utf8");
  runGit(["add", "."]);
  runGit(["commit", "-m", "fix: complete one-click installer"]);

  const until = new Date(Date.now() + 60_000).toISOString();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const collected = await collectWorkspaceActivities({
    since,
    until,
    sourceCheckpoints: { git: since, filesystem: since },
    fileIndexes: {},
    projects: [{ id: "project-character-studio", zoneId: "zone-product", name: "Character Studio", sourcePaths: [fixtureRoot], routingKeywords: ["installer", "beta"] }]
  });
  const state = {
    workspaceId: "normal",
    zones: [{
      id: "zone-product",
      name: "产品开发",
      summary: "等待推进",
      updatedAt: since,
      projects: [{
        id: "project-character-studio",
        zoneId: "zone-product",
        name: "Character Studio",
        purpose: "角色一致性工作室",
        goal: "完成 Beta 安装验证",
        currentState: "安装链路调整中",
        currentPhase: "VALIDATION",
        currentProgressSummary: "",
        completed: [],
        inProgress: ["调整 installer"],
        nextActions: ["运行回归测试"],
        openIssues: [],
        timeline: [],
        sourcePaths: [fixtureRoot],
        routingKeywords: ["installer"],
        createdAt: since,
        updatedAt: since,
        lastWorkedAt: null
      }]
    }],
    settings: {}, activityEvents: [], activityEvidence: [], syncRuns: [], routingRules: [], projectRelationshipRules: []
  };
  AutoSync.ensureState(state, { createBaselines: true, detectedAt: since });
  const normalized = AutoSync.normalizeCollectedActivities(collected.candidates, state, { detectedAt: until });
  state.activityEvents.push(...normalized.events);
  state.activityEvidence.push(...normalized.evidence);
  const event = normalized.events[0];
  assert.equal(normalized.events.length, 1);
  assert.equal(event.projectId, "project-character-studio");
  assert.equal(event.metadata.effect.type, "completed");
  assert.equal(event.metadata.facts.some(fact => fact.includes("82 项测试")), true);
  AutoSync.applyReviewDecisions(state, [{ eventId: event.id, action: "confirm", projectId: "project-character-studio" }], { confirmedAt: until });
  const projected = state.zones[0].projects[0];
  assert.equal(projected.completed.some(item => item.includes("one-click installer")), true);
  assert.equal(projected.timeline.length, 1);
  console.log(JSON.stringify({
    result: "passed",
    collectorStatuses: collected.collectorStatuses.map(item => ({ sourceType: item.sourceType, status: item.status, discovered: item.discovered })),
    rawActivities: collected.discoveredCount,
    correlatedEvents: normalized.events.length,
    evidenceCount: event.evidence.length,
    normalizedSummary: event.normalizedSummary,
    projectedCurrentState: projected.currentState,
    projectedCompleted: projected.completed
  }, null, 2));
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
