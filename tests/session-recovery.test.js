const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");

global.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, "storage.js"), "utf8"));

function memoryLocalStorage() {
  const records = new Map();
  return {
    getItem:key => records.has(key) ? records.get(key) : null,
    setItem:(key,value) => records.set(key,String(value))
  };
}

test("Session 草稿恢复镜像按工作区和 Session 隔离", () => {
  const store = new window.ProjectOSStorage.SessionDraftStore(memoryLocalStorage());
  store.save({ workspaceId:"normal", projectId:"p1", sessionId:"s1", notes:"正式笔记", drafts:{workSummary:{raw:"{}"}}, updatedAt:"2026-08-26T10:00:00.000Z" });
  store.save({ workspaceId:"workspace-a", projectId:"p1", sessionId:"s1", notes:"恢复测试笔记", drafts:{}, updatedAt:"2026-08-26T10:01:00.000Z" });
  assert.equal(store.load("normal","s1").notes,"正式笔记");
  assert.equal(store.load("workspace-a","s1").notes,"恢复测试笔记");
  store.clearWorkspace("workspace-a");
  assert.equal(store.load("workspace-a","s1"),null);
  assert.equal(store.load("normal","s1").drafts.workSummary.raw,"{}");
});

test("Session 页面提供总结、暂停和结束三个相邻动作", () => {
  assert.match(appSource,/data-action="summarize-work"[^>]*>总结工作/);
  assert.match(appSource,/data-action="pause-session"[^>]*>暂停本次工作/);
  assert.match(appSource,/data-action="end-session"[^>]*>结束本次工作/);
  assert.doesNotMatch(appSource,/data-action="import-result">导入 AI 返回结果/);
  assert.match(appSource,/if\(action==="summarize-work"\)openStatusReviewDialog\("work-summary"\)/);
  assert.match(appSource,/if\(action==="pause-session"\)pauseActiveWork\(\)/);
});

test("总结工作弹窗支持提示词点击复制、JSON 粘贴和人工确认", () => {
  assert.match(htmlSource,/id="work-summary-evidence"/);
  assert.match(htmlSource,/id="status-review-output"[^>]*click-to-copy[^>]*readonly/);
  assert.match(htmlSource,/id="status-review-result"/);
  assert.match(htmlSource,/id="status-review-preview"/);
  assert.match(htmlSource,/id="confirm-status-review"/);
  assert.match(appSource,/byId\("status-review-output"\)\.addEventListener\("click",copyCurrentReviewPrompt\)/);
  assert.match(appSource,/reviewIntent:currentReviewMode==="work-summary"\?"WORK_SUMMARY":"STATUS_REVIEW"/);
  assert.match(appSource,/parseProjectUpdateJson\(raw\)/);
  assert.match(appSource,/session\.notes=event\.target\.value/);
});

test("确认总结写回后留在 Session，只有结束工作才返回项目", () => {
  const updateStart=appSource.indexOf("function finishStatusReviewUpdate");
  const updateEnd=appSource.indexOf("function finishEndedSession",updateStart);
  const updateSource=appSource.slice(updateStart,updateEnd);
  assert.match(updateSource,/closeDialog\("status-review-dialog"\);render\(\)/);
  assert.doesNotMatch(updateSource,/ui\.view=/);
  assert.match(appSource,/applyStatusReviewDraft\([^)]+\);AUTO_SYNC\.recordProjectChange\([\s\S]{0,800}finishStatusReviewUpdate\(/);
  assert.match(appSource,/function finishEndedSession\(message\)\{closeDialog\("end-dialog"\);ui\.view="project";ui\.detailTab="history"/);
});

test("未保存的 Session 输入写入恢复镜像并在重置或结束时清理", () => {
  ["session-notes","parking-input","inspiration-input","stuck-problem","status-review-result","end-discoveries","end-next-step","end-started-at","end-ended-at","end-time-confirmed"].forEach(id => assert.match(appSource,new RegExp(id)));
  assert.match(appSource,/writeSessionDraftMirror\(session\)/);
  assert.match(appSource,/window\.addEventListener\("pagehide"/);
  assert.match(appSource,/clearSessionRecovery\(session\)/);
  assert.match(appSource,/sessionDraftStore\.clearWorkspace\(workspaceMode\)/);
});

test("暂停 Session 保留数据并可从原 Session 恢复", () => {
  assert.match(appSource,/session\.status="PAUSED"/);
  assert.match(appSource,/ui\.view="dashboard"/);
  assert.match(appSource,/if\(existing\.status==="PAUSED"\)/);
  assert.match(appSource,/existing\.status="RUNNING"/);
});

test("结束工作必须确认可编辑时间并写入专注分钟数", () => {
  ["end-started-at","end-ended-at","end-time-confirmed","end-focus-duration","end-time-error"].forEach(id => assert.match(htmlSource,new RegExp(`id="${id}"`)));
  assert.match(appSource,/function confirmedEndTimeValues\(\)/);
  assert.match(appSource,/if\(!byId\("end-time-confirmed"\)\.checked\)/);
  assert.match(appSource,/session\.startedAt=timeValues\.startedAt/);
  assert.match(appSource,/session\.endedAt=timeValues\.endedAt/);
  assert.match(appSource,/session\.focusMinutes=timeValues\.focusMinutes/);
  assert.match(appSource,/session\.timeConfirmedAt=now\(\)/);
  assert.match(appSource,/timeConfirmed:byId\("end-time-confirmed"\)\.checked/);
});
