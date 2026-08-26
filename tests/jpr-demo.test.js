const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const jprHtmlSource = fs.readFileSync(path.join(root, "jpr-demo.html"), "utf8");

global.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, "storage.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "bootstrap.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "ai-workflow.js"), "utf8"));

test("JPR Demo 使用第三个独立工作区并可单独恢复与重置", async () => {
  const { MemoryStorageAdapter, WORKSPACE_MODES } = window.ProjectOSStorage;
  const adapter = new MemoryStorageAdapter();
  assert.equal(WORKSPACE_MODES.JPR_DEMO, "jpr-demo");
  await adapter.saveWorkspace({ marker:"formal", zones:[] }, WORKSPACE_MODES.NORMAL);
  await adapter.saveWorkspace({ marker:"generic-demo", zones:[] }, WORKSPACE_MODES.DEMO);
  await adapter.saveWorkspace({ marker:"jpr-session-saved", zones:[] }, WORKSPACE_MODES.JPR_DEMO);
  assert.equal((await adapter.loadWorkspace(WORKSPACE_MODES.JPR_DEMO)).marker, "jpr-session-saved");
  await adapter.saveWorkspace({ marker:"jpr-reset", zones:[] }, WORKSPACE_MODES.JPR_DEMO);
  assert.equal((await adapter.loadWorkspace(WORKSPACE_MODES.NORMAL)).marker, "formal");
  assert.equal((await adapter.loadWorkspace(WORKSPACE_MODES.DEMO)).marker, "generic-demo");
});

test("正式备份默认不包含 JPR Demo，专用导出明确标识 JPR 工作区", () => {
  const adapter = new window.ProjectOSStorage.MemoryStorageAdapter();
  const normal = { workspaceId:"normal", zones:[] };
  const jpr = { workspaceId:"jpr-demo", zones:[{id:"zone-jpr",projects:[]}] };
  const formalBackup = adapter.exportState(normal);
  assert.equal(formalBackup.workspaceMode, "normal");
  assert.equal(formalBackup.jprDemoWorkspace, undefined);
  const demoBackup = adapter.exportDemoState(jpr);
  assert.equal(demoBackup.workspaceMode, "jpr-demo");
  assert.equal(demoBackup.workspace.zones[0].id, "zone-jpr");
});

test("JPR 预设只包含指定的架空业务改善案例", () => {
  [
    "業務改善",
    "問い合わせ対応の標準化",
    "問い合わせ対応の抜け漏れを減らし、担当者間の引き継ぎを分かりやすくする。",
    "過去の問い合わせを使って分類ルールを検証する。",
    "現行フローの整理が完了し、回答テンプレートを検証中。",
    "現行の対応フローを整理した",
    "問い合わせ分類の初期案を作成した",
    "過去の問い合わせサンプルを整理している",
    "担当者によって分類結果が異なる",
    "過去10件の問い合わせで分類ルールを検証し、差異を記録する。"
  ].forEach(value => assert.match(appSource, new RegExp(value)));
  assert.match(appSource, /fictionalData:true/);
  assert.match(appSource, /demo\.zoneLinks=\[\];demo\.contextEvents=\[\]/);
});

