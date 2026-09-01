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

test("记录阻塞不会覆盖主行动，并会修复旧版被污染的进行中会话", () => {
  assert.doesNotMatch(appSource,/todo-primary"\)\.value=blockerPrimary/);
  assert.match(appSource,/optional=\[blockerOptional,\.\.\.optional\]\.slice\(0,2\)/);
  assert.match(appSource,/function repairBlockerOverwrittenPrimary/);
  assert.match(htmlSource,/不会覆盖你的主行动，也不会新建或替换项目/);
});

test("演示与能力库退出每日驾驶舱主路径，但旧数据仍可迁移", () => {
  assert.match(htmlSource, /id="tools-button"[^>]*hidden/);
  assert.match(htmlSource, /id="demo-mode-button"[^>]*hidden/);
  assert.match(appSource, /raw\?\.schemaVersion === 2 && raw\.workspace/);
  assert.match(appSource, /Array\.isArray\(raw\.accounts\)/);
  const dashboard=appSource.slice(appSource.indexOf("function renderDashboard()"),appSource.indexOf("function renderZoneCard"));
  assert.doesNotMatch(dashboard,/renderInspirationLibrary\(\)/);
});

test("首页以昨天、今天和卡点为唯一日常摘要主线", () => {
  assert.match(appSource, /function renderDailyCommandCenter\(\)/);
  assert.match(appSource, /昨天做了什么/);
  assert.match(appSource, /今天该做什么/);
  assert.match(appSource, /项目卡在哪里/);
  assert.match(appSource, /AUTO_SYNC\.buildDailyBrief\(state,now\(\)\)/);
  assert.match(appSource, /\$\{isDemo\?"":renderDailyCommandCenter\(\)\}/);
  assert.match(cssSource,/\.daily-command-center\{/);
});

test("待确认自动记录和失效路径在首页保持可见", () => {
  assert.match(appSource, /待 Review 的 \$\{brief\.reviewCount\} 项不会混进正式进度/);
  assert.match(appSource, /class="daily-path-warning"/);
  assert.match(appSource, /data-action="open-project-source-settings"/);
  assert.match(appSource, /处理待确认更新/);
});

test("项目关系必须声明原因与范围，并且只读不写回", () => {
  assert.match(htmlSource,/id="link-reason"/);
  assert.match(htmlSource,/只建立可见的只读参考关系/);
  assert.match(appSource,/if\(!scopes\.length\)/);
  assert.match(appSource,/if\(!reason\)/);
  assert.match(appSource,/mode:"REFERENCE_ONLY"/);
  assert.match(appSource,/confirmedByUser:true/);
  assert.match(appSource,/不会跨项目写回状态/);
});

test("多目录监听只做精确去重，不把父目录和子目录误合并", () => {
  assert.match(appSource,/const nextSourcePaths=\[\.\.\.new Set\(lines\(byId\("task-edit-source-paths"\)\.value\)\)\]/);
  assert.doesNotMatch(appSource,/dedupeList\(lines\(byId\("task-edit-source-paths"\)/);
});

test("工作历史区分自动证据和人工 Session，不重复展示人工 work_log", () => {
  assert.match(appSource,/function automaticHistoryEntries\(project\)/);
  assert.match(appSource,/\["git","filesystem","codex"\]\.includes\(entry\.event\.sourceType\)/);
  assert.match(appSource,/自动发现且已确认/);
  assert.match(appSource,/人工工作记录/);
  assert.match(appSource,/session\.timeEntryMode==="MANUAL_CONFIRMED"/);
  assert.match(appSource,/原因：\$\{escapeHtml\(reason\)\}/);
  assert.match(appSource,/synced\.slice\(0,8\)/);
  assert.match(appSource,/查看全部 \$\{synced\.length\} 条证据/);
});

test("弹窗不会因点击遮罩或按下 Escape 意外关闭", () => {
  assert.match(appSource,/dialog\.setAttribute\("closedby","none"\)/);
  assert.match(appSource,/dialog\.addEventListener\("cancel",event=>event\.preventDefault\(\)\)/);
  assert.match(appSource,/if\(event\.target===dialog\)\{event\.preventDefault\(\);event\.stopPropagation\(\)\}/);
  assert.doesNotMatch(appSource,/if\(event\.target===dialog\)closeDialog\(dialog\.id\)/);
  assert.match(appSource,/event\.key==="Escape"&&topOpenDialog\(\)/);
});

test("复制提示词时提示显示在当前弹窗的顶层", () => {
  assert.match(appSource,/function activeToast\(\)\{const dialog=topOpenDialog\(\)/);
  assert.match(appSource,/toast\.className="toast dialog-toast"/);
  assert.match(appSource,/dialog\.appendChild\(toast\)/);
  assert.match(cssSource,/\.modal>\.dialog-toast\{[^}]*text-align:center/);
});

test("Goal Drift Review 明确提供四种人工决策且不参与全部接受", () => {
  assert.match(htmlSource, /id="auto-sync-goal-suggestions"/);
  ["保持原目标", "接受新目标", "编辑后接受", "稍后处理"].forEach(label => assert.match(appSource, new RegExp(label)));
  assert.match(appSource, /data-action="accept-goal-suggestion"/);
  assert.match(appSource, /AUTO_SYNC\.acceptGoalSuggestion/);
  assert.match(appSource, /document\.querySelectorAll\("\[data-sync-event-id\]"\)/);
  assert.doesNotMatch(appSource, /accept-all-sync-events[\s\S]{0,300}data-goal-suggestion-id/);
});

test("Goal Drift 按钮直接绑定 Review 弹窗容器", () => {
  assert.match(appSource, /function handleGoalSuggestionAction\(control\)/);
  assert.match(appSource, /byId\("auto-sync-goal-suggestions"\)\.addEventListener\("click"/);
  assert.match(appSource, /handleGoalSuggestionAction\(control\)/);
});

test("项目详情页会在当前目标旁直接提示待确认目标偏移", () => {
  assert.match(appSource, /pendingGoalSuggestionForProject\(project\.id\)/);
  assert.match(appSource, /检测到目标偏移 · 尚未修改/);
  assert.match(appSource, /data-action="review-sync">查看并确认/);
});
