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

test("本周专注只合计人工确认的 Session 分钟数", () => {
  assert.match(appSource, /confirmedFocusSessions\(sessions,weekStart\)/);
  assert.match(appSource, /confirmedFocusMinutes\(sessions,weekStart\)/);
  assert.match(appSource, /已人工确认 \$\{stats\.focusMinutes\} 分钟/);
  assert.match(appSource, /timeEntryMode="MANUAL_CONFIRMED"/);
});

test("Project Resume 把行动指示放在简介后并突出项目状态", () => {
  assert.match(appSource, /<\/section>\n\s+\$\{renderActionDirective\(project\)\}<div class="resume-layout">/);
  assert.match(appSource, /class="project-action-directive"/);
  assert.match(appSource, /class="project-state-panel full"/);
  assert.match(cssSource, /\.project-action-directive\{/);
  assert.match(cssSource, /\.project-state-panel\{/);
});

test("问题使用可解决、可恢复和可直接删除的标签交互", () => {
  assert.match(appSource, /data-action="set-issue-status"/);
  assert.match(appSource, /data-action="delete-issue"/);
  assert.match(appSource, /data-action="delete-blocker"/);
  assert.match(appSource, /resolvedIssues:asList\(input\.resolvedIssues\)/);
  assert.match(cssSource, /\.issue-chip\.is-resolved \.issue-chip-text\{[^}]*color:#111[^}]*text-decoration:line-through/);
});

test("通用演示工作区继续使用旧版演示标记", () => {
  assert.match(appSource, /const isLegacyDemo=workspaceMode===WORKSPACE_MODES\.DEMO/);
  assert.match(appSource, /isDemo:isLegacyDemo/);
  assert.match(appSource, /source:isDemoWorkspace\(\)\?"demo":"manual"/);
});

test("首页提供不限条数且带连续数字的今日任务总结", () => {
  assert.match(appSource, /data-action="today-summary" aria-expanded=/);
  assert.match(appSource, /class="today-summary-number"[^>]*>\$\{index\+1\}</);
  const start=appSource.indexOf("function todaySummaryEntries");
  const end=appSource.indexOf("function inspirationSource",start);
  const source=appSource.slice(start,end);
  assert.doesNotMatch(source,/\.slice\(/);
  assert.doesNotMatch(source,/focusMinutes|confirmedFocus|duration/);
});

test("今日总结把项目记忆放在按需展开的横向区域", () => {
  assert.match(appSource, /<details class="today-memory-panel">/);
  assert.match(appSource, /project\.projectMemory\|\|\[\]/);
  assert.match(cssSource,/\.today-memory-strip\{[^}]*grid-auto-flow:column[^}]*overflow-x:auto/);
});

test("首页灵感库使用独立数据、可收起并提供双入口气泡交互", () => {
  const start=appSource.indexOf("function inspirationSource");
  const end=appSource.indexOf("function renderDashboardStatDetail",start);
  const source=appSource.slice(start,end);
  assert.match(appSource,/inspirations:\[\]/);
  assert.match(appSource,/raw\.inspirations/);
  assert.doesNotMatch(source,/project\.parkingLot|session\.parkingAdded/);
  assert.match(appSource,/\$\{renderInspirationLibrary\(\)\}/);
  assert.match(source,/data-action="toggle-inspiration-library"/);
  assert.match(source,/data-action="select-inspiration"/);
  assert.match(source,/class="inspiration-bubble/);
  assert.match(source,/data-inspiration-form="dashboard"/);
  assert.match(appSource,/data-inspiration-form="session"/);
  assert.match(appSource,/detailNav\("parking","项目暂存"/);
  assert.match(appSource,/这里的内容不会自动出现在灵感库/);
  assert.match(cssSource,/@keyframes inspiration-breathe/);
  assert.match(cssSource,/@media\(prefers-reduced-motion:reduce\)/);
});