test("标准页面与 JPR Demo 使用两个独立网址", () => {
  assert.doesNotMatch(htmlSource, /id="jpr-demo-button"|id="confirm-enter-jpr-demo"/);
  assert.match(jprHtmlSource, /data-app-page="jpr-demo"/);
  assert.match(jprHtmlSource, /fetch\(new URL\("index\.html"/);
  assert.match(appSource, /if\(IS_JPR_PAGE\)/);
  assert.match(appSource, /workspaceMode=preferred===WORKSPACE_MODES\.DEMO\?WORKSPACE_MODES\.DEMO:WORKSPACE_MODES\.NORMAL/);
  assert.match(appSource, /if\(!IS_JPR_PAGE\)localStorage\.setItem\(WORKSPACE_MODE_KEY,workspaceMode\)/);
});

test("JPR 重置回到零起点，预设由开始按钮重新载入", () => {
  assert.match(appSource, /function jprBlankState\(\)/);
  assert.match(appSource, /state=wasJpr\?jprBlankState\(\):demoInitialState/);
  assert.match(appSource, /デモを最初から始める/);
  assert.match(appSource, /data-action="load-jpr-sample"/);
  assert.match(appSource, /state=jprDemoState\(\);resetUi\(\);render\(\)/);
});

test("JPR 复用完整本番组件并保留次级项目追加、状态标签与完整 Resume", () => {
  assert.doesNotMatch(appSource, /function renderJpr|return renderJpr/);
  assert.match(appSource, /renderTaskControls\("project",project\)/);
  assert.match(appSource, /data-action="add-project">＋ 追加次级项目/);
  assert.match(appSource, /detailNav\("memory","项目私有记忆"/);
  assert.match(appSource, /detailNav\("history","工作历史"/);
  assert.match(appSource, /detailNav\("backlog","待办池"/);
  assert.match(appSource, /detailNav\("parking","项目暂存"/);
});

test("JPR 核心路径提供日文确认页并隐藏本周专注", () => {
  ["JPR向けデモ","今回の作業を開始","AIに相談","現状を整理","確認して反映","今回の作業を終了","変更内容、テスト、確認結果を記録します","完了チェック、ここに記録した事実"].forEach(value => assert.match(htmlSource + appSource, new RegExp(value)));
  assert.match(appSource, /\$\{isJpr\?"":`<button[^`]+data-stat="focus"/);
  assert.match(appSource, /overview-stats \$\{isJpr\?"jpr-overview-stats":""\}/);
  assert.match(appSource, /reviewField\(\{id:"completed"[^}]*checked:false/);
  assert.match(appSource, /初期状態では選択されません/);
  assert.match(appSource, /対象プロジェクト：問い合わせ対応の標準化｜分類ルールの初期案/);
  assert.match(appSource, /validateStatusReviewIdentity\(parsed\.value/);
});

test("JPR 的追加项目弹窗使用日文且不改写标准页面中文", () => {
  ["新規作成","手動で作成","AIとの対話から取り込む","キャンセル","プロジェクト整理用プロンプトをコピー"].forEach(value => assert.match(htmlSource, new RegExp(value)));
  ["プロジェクトを追加","プロジェクト名","目的・説明","現在の目標","プロジェクトを作成","例：問い合わせ対応の標準化"].forEach(value => assert.match(appSource, new RegExp(value)));
  ["追加次级项目","项目名称","项目说明","当前目标","建立次级项目","例如：客户反馈整理工具"].forEach(value => assert.match(appSource, new RegExp(value)));
  assert.match(htmlSource, /data-jpr-aria="閉じる"/);
});

test("JPR Prompt 使用日文说明、英文 JSON 字段且不混入其他项目私有记忆", () => {
  const prompt = window.ProjectOSAIWorkflow.buildStatusReviewPrompt({
    locale:"ja",
    zone:{name:"業務改善",sharedMemory:[{text:"共有可能な背景"}],projects:[{name:"別プロジェクト",projectMemory:["混入禁止"]}]},
    project:{name:"問い合わせ対応の標準化",purpose:"引き継ぎを分かりやすくする",goal:"分類ルールを検証する",currentState:"テンプレートを検証中",completed:["フロー整理"],inProgress:["サンプル整理"],openIssues:["分類差異"],blockers:[],nextActions:["10件で検証"],parkingLot:[],assets:[],decisions:[],constraints:[]},
    session:{goal:"10件で確認",todos:[{text:"差異を記録",completed:false}],notes:"架空メモ"},
    recentSessions:[]
  });
  assert.match(prompt, /進行中の一つのプロジェクト/);
  assert.match(prompt, /current_state_summary/);
  assert.match(prompt, /completed_milestones/);
  assert.match(prompt, /推測で完了扱いにしない/);
  assert.match(prompt, /対象プロジェクト：問い合わせ対応の標準化｜/);
  assert.doesNotMatch(prompt, /混入禁止/);
});

test("JPR 工作总结使用日文完整项目更新规则", () => {
  const prompt=window.ProjectOSAIWorkflow.buildStatusReviewPrompt({
    intent:"WORK_SUMMARY",locale:"ja",zone:{name:"業務改善"},
    project:{name:"問い合わせ対応の標準化",purpose:"引き継ぎを分かりやすくする",currentState:"テンプレートを検証中",currentPhase:"VALIDATION",completed:["既存フローを整理"],inProgress:["10件を確認"],openIssues:["分類差異"],blockers:[],nextActions:["10件を確認"]},
    session:{goal:"分類ルールを検証",todos:[{text:"10件を確認",completed:true}],notes:"10件の差異を記録した"}
  });
  assert.match(prompt,/更新後の現在のプロジェクト全体/);
  assert.match(prompt,/CURRENT_PROJECT_UPDATE/);
  assert.match(prompt,/今回確認できる証拠（最優先）/);
  assert.match(prompt,/10件の差異を記録した/);
  assert.match(prompt,/既存の完了成果（完全な更新後スナップショットに保持する）/);
  assert.match(prompt,/project_name は必ず「問い合わせ対応の標準化」/);
  assert.match(prompt,/"important_context": \[\]/);
  assert.doesNotMatch(prompt,/请只总结当前这个 Session/);
});

test("JPR Session は専用工作区内の正式な履歴として保存され、通常 Demo の旧标记语义不变", () => {
  assert.match(appSource, /const isLegacyDemo=workspaceMode===WORKSPACE_MODES\.DEMO/);
  assert.match(appSource, /isDemo:isLegacyDemo/);
  assert.match(appSource, /source:isDemoWorkspace\(\)\?"demo":"manual"/);
  assert.match(appSource, /workspaceMode===WORKSPACE_MODES\.NORMAL&&!session\.isDemo/);
});
