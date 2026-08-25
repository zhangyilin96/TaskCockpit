const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("AI 导入预览的核心字段可逐项决定是否写入", () => {
  ["purpose", "goal", "state", "phase", "next", "completed", "progress", "issues", "blockers"].forEach(field => {
    assert.match(htmlSource, new RegExp(`id="preview-apply-${field}"`));
    assert.match(appSource, new RegExp(`bootstrapPreviewValue\\("${field}"`));
  });
});

test("AI 导入的已完成建议默认不勾选并包含证据提醒", () => {
  assert.match(htmlSource, /id="preview-apply-completed" type="checkbox"\s*\/>/);
  assert.doesNotMatch(htmlSource, /id="preview-apply-completed"[^>]*checked/);
  assert.match(htmlSource, /只有你确认存在完成、验证、通过或交付证据时才写入/);
  assert.match(appSource, /field!=="completed"/);
});

test("项目归档 Prompt 禁止推测完成", () => {
  assert.match(appSource, /明确完成、验证、通过或交付证据/);
  assert.match(appSource, /请放入 in_progress 或 open_issues，不得推测完成/);
});

test("首页五张统计卡都提供点击筛选入口", () => {
  ["zones", "active-projects", "today", "completed", "focus"].forEach(stat => {
    assert.match(appSource, new RegExp(`data-action="dashboard-stat" data-stat="${stat}"`));
  });
  assert.match(appSource, /id="dashboard-stat-detail"/);
  assert.match(appSource, /data-action="close-dashboard-stat"/);
});

test("统计卡有明确 hover、键盘焦点和 pointer 反馈", () => {
  assert.match(cssSource, /\.dashboard-stat-card\{[^}]*cursor:pointer/);
  assert.match(cssSource, /\.dashboard-stat-card:hover/);
  assert.match(cssSource, /\.dashboard-stat-card:focus-visible/);
});

test("本周专注明细显示当前口径的分钟合计", () => {
  assert.match(appSource, /focusMinutes:Math\.round\(focusMs\/60000\)/);
  assert.match(appSource, /当前口径合计 \$\{stats\.focusMinutes\} 分钟/);
});

test("独立演示工作区创建的 Session 带演示标记", () => {
  assert.match(appSource, /const isDemo=workspaceMode===WORKSPACE_MODES\.DEMO/);
  assert.match(appSource, /source:isDemo\?"demo":"manual"/);
});
