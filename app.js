const STORAGE_KEY = "project-archive-cockpit-v2-1";
const V2_KEY = "task-zone-cockpit-v2";
const V1_KEY = "kiseki-task-zone-cockpit-v1";
const WORKSPACE_MODE_KEY = "project-os-workspace-mode";
const WORKSPACE_MODES = window.ProjectOSStorage.WORKSPACE_MODES;
const TASK_STATUS = window.ProjectOSLifecycle.TASK_STATUS;
const PAGE_VARIANT = document.body.dataset.appPage || "standard";
const IS_JPR_PAGE = PAGE_VARIANT === "jpr-demo";
const UI_STORAGE_KEY = IS_JPR_PAGE ? "project-os-ui-jpr" : "project-os-ui";
const INSPIRATION_DRAFT_KEY = "project-os:inspiration-draft:";
const MAX_ZONES = 7;
const COLORS = ["#e96b46", "#4f7866", "#607d8b", "#b88740", "#806f9d", "#9b625d", "#4e7f8f"];
const BLOCKER_STATUS = Object.freeze({ OPEN:"OPEN", RESOLVED:"RESOLVED", DEFERRED:"DEFERRED" });
const JPR_STATUS_REVIEW_SAMPLE = {
  current_state_summary:"対象プロジェクト：問い合わせ対応の標準化｜分類ルールの初期案を使い、過去の問い合わせで担当者ごとの差異を確認する段階に入っている。",
  completed_milestones:["現行の対応フローを整理した","問い合わせ分類の初期案を作成した"],
  in_progress:["過去の問い合わせサンプル10件を分類している"],
  active_problems:["担当者によって分類結果が異なる"],
  current_blockers:[],
  progress_judgement:{phase:"VALIDATION",reason:"分類案はできており、実例を使った再現性の確認が必要なため。"},
  recommended_next_step:"過去10件の問い合わせで分類ルールを検証し、担当者ごとの差異を記録する。",
  optional_next_steps:["差異が出た分類条件を一覧にする"],
  should_stop_or_defer:[],
  memory_update:["分類結果の差異は、担当者と判断理由をセットで記録する。"]
};
const JPR_PROJECT_UPDATE_SAMPLE = {
  project_name:"問い合わせ対応の標準化",
  project_purpose:"問い合わせ対応の抜け漏れを減らし、担当者間の引き継ぎを分かりやすくする。",
  current_goal:"過去の問い合わせを使って分類ルールを検証する。",
  current_state:"分類ルールの初期案を使い、過去の問い合わせで担当者ごとの差異を確認する段階に入っている。",
  current_phase:"VALIDATION",
  completed_milestones:["現行の対応フローを整理した","問い合わせ分類の初期案を作成した"],
  in_progress:["過去の問い合わせサンプル10件を分類している"],
  open_issues:["担当者によって分類結果が異なる"],
  current_blockers:[],
  recommended_next_step:"過去10件の問い合わせで分類ルールを検証し、担当者ごとの差異を記録する。",
  key_decisions:["AIの提案は人が確認してからプロジェクトに反映する。"],
  constraints:["架空データだけを使用する。"],
  assets:["問い合わせ分類ルール初期案"],
  important_context:["分類結果の差異は、担当者と判断理由をセットで記録する。"],
  parking_lot:["回答テンプレートの表現統一"]
};

const PROJECT_BOOTSTRAP_PROMPT = `请只总结当前这个次级项目，不要混入同一主任务下的其他项目，也不要复制整个主任务记忆。

只返回一个合法 JSON 对象，不要 Markdown，不要代码块，不要前后说明。严格使用以下结构：
{
  "project_name": "",
  "project_purpose": "",
  "current_goal": "",
  "current_state": "",
  "current_phase": "",
  "completed_milestones": [],
  "in_progress": [],
  "open_issues": [],
  "current_blockers": [],
  "recommended_next_step": "",
  "key_decisions": [],
  "constraints": [],
  "assets": [],
  "important_context": [],
  "parking_lot": []
}

规则：
- current_phase 只能写 IDEA、EXPLORATION、PROTOTYPE、VALIDATION、STABILIZATION、DELIVERY 或 PAUSED；无法判断时写空字符串。
- 只有上下文中有明确完成、验证、通过或交付证据的事项，才能进入 completed_milestones。如果无法确认完成状态，请放入 in_progress 或 open_issues，不得推测完成。
- current_blockers 只写明确阻碍当前推进的问题；一般已知问题放入 open_issues。
- recommended_next_step 只写 1 个最推荐的下一步。
- 所有列表字段使用字符串数组，并去除“X”与“解决：X”这类重复表达。
- 信息不足使用空字符串或空数组，不得虚构进度。`;
const ZONE_BOOTSTRAP_PROMPT = `请总结当前长期方向，而不是某一个具体执行项目。输出人类可读摘要，并在 JSON 代码块中输出：ZONE_NAME、ZONE_PURPOSE、MOTHER_GOAL、ZONE_SUMMARY、PROJECTS、SHARED_MEMORY、CONSTRAINTS、RELATED_ZONES。PROJECTS 使用项目名称字符串数组；明确当前总体进度、关键约束，以及是否与其他长期方向有关联。不要复制具体项目的技术调试、源代码或私有记忆。`;

const app = document.querySelector("#app");
const byId = id => document.getElementById(id);
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const INSPIRATION_ORB_PRESETS = Object.freeze(["orb-sunlit","orb-neon","orb-pearl","orb-cosmos"]);
const INSPIRATION_ORB_LABELS = Object.freeze({"orb-sunlit":"晨光","orb-neon":"霓虹","orb-pearl":"珍珠","orb-cosmos":"星云"});
const INSPIRATION_AI_STATES = Object.freeze(["idle","thinking","ready","attention","error"]);
const clone = value => JSON.parse(JSON.stringify(value));
const asList = value => Array.isArray(value) ? value.map(item => typeof item === "string" ? item : item.name || item.text || JSON.stringify(item)).filter(Boolean) : value ? String(value).split(/\r?\n|；|;|•/).map(item => item.replace(/^(?:[-*]\s*|\d+[.、)]\s*)/, "").trim()).filter(Boolean) : [];
const lines = value => String(value || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean);
const text = value => Array.isArray(value) ? value.join("\n") : String(value || "");
const memoryText = value => typeof value === "string" ? value : value?.text || "";
const asMemoryList = (value, workspaceId = workspaceMode) => {
  const items = Array.isArray(value) ? value : asList(value);
  return items.map(item => typeof item === "object" && item.id ? ({ ...item, workspaceId:item.workspaceId||workspaceId, text:memoryText(item), createdAt:item.createdAt||now(), updatedAt:item.updatedAt||item.createdAt||now() }) : ({ id:uid("memory"), workspaceId, text:memoryText(item), createdAt:now(), updatedAt:now() }));
};
function normalizeBlocker(item={},projectId="",workspaceId=workspaceMode){const source=typeof item==="string"?{text:item}:item;const timestamp=source.createdAt||now();const status=Object.values(BLOCKER_STATUS).includes(source.status)?source.status:BLOCKER_STATUS.OPEN;return{...source,id:source.id||uid("blocker"),projectId,workspaceId:source.workspaceId||workspaceId,text:String(source.text||source.name||"").trim(),status,priority:source.priority==="HIGH"?"HIGH":"NORMAL",sourceSessionId:source.sourceSessionId||null,createdAt:timestamp,updatedAt:source.updatedAt||timestamp,resolvedAt:source.resolvedAt||null,deferredAt:source.deferredAt||null}}
function inspirationOrbHash(value=""){return[...String(value)].reduce((total,char)=>((total*31)+char.charCodeAt(0))>>>0,7)}
function fallbackInspirationOrbPreset(id=""){return INSPIRATION_ORB_PRESETS[inspirationOrbHash(id)%INSPIRATION_ORB_PRESETS.length]}
function normalizeInspiration(item={},workspaceId=workspaceMode){const source=typeof item==="string"?{text:item}:item;const timestamp=source.createdAt||now();const id=source.id||uid("inspiration");const orbPresetId=INSPIRATION_ORB_PRESETS.includes(source.orbPresetId)?source.orbPresetId:fallbackInspirationOrbPreset(id);const aiState=INSPIRATION_AI_STATES.includes(source.aiState)?source.aiState:"idle";return{...source,id,workspaceId:source.workspaceId||workspaceId,text:String(source.text||source.name||"").trim(),source:source.source==="session"?"session":"dashboard",zoneId:source.zoneId||null,projectId:source.projectId||null,sessionId:source.sessionId||null,zoneName:source.zoneName||"",projectName:source.projectName||"",orbPresetId,aiState,aiSummary:String(source.aiSummary||""),aiUpdatedAt:source.aiUpdatedAt||null,createdAt:timestamp,updatedAt:source.updatedAt||timestamp}}
function currentBlockers(project){return(project?.blockers||[]).filter(item=>item.status===BLOCKER_STATUS.OPEN)}
function reconcileIssueLists(project){project.openIssues=window.ProjectOSBootstrap.dedupeList(project.openIssues||[]);project.resolvedIssues=window.ProjectOSBootstrap.dedupeList(project.resolvedIssues||[]).filter(resolved=>!project.openIssues.some(open=>window.ProjectOSPlanning.isHighlySimilar(open,resolved)));return project}

const storageAdapter = window.ProjectOSStorage.createStorageAdapter();
const sessionDraftStore = window.ProjectOSStorage.createSessionDraftStore();
const syncProvider = new window.ProjectOSStorage.SyncProviderStub();
const skillDiscoveryProvider = new window.ProjectOSStorage.SkillDiscoveryProviderStub();
let workspaceMode = WORKSPACE_MODES.NORMAL;
let state = emptyState(WORKSPACE_MODES.NORMAL);
let ui = { view:"dashboard", zoneId:null, projectId:null, detailTab:"memory", addKind:"zone", showOtherZones:false, showAllProjects:false, showArchivedZones:false, showArchivedProjects:false, dashboardStat:null, todaySummaryOpen:false, inspirationOpen:false, inspirationSelectedId:null, skillFilter:"all", historyManage:false, selectedHistoryIds:[] };
let pendingBootstrap = null;
let pendingResult = null;
let pendingStatusReview = null;
let currentReviewMode = "status-review";
let pendingImportState = null;
let pendingImportDemoState = null;
let pendingImportTargetMode = WORKSPACE_MODES.NORMAL;
let pendingDelete = null;
let pendingTaskAction = null;
let toastTimer;
let saveQueue = Promise.resolve();

function defaultSkills(workspaceId = workspaceMode) {
  const timestamp = now();
  return [
    { id:"skill-workbuddy-xhs", name:"WorkBuddy XHS Skills", type:"installed", description:"小红书内容策略、爆款分析、复盘、选题与结构", source:"本地安装", path:"", repository:"", version:"", tags:["内容运营","小红书","增长"], status:"active", createdAt:timestamp, updatedAt:timestamp },
    { id:"skill-lingzao", name:"灵造 Lingzao", type:"installed", description:"市场侦察与真实小红书爆款搜索", source:"本地安装", path:"", repository:"", version:"", tags:["市场研究","小红书"], status:"active", createdAt:timestamp, updatedAt:timestamp },
    { id:"skill-visual-validation", name:"Visual Validation Pipeline", type:"self", description:"图像生成结果的一致性检查、质量验证与修复记录", source:"自建", path:"", repository:"", version:"", tags:["图像生成","质量验证","自建"], status:"active", createdAt:timestamp, updatedAt:timestamp },
    { id:"skill-micro-saas", name:"Micro SaaS Builder", type:"self", description:"把真实业务痛点推进为可验证的轻量 MVP", source:"自建", path:"", repository:"", version:"", tags:["编程开发","项目管理","自建"], status:"active", createdAt:timestamp, updatedAt:timestamp },
    { id:"tool-codex", name:"Codex", type:"external", description:"工程实现、调试与本地代码处理", source:"OpenAI", path:"", repository:"", version:"", tags:["编程开发"], status:"active", createdAt:timestamp, updatedAt:timestamp },
    { id:"tool-chatgpt", name:"ChatGPT", type:"external", description:"讨论、整理与策略推演", source:"OpenAI", path:"", repository:"", version:"", tags:["项目管理"], status:"active", createdAt:timestamp, updatedAt:timestamp },
    { id:"tool-deepseek", name:"DeepSeek", type:"external", description:"通用对话、分析与代码协助", source:"DeepSeek", path:"", repository:"", version:"", tags:["编程开发"], status:"active", createdAt:timestamp, updatedAt:timestamp }
  ].map(skill=>({ ...skill,workspaceId }));
}

function emptyState(workspaceId = workspaceMode) { return { schemaVersion:2, version:"2.10", workspaceId, zones:[], zoneLinks:[], contextEvents:[], inspirations:[], skills:defaultSkills(workspaceId), settings:{ storageMode:"indexeddb", syncMode:"local-only", workspaceMode:workspaceId }, createdAt:now(), updatedAt:now() }; }

function createProject(input = {}, zoneId = "", workspaceId = workspaceMode) {
  const timestamp = now();
  const id = input.id || uid("project");
  return {
    id, zoneId, workspaceId:input.workspaceId||workspaceId, status:window.ProjectOSLifecycle.normalizeTaskStatus(input.status,input.paused), keepWhenEmpty:Boolean(input.keepWhenEmpty), name:input.name || "未命名项目", purpose:input.purpose || "", goal:input.goal || "",
    currentState:input.currentState || "刚刚建立，尚未开始第一轮工作。", currentPhase:window.ProjectOSBootstrap.normalizePhase(input.currentPhase), currentProgressSummary:input.currentProgressSummary||input.latestProgressSummary||"", completed:asList(input.completed), importedMilestones:window.ProjectOSBootstrap.makeImportedMilestones(input.importedMilestones||[],input.snapshotMeta?.importedAt||timestamp,input.importedMilestones||[]), inProgress:asList(input.inProgress),
    nextActions:asList(input.nextActions), decisions:asList(input.decisions), constraints:asList(input.constraints), openIssues:asList(input.openIssues), resolvedIssues:asList(input.resolvedIssues),
    blockers:(Array.isArray(input.blockers||input.currentBlockers)?(input.blockers||input.currentBlockers):asList(input.blockers||input.currentBlockers)).map(item=>normalizeBlocker(item,id,workspaceId)).filter(item=>item.text), blockerReviewPending:Boolean(input.blockerReviewPending), snapshotMeta:input.snapshotMeta?{...input.snapshotMeta}:null, assets:asList(input.assets), backlog:asList(input.backlog), parkingLot:asList(input.parkingLot), projectMemory:asMemoryList(input.projectMemory || input.memory,workspaceId), skillIds:asList(input.skillIds),
    sessions:Array.isArray(input.sessions) ? input.sessions.filter(session=>!session.deletedAt).map(session => normalizeSession(session,id,workspaceId)) : [],
    createdAt:input.createdAt || timestamp, updatedAt:input.updatedAt || timestamp, nonSessionUpdatedAt:input.nonSessionUpdatedAt || (input.sessions?.length ? input.createdAt || timestamp : input.updatedAt || timestamp), lastWorkedAt:input.lastWorkedAt || null, color:input.color || COLORS[0]
  };
}

function normalizeSession(session = {}, projectId = "", workspaceId = workspaceMode) { const timestamp=now(); const isDemo=Boolean(session.isDemo); const status=session.status==="ENDED"||session.endedAt?"ENDED":session.status==="PAUSED"?"PAUSED":"RUNNING"; const focusMinutes=Number(session.focusMinutes); return { ...session, id:session.id||uid("session"), projectId, workspaceId:session.workspaceId||workspaceId, status, pausedAt:session.pausedAt||null, resumedAt:session.resumedAt||null, focusMinutes:Number.isFinite(focusMinutes)?Math.max(0,Math.round(focusMinutes)):null, timeConfirmedAt:session.timeConfirmedAt||null, timeEntryMode:session.timeEntryMode||"", drafts:session.drafts&&typeof session.drafts==="object"?clone(session.drafts):{}, isDemo, promotedToFormal:Boolean(session.promotedToFormal), source:session.source||(isDemo?"demo":"manual"), blockerIds:asList(session.blockerIds), todos:Array.isArray(session.todos)?session.todos.map(todo=>({ ...todo,id:todo.id||uid("todo"),workspaceId:todo.workspaceId||workspaceId })):[], generatedPrompts:Array.isArray(session.generatedPrompts)?session.generatedPrompts:[], importedResults:Array.isArray(session.importedResults)?session.importedResults:[], completed:asList(session.completed), discoveries:asList(session.discoveries), remainingIssues:asList(session.remainingIssues), parkingAdded:asList(session.parkingAdded), formalContributions:{ completed:asList(session.formalContributions?.completed), nextActions:asList(session.formalContributions?.nextActions), openIssues:asList(session.formalContributions?.openIssues), currentStateBefore:session.formalContributions?.currentStateBefore||"", currentStateAfter:session.formalContributions?.currentStateAfter||"", progressSummaryBefore:session.formalContributions?.progressSummaryBefore||"", progressSummaryAfter:session.formalContributions?.progressSummaryAfter||"" }, createdAt:session.createdAt||session.startedAt||timestamp, updatedAt:session.updatedAt||session.endedAt||timestamp }; }

function addProjectOriginHistory(project,kind="manual",bootstrapJson="") { const timestamp=now();const record=window.ProjectOSLifecycle.buildProjectOriginSession({id:uid("session"),project,workspaceId:project.workspaceId||workspaceMode,kind,timestamp,bootstrapJson});project.sessions.push(normalizeSession(record,project.id,project.workspaceId||workspaceMode));project.lastWorkedAt=timestamp;return record; }

function createZone(input = {}, workspaceId = workspaceMode) {
  const timestamp = now();
  const id = input.id || uid("zone");
  return {
    id, workspaceId:input.workspaceId||workspaceId, name:input.name || "未命名主任务", purpose:input.purpose || "", motherGoal:input.motherGoal || input.goal || "", summary:input.summary || "刚刚建立，等待推进。",
    sharedMemory:asMemoryList(input.sharedMemory,workspaceId), constraints:asList(input.constraints), status:window.ProjectOSLifecycle.normalizeTaskStatus(input.status,input.paused), paused:Boolean(input.paused), color:input.color || COLORS[0],
    projects:Array.isArray(input.projects) ? input.projects.map(project => createProject(project, id, workspaceId)) : [], createdAt:input.createdAt || timestamp, updatedAt:input.updatedAt || timestamp
  };
}

function normalizeCurrent(raw, workspaceId = raw?.workspaceId || workspaceMode) {
  const normalized = emptyState(workspaceId);
  normalized.createdAt = raw.createdAt || normalized.createdAt; normalized.updatedAt = raw.updatedAt || normalized.updatedAt;
  normalized.zones = Array.isArray(raw.zones) ? raw.zones.map((zone,index) => createZone({ ...zone, color:zone.color || COLORS[index % COLORS.length] },workspaceId)) : [];
  normalized.zoneLinks = Array.isArray(raw.zoneLinks) ? raw.zoneLinks.map(link=>({ ...link,id:link.id||uid("link"),workspaceId,createdAt:link.createdAt||now(),updatedAt:link.updatedAt||link.createdAt||now() })) : [];
  normalized.contextEvents = Array.isArray(raw.contextEvents) ? raw.contextEvents.map(event=>({ ...event,id:event.id||uid("event"),workspaceId })) : [];
  normalized.inspirations = Array.isArray(raw.inspirations) ? raw.inspirations.map(item=>normalizeInspiration(item,workspaceId)).filter(item=>item.text) : [];
  normalized.skills = Array.isArray(raw.skills) && raw.skills.length ? raw.skills.map(skill=>({ ...skill,id:skill.id||uid("skill"),workspaceId,tags:asList(skill.tags),status:skill.status||"active",createdAt:skill.createdAt||now(),updatedAt:skill.updatedAt||skill.createdAt||now() })) : defaultSkills(workspaceId);
  normalized.settings = { ...normalized.settings,...(raw.settings||{}) };
  normalized.zones.forEach(zone => zone.projects.forEach(project => { project.zoneId = zone.id; project.sessions.forEach(session => { session.projectId = project.id; }); }));
  return normalized;
}

function demoInitialState(skills = defaultSkills(WORKSPACE_MODES.DEMO)) {
  const demo=emptyState(WORKSPACE_MODES.DEMO);
  demo.skills=clone(skills).map(skill=>({ ...skill,workspaceId:WORKSPACE_MODES.DEMO }));
  return demo;
}

function demoSampleState(skills = state.skills) {
  const demo=demoInitialState(skills); const timestamp=now();
  demo.zones=[
    createZone({name:"示例主任务 A",purpose:"虚构的产品开发演示",motherGoal:"把示例原型推进到真实场景验证",summary:"示例原型已完成首次运行",color:"#7067a8",projects:[{name:"示例项目 A：会议摘要工具",purpose:"演示从项目恢复到工作记录的完整流程",goal:"验证摘要结果是否稳定",currentState:"已完成首次本地运行，等待样本验证",completed:["完成本地原型首次运行"],inProgress:["整理验证样本"],openIssues:["不同格式的会议记录仍需测试"],nextActions:["使用 3 份虚构样本验证摘要一致性"],color:"#7067a8"}]},WORKSPACE_MODES.DEMO),
    createZone({name:"示例主任务 B",purpose:"虚构的内容复盘演示",motherGoal:"完成一次发布到复盘的闭环",summary:"示例内容已进入复盘阶段",color:"#5573a7",projects:[{name:"示例项目 B：内容复盘",purpose:"演示内容发布后的数据记录与下一步判断",goal:"完成首轮示例数据复盘",currentState:"已录入一组虚构数据，等待形成结论",inProgress:["核对示例数据"],nextActions:["记录一个可验证的复盘结论"],color:"#5573a7"}]},WORKSPACE_MODES.DEMO)
  ];
  demo.createdAt=timestamp;demo.updatedAt=timestamp;return demo;
}

function jprDemoState() {
  const demo=emptyState(WORKSPACE_MODES.JPR_DEMO);const timestamp=now();
  demo.skills=defaultSkills(WORKSPACE_MODES.JPR_DEMO);
  const zone=createZone({
    id:"zone-jpr-business-improvement",name:"業務改善",purpose:"問い合わせ対応と引き継ぎの品質を継続的に改善する。",motherGoal:"対応の抜け漏れを減らし、誰でも同じ基準で引き継げる状態をつくる。",summary:"現行フローの整理が完了し、回答テンプレートを検証中。",color:"#625f9c",
    projects:[{id:"project-jpr-inquiry-standardization",name:"問い合わせ対応の標準化",purpose:"問い合わせ対応の抜け漏れを減らし、担当者間の引き継ぎを分かりやすくする。",goal:"過去の問い合わせを使って分類ルールを検証する。",currentState:"現行フローの整理が完了し、回答テンプレートを検証中。",currentPhase:"VALIDATION",completed:["現行の対応フローを整理した","問い合わせ分類の初期案を作成した"],inProgress:["過去の問い合わせサンプルを整理している"],openIssues:["担当者によって分類結果が異なる"],nextActions:["過去10件の問い合わせで分類ルールを検証し、差異を記録する。"],projectMemory:[],assets:[],backlog:[],parkingLot:[],color:"#625f9c"}]
  },WORKSPACE_MODES.JPR_DEMO);
  const project=zone.projects[0];addProjectOriginHistory(project,"manual");const origin=project.sessions.at(-1);const previousTimestamp=new Date(Date.now()-86400000).toISOString();origin.title="初期状態の登録";origin.source="demo";origin.summary="現行フローと分類ルールの初期案を、デモ用の状態として登録。";origin.startedAt=previousTimestamp;origin.endedAt=previousTimestamp;origin.createdAt=previousTimestamp;origin.updatedAt=previousTimestamp;project.lastWorkedAt=previousTimestamp;
  demo.zones=[zone];demo.zoneLinks=[];demo.contextEvents=[];demo.settings={...demo.settings,workspaceMode:WORKSPACE_MODES.JPR_DEMO,demoPreset:"jpr",fictionalData:true};demo.createdAt=timestamp;demo.updatedAt=timestamp;
  return demo;
}

function jprBlankState() {
  const demo=emptyState(WORKSPACE_MODES.JPR_DEMO);const timestamp=now();
  demo.skills=defaultSkills(WORKSPACE_MODES.JPR_DEMO);
  demo.settings={...demo.settings,workspaceMode:WORKSPACE_MODES.JPR_DEMO,demoPreset:"jpr",fictionalData:true,demoStage:"start"};
  demo.createdAt=timestamp;demo.updatedAt=timestamp;return demo;
}

function migrateV1(raw, workspaceId = WORKSPACE_MODES.NORMAL) {
  const migrated = emptyState(workspaceId);
  migrated.zones = (raw.accounts || []).slice(0,MAX_ZONES).map((account,index) => createZone({
    name:account.name || `主任务 ${index + 1}`, purpose:account.subtitle || "", motherGoal:account.subtitle || "", summary:account.collapsed ? "暂停中" : "正在推进",
    paused:Boolean(account.collapsed), color:account.color || COLORS[index % COLORS.length], projects:(account.modules || []).map(module => ({
      name:module.name, purpose:`${module.name} 次级项目`, goal:module.buckets?.goal?.[0]?.text || "", currentState:module.buckets?.doing?.map(item => item.text).join("；") || "等待继续",
      inProgress:module.buckets?.doing?.map(item => item.text) || [], nextActions:module.buckets?.next?.map(item => item.text) || [], color:account.color || COLORS[index % COLORS.length]
    }))
  },workspaceId));
  addDefaultLinkForKnownZones(migrated);
  return migrated;
}

function migrateV2(raw, workspaceId = WORKSPACE_MODES.NORMAL) {
  const migrated = emptyState(workspaceId);
  const groups = [
    { name:"产品开发", purpose:"产品与原型开发", pattern:/开发|原型|工具|产品|实验/i, projects:[] },
    { name:"内容运营", purpose:"内容发布与数据复盘", pattern:/内容|发布|复盘|数据|成本|收入|资产/i, projects:[] },
    { name:"业务改进", purpose:"业务流程与案例改进", pattern:/业务|流程|店铺|案例|诊断/i, projects:[] }
  ];
  const other = [];
  (raw.tasks || []).forEach(task => { const group = groups.find(item => item.pattern.test(task.name || "")); (group ? group.projects : other).push(task); });
  groups.filter(group => group.projects.length).forEach((group,index) => migrated.zones.push(createZone({ name:group.name, purpose:group.purpose, motherGoal:group.purpose, summary:group.projects[0].currentState || "正在推进", color:COLORS[index], projects:group.projects },workspaceId)));
  if (other.length && migrated.zones.length < MAX_ZONES) migrated.zones.push(createZone({ name:"其他项目", purpose:"待重新归类的已有项目", motherGoal:"确认这些项目所属的长期方向", summary:`已迁移 ${other.length} 个项目`, color:COLORS[migrated.zones.length], projects:other },workspaceId));
  addDefaultLinkForKnownZones(migrated);
  return migrated;
}

function addDefaultLinkForKnownZones(target) {
  const [zone1,zone2] = target.zones;
  if (zone1 && zone2) { const timestamp=now(); target.zoneLinks.push({ id:uid("link"), workspaceId:target.workspaceId||workspaceMode, sourceZoneId:zone1.id, targetZoneId:zone2.id, scopes:["SHARE_PROGRESS","SHARE_CONTENT","SHARE_METRICS"], createdAt:timestamp, updatedAt:timestamp }); }
}

function migrateAny(raw, workspaceId = workspaceMode) {
  if (raw?.schemaVersion === 2 && raw.workspace) return normalizeCurrent(raw.workspace,workspaceId);
  if (Array.isArray(raw.zones)) return normalizeCurrent(raw,workspaceId);
  if (Array.isArray(raw.accounts)) return migrateV1(raw,workspaceId);
  if (Array.isArray(raw.tasks)) return migrateV2(raw,workspaceId);
  throw new Error("无法识别的数据格式");
}

function loadLegacyState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY); if (current) return normalizeCurrent(JSON.parse(current),WORKSPACE_MODES.NORMAL);
    const v2 = localStorage.getItem(V2_KEY); if (v2) return migrateV2(JSON.parse(v2),WORKSPACE_MODES.NORMAL);
    const v1 = localStorage.getItem(V1_KEY); if (v1) return migrateV1(JSON.parse(v1),WORKSPACE_MODES.NORMAL);
  } catch {}
  return emptyState(WORKSPACE_MODES.NORMAL);
}

function save() {
  state.updatedAt = now();
  state.workspaceId=workspaceMode;state.settings={...(state.settings||{}),workspaceMode};
  localStorage.setItem(UI_STORAGE_KEY,JSON.stringify({ view:ui.view,zoneId:ui.zoneId,projectId:ui.projectId,skillFilter:ui.skillFilter }));
  if(!IS_JPR_PAGE)localStorage.setItem(WORKSPACE_MODE_KEY,workspaceMode);
  const snapshot=clone(state);
  const targetWorkspace=workspaceMode;
  saveQueue=saveQueue.then(()=>storageAdapter.saveWorkspace(snapshot,targetWorkspace)).catch(error=>{ console.error("本地保存失败",error); showToast("本地保存失败，请立即导出备份"); });
  return saveQueue;
}

function resetUi() { ui={view:"dashboard",zoneId:null,projectId:null,detailTab:"memory",addKind:"zone",showOtherZones:false,showAllProjects:false,showArchivedZones:false,showArchivedProjects:false,dashboardStat:null,todaySummaryOpen:false,inspirationOpen:false,inspirationSelectedId:null,skillFilter:ui.skillFilter||"all",historyManage:false,selectedHistoryIds:[]}; }

function isJprDemoWorkspace(mode=workspaceMode){return mode===WORKSPACE_MODES.JPR_DEMO}
function isDemoWorkspace(mode=workspaceMode){return mode===WORKSPACE_MODES.DEMO||isJprDemoWorkspace(mode)}
function dashboardInspirationDraft(){return localStorage.getItem(`${INSPIRATION_DRAFT_KEY}${workspaceMode}`)||""}
function persistDashboardInspirationDraft(value){const key=`${INSPIRATION_DRAFT_KEY}${workspaceMode}`;if(value)localStorage.setItem(key,value);else localStorage.removeItem(key)}
function updateStaticWorkspaceCopy(){const isJpr=isJprDemoWorkspace();document.documentElement.lang=isJpr?"ja":"zh-CN";document.querySelectorAll("[data-jpr-text]").forEach(node=>{if(!node.dataset.normalText)node.dataset.normalText=node.textContent;node.textContent=isJpr?node.dataset.jprText:node.dataset.normalText});document.querySelectorAll("[data-jpr-placeholder]").forEach(node=>{if(!node.dataset.normalPlaceholder)node.dataset.normalPlaceholder=node.getAttribute("placeholder")||"";node.setAttribute("placeholder",isJpr?node.dataset.jprPlaceholder:node.dataset.normalPlaceholder)});document.querySelectorAll("[data-jpr-aria]").forEach(node=>{if(!node.dataset.normalAria)node.dataset.normalAria=node.getAttribute("aria-label")||"";node.setAttribute("aria-label",isJpr?node.dataset.jprAria:node.dataset.normalAria)})}

function updateWorkspaceChrome() {
  const isDemo=isDemoWorkspace();const isJpr=isJprDemoWorkspace();
  updateStaticWorkspaceCopy();
  document.body.dataset.workspaceMode=isJpr?"jpr-demo":isDemo?"demo":"normal";
  byId("demo-environment-badge").hidden=!isDemo;
  byId("demo-environment-badge").textContent=isJpr?"JPR DEMO / 架空データ":"DEMO / 演示环境";
  byId("demo-mode-button").textContent=isJpr?"通常版を開く":isDemo?"退出演示模式":"演示模式";
  byId("demo-mode-button").classList.toggle("is-exit",isDemo);
  byId("home-button").setAttribute("aria-label",isJpr?"ホームに戻る":"返回主任务首页");
  byId("tools-button").textContent=isJpr?"スキル":"技能库";
  if(byId("jpr-demo-button"))byId("jpr-demo-button").hidden=isJpr;
  byId("tools-button").hidden=false;
  byId("export-button").hidden=isJpr;
  byId("import-button").hidden=isJpr;
  byId("reset-demo-button").hidden=!isDemo;
  byId("export-demo-button").hidden=!isDemo;
  byId("reset-demo-button").textContent=isJpr?"デモをリセット":"重置演示数据";
  byId("export-demo-button").textContent=isJpr?"デモ状態を出力":"导出演示状态";
  byId("fill-jpr-review-sample").hidden=!isJpr;
  byId("reset-demo-title").textContent=isJpr?"JPRデモをリセット":"重置演示数据";
  byId("reset-demo-message").textContent=isJpr?"JPRデモの変更を消去し、最初の状態に戻しますか？":"确定清空全部演示数据并恢复初始 Demo 状态吗？";
  byId("reset-demo-note").textContent=isJpr?"正式Workspaceと通常デモには影響しません。":"只会重置演示工作区，正式项目存档不会改变。";
  byId("cancel-reset-demo").textContent=isJpr?"キャンセル":"取消";
  byId("confirm-reset-demo").textContent=isJpr?"リセット":"重置演示数据";
  document.title=isJpr?"JPR向けデモ · Project OS":isDemo?"演示环境 · 项目存档驾驶舱":"项目存档驾驶舱";
}

async function switchWorkspace(targetMode) {
  if(targetMode===workspaceMode)return;
  const previousSkills=clone(state.skills||[]);
  await save();
  workspaceMode=targetMode;
  let stored=await storageAdapter.loadWorkspace(targetMode);
  if(!stored&&targetMode===WORKSPACE_MODES.DEMO){stored=demoInitialState(previousSkills);await storageAdapter.saveWorkspace(clone(stored),targetMode)}
  if(!stored&&targetMode===WORKSPACE_MODES.JPR_DEMO){stored=jprDemoState();await storageAdapter.saveWorkspace(clone(stored),targetMode)}
  state=stored?normalizeCurrent(stored,targetMode):emptyState(targetMode);
  restoreSessionDraftMirrors();
  resetUi();updateWorkspaceChrome();await save();render();
}

async function initialize() {
  try {
    try { const preferences=JSON.parse(localStorage.getItem(UI_STORAGE_KEY)||"{}"); if(["all","installed","self","external"].includes(preferences.skillFilter))ui.skillFilter=preferences.skillFilter; } catch {}
    if(IS_JPR_PAGE){
      workspaceMode=WORKSPACE_MODES.JPR_DEMO;
      const jprStored=await storageAdapter.loadWorkspace(WORKSPACE_MODES.JPR_DEMO);
      state=jprStored?normalizeCurrent(jprStored,WORKSPACE_MODES.JPR_DEMO):jprBlankState();
      await storageAdapter.saveWorkspace(clone(state),WORKSPACE_MODES.JPR_DEMO);
    }else{
      const normalStored=await storageAdapter.loadWorkspace(WORKSPACE_MODES.NORMAL);
      const normalState=normalStored ? migrateAny(normalStored,WORKSPACE_MODES.NORMAL) : loadLegacyState();
      await storageAdapter.saveWorkspace(clone(normalState),WORKSPACE_MODES.NORMAL);
      const preferred=localStorage.getItem(WORKSPACE_MODE_KEY);
      workspaceMode=preferred===WORKSPACE_MODES.DEMO?WORKSPACE_MODES.DEMO:WORKSPACE_MODES.NORMAL;
      if(workspaceMode===WORKSPACE_MODES.DEMO){const demoStored=await storageAdapter.loadWorkspace(WORKSPACE_MODES.DEMO);state=demoStored?normalizeCurrent(demoStored,WORKSPACE_MODES.DEMO):demoInitialState(normalState.skills);await storageAdapter.saveWorkspace(clone(state),WORKSPACE_MODES.DEMO)}else state=normalState;
    }
  } catch(error) {
    console.error("本地数据库初始化失败",error);
    workspaceMode=WORKSPACE_MODES.NORMAL;
    state=loadLegacyState();
  }
  restoreSessionDraftMirrors();
  updateWorkspaceChrome();
  render();
}
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
function currentZone() { return state.zones.find(zone => zone.id === ui.zoneId); }
function currentProject() { return currentZone()?.projects.find(project => project.id === ui.projectId); }
function activeSession(project) { return [...(project?.sessions || [])].reverse().find(session => !session.endedAt); }
function sessionDraft(session,section){return session?.drafts?.[section]||null}
function writeSessionDraftMirror(session){if(!session||session.endedAt)return;sessionDraftStore.save({workspaceId:session.workspaceId||workspaceMode,projectId:session.projectId,sessionId:session.id,notes:session.notes||"",drafts:clone(session.drafts||{}),updatedAt:session.updatedAt||now()})}
function restoreSessionDraftMirrors(){state.zones.forEach(zone=>zone.projects.forEach(project=>{const session=activeSession(project);if(!session)return;const mirror=sessionDraftStore.load(session.workspaceId||workspaceMode,session.id);if(!mirror)return;session.notes=mirror.notes??session.notes;session.drafts={...(session.drafts||{}),...(mirror.drafts||{})};if(new Date(mirror.updatedAt||0)>=new Date(session.updatedAt||0))session.updatedAt=mirror.updatedAt}))}
function persistSessionDraft(section,value,session=activeSession(currentProject())){if(!session)return;const timestamp=now();session.drafts={...(session.drafts||{}),[section]:clone(value)};session.updatedAt=timestamp;writeSessionDraftMirror(session);save()}
function clearSessionDraft(section,session=activeSession(currentProject())){if(!session)return;session.drafts={...(session.drafts||{})};delete session.drafts[section];session.updatedAt=now();writeSessionDraftMirror(session);save()}
function clearSessionRecovery(session){if(!session)return;session.drafts={};sessionDraftStore.remove(session.workspaceId||workspaceMode,session.id)}
function countsAsFormal(session) { return !session.isDemo || session.promotedToFormal; }
function formalSessions(project) { return (project?.sessions || []).filter(countsAsFormal); }
function lastEndedSession(project) { return [...formalSessions(project)].reverse().find(session => session.endedAt); }
function formatDate(value) { if (!value) return isJprDemoWorkspace()?"未開始":"尚未开始"; return new Intl.DateTimeFormat(isJprDemoWorkspace()?"ja-JP":"zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value)); }
function latestWork(project) { return lastEndedSession(project)?.completed?.[0] || project.importedMilestones?.at(-1)?.summary || project.completed.at(-1) || "尚无工作记录"; }
function nextAction(project) { return project.nextActions[0] || project.inProgress[0] || project.goal || "先定义当前目标"; }
function taskStatus(task) { return window.ProjectOSLifecycle.normalizeTaskStatus(task?.status,task?.paused); }
function taskStatusLabel(task) { return window.ProjectOSLifecycle.taskStatusLabel(taskStatus(task)); }
function isActiveTask(task) { return taskStatus(task)===TASK_STATUS.ACTIVE; }
function recentProject(zone,{activeOnly=true}={}) { const items=activeOnly?zone.projects.filter(isActiveTask):zone.projects;return [...items].sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]; }
function linkedFor(zoneId) { return state.zoneLinks.filter(link => link.sourceZoneId === zoneId || link.targetZoneId === zoneId); }
function linkedZone(link, zoneId) { return state.zones.find(zone => zone.id === (link.sourceZoneId === zoneId ? link.targetZoneId : link.sourceZoneId)); }
function timestampOf(value) { const parsed=new Date(value||0).getTime(); return Number.isFinite(parsed)?parsed:0; }
function zoneIsInProgress(zone) { return isActiveTask(zone) && zone.projects.some(project => isActiveTask(project)&&(project.inProgress.length || formalSessions(project).some(session => !session.endedAt))); }
function zoneLastUpdated(zone) { return Math.max(timestampOf(zone.updatedAt),...zone.projects.map(project=>timestampOf(project.updatedAt))); }

function dashboardRecommendation() {
  const entries=state.zones.filter(isActiveTask).flatMap(zone=>zone.projects.filter(isActiveTask).map(project=>({zone,project})));
  const active=entries.filter(({project})=>formalSessions(project).some(session=>!session.endedAt)).sort((a,b)=>timestampOf(b.project.updatedAt)-timestampOf(a.project.updatedAt))[0];
  if(active)return{...active,reason:"这里还有进行中的本次工作，先收束它最能减少上下文切换。",rule:"优先续接未结束的工作"};
  const actionable=entries.filter(({project})=>project.nextActions.length||project.inProgress.length||project.openIssues.length).sort((a,b)=>timestampOf(a.project.updatedAt)-timestampOf(b.project.updatedAt))[0];
  if(actionable)return{...actionable,reason:"它已经有明确下一步，并且等待推进的时间相对更久。",rule:"明确下一步 + 等待时间"};
  const zone=[...state.zones].filter(isActiveTask).sort((a,b)=>zoneLastUpdated(b)-zoneLastUpdated(a))[0];
  return zone?{zone,project:recentProject(zone),reason:"当前没有明确未完成动作，先从最近活跃方向恢复背景最省力。",rule:"最近活跃方向"}:null;
}

function dashboardActivities() {
  const activities=[];
  state.zones.forEach(zone=>zone.projects.forEach(project=>{
    const sessions=formalSessions(project);
    sessions.forEach(session=>activities.push({at:session.endedAt||session.updatedAt||session.startedAt,zone,project,text:session.summary?.split("\n")[0]||session.completed?.[0]||session.goal||"更新了工作记录"}));
    if(!sessions.length)activities.push({at:project.updatedAt,zone,project,text:project.currentState||`已建立次级项目：${project.name}`});
  }));
  state.zones.filter(zone=>!zone.projects.length).forEach(zone=>activities.push({at:zone.updatedAt,zone,project:null,text:zone.summary||"主任务等待补充次级项目"}));
  return activities.filter(item=>item.at).sort((a,b)=>timestampOf(b.at)-timestampOf(a.at)).slice(0,3);
}

function dashboardPauseSuggestion(recommendation) {
  const paused=state.zones.find(zone=>taskStatus(zone)===TASK_STATUS.PAUSED);
  if(paused)return{zone:paused,reason:"它处于短期暂停，不会进入今日优先推荐。"};
  const quiet=state.zones.find(zone=>isActiveTask(zone)&&zone.id!==recommendation?.zone?.id&&!zone.projects.some(project=>isActiveTask(project)&&(project.nextActions.length||project.inProgress.length)));
  return quiet?{zone:quiet,reason:"目前没有明确要启动的新动作，可以继续保持待启动。"}:null;
}

function projectStage(project, zone = currentZone()) {
  if(zone&&!isActiveTask(zone))return taskStatusLabel(zone);
  if(!isActiveTask(project))return taskStatusLabel(project);
  if(project.currentPhase)return window.ProjectOSBootstrap.phaseLabel(project.currentPhase);
  if(activeSession(project)||project.inProgress.length)return"进行中";
  if(project.openIssues.length)return"进行中";
  if(/验证|测试|复盘/.test(`${project.currentState} ${project.nextActions.join(" ")}`))return"等待验证";
  if(project.completed.length&&!project.nextActions.length)return"等待验证";
  return project.sessions.length||project.nextActions.length?"进行中":"规划中";
}
function zoneStage(zone) {
  if(!isActiveTask(zone))return taskStatusLabel(zone);
  if(!zone.projects.length)return"规划中";
  const stages=zone.projects.map(project=>projectStage(project,zone));
  if(stages.some(stage=>["进行中","探索阶段","原型阶段"].includes(stage)))return"进行中";
  if(stages.some(stage=>["等待验证","验证阶段","稳定化阶段","可交付阶段"].includes(stage)))return"等待验证";
  if(stages.every(stage=>stage==="已完成"))return"等待验证";
  return"规划中";
}
function phaseTrack(stage) { const steps={"规划中":1,"构想阶段":1,"探索阶段":1,"原型阶段":2,"进行中":2,"等待验证":3,"验证阶段":3,"稳定化阶段":3,"可交付阶段":4,"已完成":4,"已暂停":0,"已冻结":0,"暂停 / 待重新评估":0}; const active=steps[stage]||0; return `<div class="phase-track ${active===0?"is-paused":""}" aria-label="当前阶段：${stage}">${[1,2,3,4].map(step=>`<i class="${step<=active?"is-active":""}"></i>`).join("")}</div>`; }
function workspaceStats() {
  const projects=state.zones.flatMap(zone=>zone.projects);
  const sessions=projects.flatMap(project=>formalSessions(project));
  const todayKey=new Date().toDateString();
  const todaySessions=sessions.filter(session=>new Date(session.startedAt||session.createdAt).toDateString()===todayKey);
  const completedSessions=sessions.filter(session=>session.endedAt);
  const currentDate=new Date();const mondayOffset=(currentDate.getDay()+6)%7;const weekStart=new Date(currentDate.getFullYear(),currentDate.getMonth(),currentDate.getDate()-mondayOffset).getTime();
  const focusSessions=window.ProjectOSLifecycle.confirmedFocusSessions(sessions,weekStart);
  const focusMinutes=window.ProjectOSLifecycle.confirmedFocusMinutes(sessions,weekStart);
  const focusMs=focusMinutes*60000;
  const activeProjects=state.zones.filter(isActiveTask).flatMap(zone=>zone.projects.filter(isActiveTask)).length;
  return{projects,sessions,today:todaySessions.length,completed:completedSessions.length,activeProjects,focus:focusMinutes?`${(focusMinutes/60).toFixed(1)}h`:"—",todaySessions,completedSessions,focusSessions,focusMs,focusMinutes,weekStart};
}

function dashboardSessionEntries() {
  return state.zones.flatMap(zone=>zone.projects.flatMap(project=>formalSessions(project).map(session=>({zone,project,session}))));
}

function todaySummaryEntries(referenceDate = new Date()) {
  return state.zones.flatMap(zone=>zone.projects.flatMap(project=>{
    const sessions=isDemoWorkspace()?project.sessions:formalSessions(project);
    return window.ProjectOSLifecycle.sessionsForLocalDay(sessions,referenceDate).map(session=>({zone,project,session}));
  })).sort((a,b)=>timestampOf(a.session.startedAt||a.session.createdAt)-timestampOf(b.session.startedAt||b.session.createdAt));
}

function uniqueText(values) {
  return [...new Set(values.flatMap(value=>Array.isArray(value)?value:[value]).map(value=>String(value||"").trim()).filter(Boolean))];
}

function todaySummaryLines(session) {
  const completed=uniqueText([session.completed,session.todos?.filter(todo=>todo.completed).map(todo=>todo.text)]);
  const remaining=uniqueText([session.remainingIssues,session.todos?.filter(todo=>!todo.completed).map(todo=>todo.text)]);
  const progress=uniqueText([session.progressSummary]);
  const isJpr=isJprDemoWorkspace();
  const status=session.endedAt?(isJpr?"完了":"已结束"):session.status==="PAUSED"?(isJpr?"一時停止中":"已暂停"):(isJpr?"進行中":"进行中");
  const lines=[];
  if(progress.length)lines.push([isJpr?"現在地":"当前进展",progress.join("；")]);
  if(completed.length)lines.push([isJpr?"完了":"已完成",completed.join("；")]);
  if(remaining.length)lines.push([isJpr?"未完了":"待继续",remaining.join("；")]);
  if(session.nextStep)lines.push([isJpr?"次の一歩":"下一步",session.nextStep]);
  if(!lines.length)lines.push([status,session.goal||session.title||(isJpr?"作業内容は未記録です":"尚未记录任务内容")]);
  return{status,lines};
}

function projectMemoryText(memory) {
  return String(typeof memory==="string"?memory:memory?.text||"").trim();
}

function renderTodaySummary() {
  const entries=todaySummaryEntries();const isJpr=isJprDemoWorkspace();
  const labels=isJpr?{kicker:"今日のまとめ",title:"今日進めたタスク",note:"今日のタスク進捗だけを整理します。",close:"閉じる",empty:"今日の作業記録はまだありません。",memory:"関連するプロジェクトの記憶を見る",noMemory:"プロジェクトの記憶はまだありません。"}:{kicker:"今日总结",title:"今天推进的任务",note:"只整理今天的任务进展。",close:"收起",empty:"今天还没有任务记录。",memory:"横向查看相关项目记忆",noMemory:"尚未沉淀项目私有记忆。"};
  const projectMap=new Map();entries.forEach(({zone,project})=>projectMap.set(project.id,{zone,project}));
  const memoryCards=[...projectMap.values()].map(({zone,project})=>{const memories=uniqueText((project.projectMemory||[]).map(projectMemoryText));return`<article class="today-memory-card"><span>${escapeHtml(zone.name)}</span><strong>${escapeHtml(project.name)}</strong>${memories.length?`<ul>${memories.map(memory=>`<li>${escapeHtml(memory)}</li>`).join("")}</ul>`:`<p>${labels.noMemory}</p>`}</article>`}).join("");
  const rows=entries.map(({zone,project,session},index)=>{const summary=todaySummaryLines(session);return`<article class="today-summary-item"><span class="today-summary-number" aria-hidden="true">${index+1}</span><div class="today-summary-copy"><div class="today-summary-meta"><span>${escapeHtml(zone.name)} / ${escapeHtml(project.name)}</span><em>${summary.status}</em></div><h3>${escapeHtml(session.goal||session.title||(isJpr?"今回の作業":"本次工作"))}</h3><div class="today-summary-lines">${summary.lines.map(([label,value])=>`<p><strong>${label}</strong><span>${escapeHtml(value)}</span></p>`).join("")}</div></div></article>`}).join("");
  return`<section class="today-summary-panel" id="today-summary-panel" tabindex="-1"><div class="today-summary-head"><div><p class="section-kicker">${labels.kicker}</p><h2>${labels.title}</h2><span>${labels.note}</span></div><button class="text-button" data-action="today-summary">${labels.close}</button></div><div class="today-summary-list">${rows||`<p class="stat-detail-empty">${labels.empty}</p>`}</div>${entries.length?`<details class="today-memory-panel"><summary>${labels.memory} · ${projectMap.size}</summary><div class="today-memory-strip">${memoryCards}</div></details>`:""}</section>`;
}

function inspirationSource(item) {
  const zone=state.zones.find(entry=>entry.id===item.zoneId);
  const project=zone?.projects.find(entry=>entry.id===item.projectId);
  return{zone,project,label:project?`${zone.name} / ${project.name}`:item.projectName?`${item.zoneName||"原主任务"} / ${item.projectName}`:(isJprDemoWorkspace()?"ワークスペースのアイデア":"Workspace 灵感")};
}

function inspirationVisual(item) {
  const presetId=INSPIRATION_ORB_PRESETS.includes(item.orbPresetId)?item.orbPresetId:fallbackInspirationOrbPreset(item.id);
  return{presetId,presetNumber:INSPIRATION_ORB_PRESETS.indexOf(presetId)+1,label:INSPIRATION_ORB_LABELS[presetId]||"AI 球"};
}

function inspirationAiMeta(item,isJpr=false) {
  const labels=isJpr?{idle:"AI 接続待ち",thinking:"AI が分析中",ready:"AI から新しい反応",attention:"確認が必要",error:"AI は一時停止中"}:{idle:"等待 AI",thinking:"AI 分析中",ready:"AI 有新反馈",attention:"需要你确认",error:"AI 暂不可用"};
  const state=INSPIRATION_AI_STATES.includes(item.aiState)?item.aiState:"idle";
  return{state,label:labels[state]};
}

function nextInspirationOrbPresetId() {
  const counts=new Map(INSPIRATION_ORB_PRESETS.map(id=>[id,0]));
  (state.inspirations||[]).forEach(item=>{const id=INSPIRATION_ORB_PRESETS.includes(item.orbPresetId)?item.orbPresetId:fallbackInspirationOrbPreset(item.id);counts.set(id,(counts.get(id)||0)+1)});
  return INSPIRATION_ORB_PRESETS.reduce((selected,id)=>(counts.get(id)<counts.get(selected)?id:selected),INSPIRATION_ORB_PRESETS[0]);
}

function addInspiration(value,{zone=null,project=null,session=null}={}) {
  const textValue=String(value||"").trim();if(!textValue)return null;
  const existing=state.inspirations.find(item=>item.text.toLocaleLowerCase()===textValue.toLocaleLowerCase());
  if(existing)return existing;
  const timestamp=now();const item=normalizeInspiration({text:textValue,source:session?"session":"dashboard",zoneId:zone?.id||null,projectId:project?.id||null,sessionId:session?.id||null,zoneName:zone?.name||"",projectName:project?.name||"",orbPresetId:nextInspirationOrbPresetId(),aiState:"idle",createdAt:timestamp,updatedAt:timestamp},workspaceMode);
  state.inspirations.push(item);return item;
}

function renderInspirationLibrary() {
  const entries=[...(state.inspirations||[])].sort((a,b)=>timestampOf(b.updatedAt)-timestampOf(a.updatedAt));const isJpr=isJprDemoWorkspace();const open=ui.inspirationOpen;
  const labels=isJpr?{kicker:"ひらめきを育てる場所",title:"アイデアライブラリ",hint:"タスクや一時メモとは分けて、まだ形になっていない発想を残します。",expand:"アイデアを広げる",collapse:"閉じる",placeholder:"ふと思いついたこと…",add:"アイデアを追加",empty:"最初のアイデアをここに置いてみましょう。",selected:"選んだアイデア",source:"記録元",openProject:"プロジェクトを開く",workspace:"ホームから追加",orbIdentity:"AI オーブ",changeOrb:"このアイデアのオーブを変更"}:{kicker:"让想法先活下来",title:"灵感库",hint:"这里不放待办事项，只保存还没有定型、值得以后再看的想法。",expand:"展开灵感空间",collapse:"收起",placeholder:"刚刚冒出的想法…",add:"加入灵感库",empty:"这里还没有灵感。先记下一条没有被规划过的想法吧。",selected:"正在查看",source:"记录来源",openProject:"打开来源项目",workspace:"从首页添加",orbIdentity:"绑定的 AI 球",changeOrb:"更换这条灵感绑定的 AI 球"};
  const selected=entries.find(item=>item.id===ui.inspirationSelectedId);const selectedSource=selected?inspirationSource(selected):null;
  const bubbles=entries.map(item=>{const visual=inspirationVisual(item);const ai=inspirationAiMeta(item,isJpr);const active=item.id===ui.inspirationSelectedId;return`<button type="button" class="inspiration-bubble inspiration-orb-card ${active?"is-selected":""}" data-action="select-inspiration" data-inspiration-id="${escapeHtml(item.id)}" data-orb-preset="${visual.presetId}" data-ai-state="${ai.state}" aria-pressed="${active}" aria-label="${escapeHtml(item.text)}，${ai.label}"><span class="inspiration-orb-visual" data-orb-preset="${visual.presetId}"><canvas class="inspiration-orb-canvas" data-orb-preset="${visual.presetId}" data-ai-state="${ai.state}" aria-hidden="true"></canvas><span class="inspiration-orb-fallback" aria-hidden="true"></span></span><span class="inspiration-orb-title">${escapeHtml(item.text)}</span></button>`}).join("");
  const picker=selected?INSPIRATION_ORB_PRESETS.map((presetId,index)=>`<button type="button" class="inspiration-orb-choice ${selected.orbPresetId===presetId?"is-selected":""}" data-action="set-inspiration-orb" data-inspiration-id="${escapeHtml(selected.id)}" data-orb-preset="${presetId}" aria-label="${labels.changeOrb}：${INSPIRATION_ORB_LABELS[presetId]}"><i data-orb-preset="${presetId}" aria-hidden="true"></i><span>${isJpr?`オーブ ${index+1}`:`AI 球 ${index+1}`}</span></button>`).join(""):"";
  const detail=selected?`<aside class="inspiration-detail"><div class="inspiration-detail-main"><span>${labels.selected}</span><h3>${escapeHtml(selected.text)}</h3><p>${labels.source}：${escapeHtml(selectedSource.label)} · ${formatDate(selected.createdAt)}</p>${selected.aiSummary?`<p class="inspiration-ai-summary">${escapeHtml(selected.aiSummary)}</p>`:""}</div><div class="inspiration-orb-picker"><span>${labels.orbIdentity}</span><div>${picker}</div></div>${selectedSource.project?`<button class="soft-button" data-action="open-project" data-zone-id="${selectedSource.zone.id}" data-project-id="${selectedSource.project.id}">${labels.openProject}</button>`:""}</aside>`:"";
  return`<section class="inspiration-library ${open?"is-open":"is-collapsed"}" id="inspiration-library"><button type="button" class="inspiration-library-head" data-action="toggle-inspiration-library" aria-expanded="${open}" aria-controls="inspiration-library-body"><div><p class="section-kicker">${labels.kicker}</p><h2>${labels.title}</h2><span>${labels.hint}</span></div><div class="inspiration-head-meta"><span class="inspiration-count">${entries.length}</span><strong>${open?labels.collapse:labels.expand}</strong></div></button>${open?`<div class="inspiration-library-body" id="inspiration-library-body"><form class="inspiration-capture" data-inspiration-form="dashboard"><label for="dashboard-inspiration-input">${labels.workspace}</label><div><input id="dashboard-inspiration-input" autocomplete="off" placeholder="${labels.placeholder}" value="${escapeHtml(dashboardInspirationDraft())}"><button class="primary-button" type="submit">${labels.add}</button></div></form><div class="inspiration-bubble-space">${bubbles||`<p class="inspiration-empty">${labels.empty}</p>`}</div>${detail}</div>`:""}</section>`;
}

function renderDashboardStatDetail(stats) {
  const mode=ui.dashboardStat;if(!mode)return"";
  const sessionEntries=dashboardSessionEntries();
  const renderEmpty=message=>`<p class="stat-detail-empty">${escapeHtml(message)}</p>`;
  const renderProjectRow=({zone,project})=>`<article class="stat-detail-row"><div><span>${escapeHtml(zone.name)}</span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.currentState||"尚未记录状态")}</small></div><button class="soft-button" data-action="open-project" data-zone-id="${zone.id}" data-project-id="${project.id}">进入项目</button></article>`;
  const renderSessionRow=({zone,project,session},showDuration=false)=>{const number=Math.max(1,project.sessions.indexOf(session)+1);const durationMinutes=Number.isFinite(Number(session.focusMinutes))?Math.max(0,Math.round(Number(session.focusMinutes))):null;return`<article class="stat-detail-row"><div><span>${escapeHtml(zone.name)} / ${escapeHtml(project.name)}</span><strong>No.${number} · ${escapeHtml(session.title||session.goal||"本次工作记录")}</strong><small>${session.endedAt?`已结束 · ${formatDate(session.endedAt)}`:`进行中 · ${formatDate(session.startedAt)}`}${showDuration?durationMinutes===null?" · 专注时长未确认":` · 已确认专注 ${durationMinutes} 分钟`:""}</small></div><button class="soft-button" data-action="open-project" data-zone-id="${zone.id}" data-project-id="${project.id}">查看项目</button></article>`};
  let title="";let note="";let content="";
  if(mode==="zones"){
    title="主任务列表";note=`共 ${state.zones.length} 个主任务`;
    content=state.zones.length?state.zones.map(zone=>`<article class="stat-detail-row"><div><span>${taskStatusLabel(zone)}</span><strong>${escapeHtml(zone.name)}</strong><small>${escapeHtml(zone.purpose||zone.summary||"尚未补充方向说明")}</small></div><button class="soft-button" data-action="open-zone" data-zone-id="${zone.id}">进入主任务</button></article>`).join(""):renderEmpty("还没有主任务。");
  }else if(mode==="active-projects"){
    title="活跃项目列表";const entries=state.zones.filter(isActiveTask).flatMap(zone=>zone.projects.filter(isActiveTask).map(project=>({zone,project})));note=`共 ${entries.length} 个活跃次级项目`;content=entries.length?entries.map(renderProjectRow).join(""):renderEmpty("当前没有活跃次级项目。");
  }else if(mode==="today"){
    title="今日 Session";const entries=sessionEntries.filter(({session})=>stats.todaySessions.includes(session));note=`按本地日期统计 · ${entries.length} 条`;content=entries.length?entries.map(entry=>renderSessionRow(entry)).join(""):renderEmpty("今天还没有 Session。");
  }else if(mode==="completed"){
    title="已完成 Session";const entries=sessionEntries.filter(({session})=>stats.completedSessions.includes(session)).sort((a,b)=>timestampOf(b.session.endedAt)-timestampOf(a.session.endedAt));note=`共 ${entries.length} 条已结束记录`;content=entries.length?entries.map(entry=>renderSessionRow(entry)).join(""):renderEmpty("还没有已完成 Session。");
  }else{
    title="本周专注明细";const entries=sessionEntries.filter(({session})=>stats.focusSessions.includes(session)).sort((a,b)=>timestampOf(b.session.endedAt)-timestampOf(a.session.endedAt));note=`已人工确认 ${stats.focusMinutes} 分钟 · ${stats.focus}`;content=entries.length?entries.map(entry=>renderSessionRow(entry,true)).join(""):renderEmpty("本周还没有人工确认过专注时长的已结束 Session。");
  }
  return`<section class="stat-detail-panel" id="dashboard-stat-detail" tabindex="-1"><div class="stat-detail-head"><div><p class="section-kicker">统计筛选</p><h2>${title}</h2><span>${escapeHtml(note)}</span></div><button class="text-button" data-action="close-dashboard-stat">收起</button></div><div class="stat-detail-list">${content}</div></section>`;
}

const JPR_DYNAMIC_COPY = new Map([
  ["独立演示工作区 · 本机隔离","JPR向けデモ · 架空データ"],["我现在该推进什么？","今、何を進める？"],["先选主任务，再进入次级项目，恢复背景后开始本次工作。","メインテーマを選び、プロジェクトの状態を確認して今回の作業を始めます。"],["＋ 追加主任务","＋ メインテーマを追加"],["总结今天","今日をまとめる"],["收起今日总结","今日のまとめを閉じる"],
  ["主任务","メインテーマ"],["活跃次级项目","進行中のプロジェクト"],["今日工作","今日の作業"],["已完成工作","完了した作業"],["查看列表 →","一覧を見る →"],["筛选项目 →","プロジェクトを見る →"],["查看今日 →","今日の記録を見る →"],["查看历史 →","履歴を見る →"],
  ["今日建议","次に進める候補"],["本地规则生成","ローカルルールで整理"],["主任务入口","メインテーマ"],["选择一个大方向","長期的に取り組む方向を選ぶ"],["默认只显示进行中的主任务","進行中のメインテーマを表示"],["最近动态","最近の状態"],["刚刚发生了什么","前回までに何が起きたか"],["今日判断","進め方の判断"],["推进与暂缓","進める・保留する"],["自动整理","ローカル整理"],["推进","進める"],["暂缓","保留"],["提示","ヒント"],["今天只收束一个方向","一度に一つの方向を完了させる"],["完成一个闭环后，再切换到下一条主线。","一つの作業を閉じてから、次のテーマへ移ります。"],["这是本地规则建议，不会把项目数据发送到云端。","ローカルルールによる提案です。プロジェクトデータはクラウドへ送信されません。"],
  ["次级项目","プロジェクト"],["最近活跃","最近のプロジェクト"],["最近一次工作","前回の作業"],["下一步","次の一歩"],["总体状态","現在地"],["主任务链路","メインテーマの関連"],["当前保持隔离","現在は独立しています"],["进入主任务","メインテーマを開く"],["← 返回主任务驾驶舱","← ホームに戻る"],["母目标","長期的な目標"],["＋ 追加次级项目","＋ プロジェクトを追加"],["选择要继续的项目","前回の続きから再開する"],["继续 →","開く →"],["任务操作","タスク操作"],["背景共享边界","背景共有の範囲"],["关联主任务","関連するメインテーマ"],["管理关联","関連を管理"],["没有与其他主任务共享背景或进度。","他のメインテーマとは背景や進捗を共有していません。"],
  ["项目续接","プロジェクト・レジューム"],["行动指示","次のアクション"],["项目状态","プロジェクトの状態"],["最新进度","最新の進捗"],["当前目标","現在の目標"],["当前状态","現在の状態"],["当前阶段","現在のフェーズ"],["已完成阶段","完了したこと"],["推荐下一步","次の一歩"],["最后更新时间","最終更新"],["当前没有进行中的工作","現在進行中の作業はありません"],["本次工作进行中","今回の作業"],["进入任务","今回の作業を開始"],["继续任务","前回の続きから再開"],["编辑","編集"],["编辑状态","状態を編集"],["编辑阶段","フェーズを編集"],["编辑目的","目的を編集"],["关闭","閉じる"],["项目背景","プロジェクト情報"],["项目私有记忆","プロジェクトの記憶"],["主任务共享记忆","メインテーマの共有記憶"],["工作历史","作業履歴"],["待办池","バックログ"],["暂存区","一時メモ"],["项目暂存","プロジェクト一時メモ"],["项目暂存事项","プロジェクトの一時メモ"],["常用技能","よく使うスキル"],["管理","管理"],
  ["当前问题 / 阻塞","現在の問題 / ブロッカー"],["当前问题","現在の問題"],["当前阻塞","現在のブロッカー"],["暂无已确认问题","確認済みの問題はありません"],["当前无明确阻塞","現在、明確なブロッカーはありません"],["尚未确认哪些问题会阻塞推进","どの問題が進行を妨げるか未確認です"],["确认一个阻塞","ブロッカーを確認"],["记录一个问题","問題を記録"],["＋ 记录问题","＋ 問題を記録"],["未解决","未解決"],["已解决","解決済み"],["稍后处理","後で対応"],["删除问题","問題を削除"],["恢复为未解决","未解決に戻す"],["标记为已解决","解決済みにする"],
  ["← 返回项目续接","← プロジェクトの状態に戻る"],["今日只做","今回やること"],["本次工作笔记","今回のメモ"],["主行动","最優先"],["可选","任意"],["完成事项","完了にする"],["恢复事项","未完了に戻す"],["🆘 我卡住了","AIに相談"],["🧭 现状总结","現状を整理"],["总结工作","作業をまとめる"],["暂停本次工作","今回の作業を一時停止"],["本次工作已暂停","今回の作業は一時停止中"],["结束本次工作","今回の作業を終了"],["存下","保存"],["聚焦","JPR DEMO"],["演示项目暂存","デモ用プロジェクト一時メモ"],["私有","プロジェクト専用"],["任务、Bug 和以后要处理的事项，只保留在当前项目内。","タスク、バグ、後で対応する項目は、このプロジェクト内だけに保存します。"],["稍后要处理的事…","後で対応すること…"],["这里的内容不会自动出现在灵感库。","ここに保存した項目は、アイデアライブラリには自動で入りません。"],["灵感库","アイデアライブラリ"],["还没成为任务的点子，可以单独留下来慢慢长大。","まだタスクになっていない発想を、別に残して育てます。"],["刚刚冒出的想法…","ふと思いついたこと…"],["加入灵感库","アイデアを追加"],["只属于当前项目，不会自动进入 Workspace 灵感库。","このプロジェクトだけに属し、Workspaceのアイデアライブラリには自動で入りません。"],["暂时没有项目暂存事项。","プロジェクトの一時メモはまだありません。"],["记录本次变化、修改内容、测试或验收结果…","変更内容、テスト、確認結果を記録します…"],["总结工作只会把已勾选完成项、这里记录的事实和本次已确认写回作为证据。","「作業をまとめる」は、完了チェック、ここに記録した事実、今回確認して反映した変更だけを証拠にします。"],
  ["进行中","進行中"],["已暂停","一時停止"],["已冻结","凍結"],["已完成","完了"],["编辑任务","タスクを編集"],["暂停任务","一時停止"],["冻结任务","凍結"],["标记完成","完了にする"],["重新开启","再開"],["查看存档","履歴を見る"],["永久删除","完全に削除"],["验证阶段","検証フェーズ"],["构想阶段","構想フェーズ"],["探索阶段","探索フェーズ"],["原型阶段","プロトタイプ"],["稳定化阶段","安定化フェーズ"],["可交付阶段","提供準備"],["规划中","計画中"],["等待验证","検証待ち"],
  ["这里还有进行中的本次工作，先收束它最能减少上下文切换。","進行中の作業を先に終えると、コンテキスト切り替えを減らせます。"],["优先续接未结束的工作","未完了の作業を優先"],["它已经有明确下一步，并且等待推进的时间相对更久。","次の一歩が明確で、前回から時間が空いているためです。"],["明确下一步 + 等待时间","明確な次の一歩 + 経過時間"],["当前没有明确未完成动作，先从最近活跃方向恢复背景最省力。","明確な未完了作業がないため、最近のテーマから状態を確認します。"],["最近活跃方向","最近更新したテーマ"],
  ["即使没有工作记录，也保留这个项目","作業記録がなくても、このプロジェクトを残す"],["适合暂停中、待启动或只建立框架的长期项目。","一時停止中、開始待ち、または枠組みだけを残す長期プロジェクトに適しています。"],["尚未沉淀项目私有记忆。","プロジェクトの記憶はまだありません。"],["当前主任务没有共享记忆。","メインテーマの共有記憶はありません。"],
  ["尚无项目","まだありません"],["等待推进","開始待ち"],["尚无工作记录","作業記録はありません"],["先定义当前目标","現在の目標を決める"],["尚未定义","未設定"],["尚未补充方向说明","説明は未設定です"],["尚未补充项目目的","目的は未設定です"],["尚无完成记录","完了記録はありません"],["尚未记录","未記録"],["尚未设置常用能力。","よく使うスキルは未設定です。"]
]);
const JPR_PHASE_COPY={"构想阶段":"構想フェーズ","探索阶段":"探索フェーズ","原型阶段":"プロトタイプ","验证阶段":"検証フェーズ","稳定化阶段":"安定化フェーズ","可交付阶段":"提供準備","进行中":"進行中","等待验证":"検証待ち","规划中":"計画中"};
function translateJprText(value){
  const source=String(value||"").trim();if(!source)return value;
  let translated=JPR_DYNAMIC_COPY.get(source);
  if(!translated){
    let match;
    if((match=source.match(/^主任务 (\d{2})$/)))translated=`メインテーマ ${match[1]}`;
    else if((match=source.match(/^项目 (\d{2})$/)))translated=`プロジェクト ${match[1]}`;
    else if((match=source.match(/^进行中项目 · (\d+)$/)))translated=`進行中のプロジェクト · ${match[1]}件`;
    else if((match=source.match(/^当前阶段 · (.+)$/)))translated=`現在のフェーズ · ${JPR_PHASE_COPY[match[1]]||match[1]}`;
    else if((match=source.match(/^所属主任务：(.+)$/)))translated=`メインテーマ：${match[1]}`;
    else if((match=source.match(/^(\d+) \/ (\d+) 完成$/)))translated=`${match[1]} / ${match[2]} 完了`;
    else if((match=source.match(/^次级项目 · (\d+)$/)))translated=`プロジェクト · ${match[1]}件`;
    else if((match=source.match(/^主任务 \/ (.+)$/)))translated=`メインテーマ / ${match[1]}`;
    else if((match=source.match(/^(\d+) 个$/)))translated=`${match[1]}件`;
    else if((match=source.match(/^当前阶段：(.+)$/)))translated=`現在のフェーズ：${JPR_PHASE_COPY[match[1]]||match[1]}`;
    else if((match=source.match(/^建议优先推进：(.+)$/)))translated=`次に進める候補：${match[1]}`;
    else if((match=source.match(/^判断依据：(.+)$/)))translated=`判断基準：${match[1]}`;
    else if((match=source.match(/^← 返回(.+)$/)))translated=`← ${match[1]}に戻る`;
  }
  return translated?value.replace(source,translated):value;
}
function translateJprRenderedCopy(root=app){
  if(!isJprDemoWorkspace()||!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))node.nodeValue=translateJprText(node.nodeValue);
  root.querySelectorAll("[placeholder]").forEach(item=>item.placeholder=translateJprText(item.placeholder));
  root.querySelectorAll("[aria-label]").forEach(item=>item.setAttribute("aria-label",translateJprText(item.getAttribute("aria-label"))));
}

function render() {
  if (ui.view === "zone" && currentZone()) renderZone(currentZone());
  else if (ui.view === "project" && currentProject()) renderProject(currentZone(),currentProject());
  else if (ui.view === "focus" && currentProject() && activeSession(currentProject())) renderFocus(currentZone(),currentProject(),activeSession(currentProject()));
  else { ui.view = "dashboard"; renderDashboard(); }
  translateJprRenderedCopy();
  window.ProjectOSInspirationOrbs?.sync();
  save();
}

const TASK_COMMAND_LABELS={EDIT:"编辑任务",PAUSE:"暂停任务",FREEZE:"冻结任务",COMPLETE:"标记完成",REOPEN:"重新开启",VIEW:"查看存档",DELETE:"永久删除"};
function renderTaskControls(kind,task) {
  const status=taskStatus(task);const label=taskStatusLabel(task);const actions=window.ProjectOSLifecycle.taskMenuActions(task);
  return `<div class="task-head-controls"><span class="lifecycle-badge lifecycle-${status}">${label}</span><div class="task-menu"><button class="task-menu-trigger" data-action="toggle-task-menu" aria-label="任务操作" title="任务操作">···</button><div class="task-menu-dropdown" hidden>${actions.map((command,index)=>`${command==="DELETE"?'<span class="task-menu-divider"></span>':""}<button class="task-menu-item ${command==="DELETE"?"is-danger":""}" data-action="task-command" data-task-kind="${kind}" data-task-id="${task.id}" data-command="${command}">${TASK_COMMAND_LABELS[command]}</button>`).join("")}</div></div></div>`;
}
function archiveCounts(items){return{paused:items.filter(item=>taskStatus(item)===TASK_STATUS.PAUSED).length,frozen:items.filter(item=>taskStatus(item)===TASK_STATUS.FROZEN).length,completed:items.filter(item=>taskStatus(item)===TASK_STATUS.COMPLETED).length}}
function renderArchivedZoneRow(zone){return `<article class="archive-task-row"><div>${renderTaskControls("zone",zone)}<strong>${escapeHtml(zone.name)}</strong><small>${zone.projects.length} 个次级项目 · 更新 ${formatDate(zone.updatedAt)}</small></div><button class="soft-button" data-action="open-zone" data-zone-id="${zone.id}">查看存档</button></article>`}
function renderArchivedProjectRow(project){return `<article class="archive-task-row"><div>${renderTaskControls("project",project)}<strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.currentState||"尚未记录状态")} · 更新 ${formatDate(project.updatedAt)}</small></div><button class="soft-button" data-action="open-project" data-project-id="${project.id}">查看存档</button></article>`}

function renderDashboard() {
  if (!state.zones.length) {
    app.innerHTML = isJprDemoWorkspace()?`<section class="empty-state demo-empty-state"><div class="empty-state-inner"><span class="empty-icon">J</span><p class="eyebrow demo-eyebrow">JPR向けデモ · 架空データ</p><h1>デモを最初から始める</h1><p>このページは通常版と分離されています。開始すると、架空の業務改善プロジェクトが読み込まれます。</p><div class="demo-empty-actions"><a class="text-button button-link" href="./index.html">通常版を開く</a><button class="demo-primary" data-action="load-jpr-sample">JPRデモを開始</button></div></div></section>`:workspaceMode===WORKSPACE_MODES.DEMO?`<section class="empty-state demo-empty-state"><div class="empty-state-inner"><span class="empty-icon">D</span><p class="eyebrow demo-eyebrow">DEMO / 独立演示工作区</p><h1>选择演示起点</h1><p>保持空白，自行建立演示项目；或一键载入两条示例主线。这里的任何操作都不会进入正式存档。</p><div class="demo-empty-actions"><button class="text-button" data-action="add-zone">建立空白 Demo</button><button class="demo-primary" data-action="load-demo-sample">载入示例数据</button></div></div></section>`:`<section class="empty-state"><div class="empty-state-inner"><span class="empty-icon">＋</span><p class="eyebrow">一次聚焦一个长期方向</p><h1>建立第一个主任务</h1><p>主任务代表长期大方向。具体项目会在进入主任务后创建。</p><button class="primary-button hero" data-action="add-zone">＋ 追加主任务</button></div></section>`;
    app.innerHTML += renderInspirationLibrary();
    return;
  }
  const activeZones=state.zones.filter(isActiveTask);const archivedZones=state.zones.filter(zone=>!isActiveTask(zone));const primary = activeZones.slice(0,3); const others = activeZones.slice(3); const recommendation=dashboardRecommendation(); const activities=dashboardActivities(); const pauseSuggestion=dashboardPauseSuggestion(recommendation);const archivedCounts=archiveCounts(archivedZones);
  const stats=workspaceStats(); const isDemo=isDemoWorkspace();const isJpr=isJprDemoWorkspace();
  app.innerHTML = `<section class="home-hero cockpit-hero"><div><p class="section-kicker">${isDemo?"独立演示工作区 · 本机隔离":"主任务驾驶舱 · 本地模式"}</p><h1>我现在该推进什么？</h1><p>先选主任务，再进入次级项目，恢复背景后开始本次工作。</p></div><div class="home-hero-actions"><button class="soft-button today-summary-button" data-action="today-summary" aria-expanded="${ui.todaySummaryOpen}">${ui.todaySummaryOpen?"收起今日总结":"总结今天"}</button><button class="primary-button hero" data-action="add-zone">＋ 追加主任务</button></div></section>
    <section class="cockpit-overview" aria-label="主任务总览"><div class="overview-stats ${isJpr?"jpr-overview-stats":""}"><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="zones"?"is-selected":""}" data-action="dashboard-stat" data-stat="zones" aria-pressed="${ui.dashboardStat==="zones"}"><span>主任务</span><strong>${state.zones.length} <small>/ ${MAX_ZONES}</small></strong><em>查看列表 →</em></button><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="active-projects"?"is-selected":""}" data-action="dashboard-stat" data-stat="active-projects" aria-pressed="${ui.dashboardStat==="active-projects"}"><span>活跃次级项目</span><strong>${stats.activeProjects}</strong><em>筛选项目 →</em></button><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="today"?"is-selected":""}" data-action="dashboard-stat" data-stat="today" aria-pressed="${ui.dashboardStat==="today"}"><span>今日工作</span><strong>${stats.today}</strong><em>查看今日 →</em></button><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="completed"?"is-selected":""}" data-action="dashboard-stat" data-stat="completed" aria-pressed="${ui.dashboardStat==="completed"}"><span>已完成工作</span><strong>${stats.completed}</strong><em>查看历史 →</em></button>${isJpr?"":`<button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="focus"?"is-selected":""}" data-action="dashboard-stat" data-stat="focus" aria-pressed="${ui.dashboardStat==="focus"}"><span>本周专注</span><strong class="stat-name">${stats.focus}</strong><em>查看明细 →</em></button>`}</div><article class="overview-recommendation"><div class="overview-orb" aria-hidden="true"><iframe src="liquid-orb.html" title="" tabindex="-1" loading="eager"></iframe></div><div class="recommendation-head"><span class="signal-dot"></span><strong>今日建议</strong><small>本地规则生成</small></div>${recommendation?`<h2>建议优先推进：${escapeHtml(recommendation.zone.name)}${recommendation.project?` / ${escapeHtml(recommendation.project.name)}`:""}</h2><p>${escapeHtml(recommendation.reason)}</p><span class="rule-note">判断依据：${escapeHtml(recommendation.rule)}</span>`:'<h2>先建立一个明确的下一步</h2>'}</article></section>
    ${ui.todaySummaryOpen?renderTodaySummary():""}
    ${renderDashboardStatDetail(stats)}
    <section class="console-section"><div class="section-head cockpit-section-head"><div><p class="section-kicker">主任务入口</p><h2>选择一个大方向</h2></div><span>默认只显示进行中的主任务</span></div><div class="zone-grid">${primary.map((zone,index) => renderZoneCard(zone,index)).join("")||'<div class="inline-empty">当前没有进行中的主任务，可从下方存档区重新开启。</div>'}</div></section>
    ${others.length ? `<section class="other-zones"><button class="other-toggle" data-action="toggle-other">其他主任务 ${others.length} / ${MAX_ZONES} <span>${ui.showOtherZones ? "收起" : "展开"}</span></button>${ui.showOtherZones ? `<div class="zone-grid">${others.map((zone,index) => renderZoneCard(zone,index+3)).join("")}</div>` : ""}</section>` : ""}
    ${archivedZones.length?`<section class="archive-console"><button class="archive-toggle" data-action="toggle-archived-zones"><span>暂停 / 冻结 / 已完成</span><strong>暂停 ${archivedCounts.paused} · 冻结 ${archivedCounts.frozen} · 完成 ${archivedCounts.completed}</strong><em>${ui.showArchivedZones?"收起":"展开"}</em></button>${ui.showArchivedZones?`<div class="archive-task-list">${archivedZones.map(renderArchivedZoneRow).join("")}</div>`:""}</section>`:""}
    ${renderInspirationLibrary()}
    <section class="cockpit-lower-grid"><article class="console-panel"><div class="console-panel-head"><div><p class="section-kicker">最近动态</p><h2>刚刚发生了什么</h2></div><span>${activities.length} 条</span></div><div class="activity-list">${activities.length?activities.map(item=>`<div class="activity-item"><time>${formatDate(item.at)}</time><div><strong>${escapeHtml(item.zone.name)}${item.project?` / ${escapeHtml(item.project.name)}`:""}</strong><p>${escapeHtml(item.text)}</p></div></div>`).join(""):'<p class="empty-console-copy">还没有工作动态。进入主任务后开始第一条记录。</p>'}</div></article><article class="console-panel advice-panel"><div class="console-panel-head"><div><p class="section-kicker">今日判断</p><h2>推进与暂缓</h2></div><span>自动整理</span></div>${recommendation?`<div class="advice-item is-go"><span>推进</span><div><strong>${escapeHtml(recommendation.zone.name)}</strong><p>${escapeHtml(recommendation.reason)}</p></div></div>`:""}${pauseSuggestion?`<div class="advice-item is-hold"><span>暂缓</span><div><strong>${escapeHtml(pauseSuggestion.zone.name)}</strong><p>${escapeHtml(pauseSuggestion.reason)}</p></div></div>`:'<div class="advice-item is-hold"><span>提示</span><div><strong>今天只收束一个方向</strong><p>完成一个闭环后，再切换到下一条主线。</p></div></div>'}<p class="system-disclaimer">这是本地规则建议，不会把项目数据发送到云端。</p></article></section>`;
}

function renderZoneCard(zone,index) {
  const recent = recentProject(zone); const relations = linkedFor(zone.id); const stage=zoneStage(zone);
  return `<article class="task-card zone-card console-card" style="--task-color:${zone.color || COLORS[index % COLORS.length]}"><div class="task-card-head"><span class="task-index">主任务 ${String(index+1).padStart(2,"0")}</span>${renderTaskControls("zone",zone)}</div><h2>${escapeHtml(zone.name)}</h2><p class="task-status">${escapeHtml(zone.purpose || zone.summary)}</p>
    <div class="task-card-meta"><div class="meta-row"><span>次级项目</span><strong>${zone.projects.length} 个</strong></div><div class="meta-row"><span>最近活跃</span><strong>${escapeHtml(recent?.name || "尚无项目")}</strong></div><div class="meta-row"><span>总体状态</span><strong>${escapeHtml(zone.summary || recent?.currentState || "等待推进")}</strong></div></div>
    <div class="phase-row"><span>当前阶段 · ${stage}</span>${phaseTrack(stage)}</div>
    ${relations.length?`<div class="relation-console"><div class="relation-title"><span>↔</span><strong>主任务链路</strong><small>${relations.length} 条</small></div><div class="relation-chips">${relations.map(link=>{const target=linkedZone(link,zone.id);const reason=link.reason||`共享范围：${link.scopes.map(scope=>SCOPE_LABELS[scope]).filter(Boolean).join("、")||"尚未配置"}`;return`<span title="${escapeHtml(reason)}">关联：${escapeHtml(target?.name||"未知主任务")}</span>`}).join("")}</div></div>`:'<div class="relation-console is-isolated"><div class="relation-title"><span>—</span><strong>当前保持隔离</strong></div></div>'}
    <div class="task-card-foot"><span class="updated">更新 ${formatDate(zone.updatedAt)}</span><button class="continue-button" data-action="open-zone" data-zone-id="${zone.id}">进入主任务</button></div></article>`;
}

function renderZone(zone) {
  const activeProjects=zone.projects.filter(isActiveTask);const archivedProjects=zone.projects.filter(project=>!isActiveTask(project));const shown = ui.showAllProjects ? activeProjects : activeProjects.slice(0,6); const links = linkedFor(zone.id);const archivedCounts=archiveCounts(archivedProjects);
  app.innerHTML = `<button class="back-button" data-action="dashboard">← 返回主任务驾驶舱</button><section class="resume-hero zone-hero"><div><p class="eyebrow">主任务 / ${escapeHtml(zone.name)}</p><div class="hero-title-row"><h1>${escapeHtml(zone.name)}</h1>${renderTaskControls("zone",zone)}</div><p class="purpose">${escapeHtml(zone.purpose || "尚未补充方向说明")}</p><div class="mother-goal"><small>母目标</small><strong>${escapeHtml(zone.motherGoal || "尚未定义")}</strong></div></div>${isActiveTask(zone)?'<button class="primary-button hero" data-action="add-project">＋ 追加次级项目</button>':'<span class="archive-view-note">当前为存档查看模式</span>'}</section>
    <section class="zone-section"><div class="section-head"><div><p class="section-kicker">进行中项目 · ${activeProjects.length}</p><h2>选择要继续的项目</h2></div></div><div class="project-grid">${shown.map((project,index) => renderProjectCard(project,index)).join("")}${activeProjects.length === 0&&isActiveTask(zone) ? '<button class="add-project-card" data-action="add-project">＋ 追加第一个次级项目</button>' : ""}</div>${activeProjects.length > 6 ? `<button class="show-more" data-action="toggle-projects">${ui.showAllProjects ? "收起其他项目" : `展开其他 ${activeProjects.length-6} 个项目`}</button>` : ""}${archivedProjects.length?`<div class="archive-console is-project-archive"><button class="archive-toggle" data-action="toggle-archived-projects"><span>暂停 / 冻结 / 已完成项目</span><strong>暂停 ${archivedCounts.paused} · 冻结 ${archivedCounts.frozen} · 完成 ${archivedCounts.completed}</strong><em>${ui.showArchivedProjects?"收起":"展开"}</em></button>${ui.showArchivedProjects?`<div class="archive-task-list">${archivedProjects.map(renderArchivedProjectRow).join("")}</div>`:""}</div>`:""}</section>
    <section class="links-panel"><div class="section-head"><div><p class="section-kicker">背景共享边界</p><h2>关联主任务</h2></div><button class="soft-button" data-action="manage-links">管理关联</button></div>${links.length ? links.map(link => renderLink(zone,link)).join("") : '<div class="isolated-state"><strong>当前保持隔离</strong><p>没有与其他主任务共享背景或进度。</p></div>'}</section>`;
}

function renderProjectCard(project,index) {
  const stage=projectStage(project,currentZone());return `<article class="project-card" style="--project-color:${project.color || COLORS[index%COLORS.length]}"><div class="project-card-head"><span class="project-index">项目 ${String(index+1).padStart(2,"0")}</span>${renderTaskControls("project",project)}</div><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.currentState || "等待推进")}</p><div class="project-meta"><span>最近一次工作</span><strong>${escapeHtml(latestWork(project))}</strong><span>下一步</span><strong>${escapeHtml(nextAction(project))}</strong></div><div class="phase-row"><span>当前阶段 · ${stage}</span>${phaseTrack(stage)}</div><button class="continue-button" data-action="open-project" data-project-id="${project.id}">继续 →</button></article>`;
}

const SCOPE_LABELS = { SHARE_PROGRESS:"项目里程碑与总体进度", SHARE_CONTENT:"发布内容", SHARE_METRICS:"内容表现数据", SHARE_MEMORY:"主任务共享记忆" };
function renderLink(zone,link) { const target = linkedZone(link,zone.id); const allowed = link.scopes.map(scope => SCOPE_LABELS[scope]).filter(Boolean); return `<article class="link-card"><div class="link-route"><strong>${escapeHtml(zone.name)}</strong><span>↔</span><strong>${escapeHtml(target?.name || "未知主任务")}</strong></div><div><small>当前共享</small><p>${escapeHtml(allowed.join("、") || "仅建立关联，不共享内容")}</p><small>始终不共享</small><p>技术调试、源代码、项目私有记忆、内部提示词、完整工作记录</p></div></article>`; }

function renderProject(zone,project) {
  const recent = lastEndedSession(project); const stage=projectStage(project,zone); const currentSession=activeSession(project); const sessionStatus=currentSession?(currentSession.status==="PAUSED"?"本次工作已暂停":"本次工作进行中"):"当前没有进行中的工作";
  const completedSummary=project.completed.length?`${project.importedMilestones?.length?"包含已导入历史成果\n":""}${project.completed.slice(-3).join("\n")}`:"尚无完成记录";
  const workButton=isActiveTask(zone)&&isActiveTask(project)?`<button class="primary-button hero" data-action="continue-work">${activeSession(project) ? "继续任务" : "进入任务"}</button>`:!isActiveTask(zone)?'<span class="archive-view-note">主任务未开启 · 仅查看存档</span>':`<button class="primary-button hero" data-action="task-command" data-task-kind="project" data-task-id="${project.id}" data-command="REOPEN">重新开启</button>`;
  app.innerHTML = `<button class="back-button" data-action="back-zone">← 返回${escapeHtml(zone.name)}</button><div class="breadcrumb">${escapeHtml(zone.name)} <span>›</span> ${escapeHtml(project.name)}</div><section class="resume-hero project-resume-hero"><div><p class="eyebrow">项目续接</p><div class="hero-title-row"><h1>${escapeHtml(project.name)}</h1>${renderTaskControls("project",project)}</div><div class="purpose-row"><p class="purpose">${escapeHtml(project.purpose || "尚未补充项目目的")}</p><button class="mini-link light" data-action="edit-project-state" data-edit-field="purpose">编辑目的</button></div><div class="project-hero-meta"><span>当前阶段 · ${stage}</span><span>更新 ${formatDate(project.updatedAt)}</span><span>${sessionStatus}</span></div></div>${workButton}</section>
    ${renderActionDirective(project)}<div class="resume-layout"><section class="resume-panel"><div class="resume-grid">${renderProjectStatePanel(project,stage)}${resumeBlock("当前目标",project.goal||"尚未定义",false,false,"goal")}${resumeBlock("已完成阶段",completedSummary,false,false,"completed")}${renderBlockersBlock(project)}${resumeBlock("最后更新时间",formatDate(project.updatedAt),true)}</div></section><aside class="side-panel"><h3>项目背景</h3><label class="project-keep-control"><input type="checkbox" data-action="toggle-keep-empty" ${project.keepWhenEmpty?"checked":""}><span><strong>即使没有工作记录，也保留这个项目</strong><small>适合暂停中、待启动或只建立框架的长期项目。</small></span></label><nav class="nav-list">${detailNav("memory","项目私有记忆",project.projectMemory.length)}${detailNav("history","工作历史",formalSessions(project).length)}${detailNav("backlog","待办池",project.backlog.length)}${detailNav("parking","项目暂存",project.parkingLot.length)}</nav><div class="detail-drawer">${renderDetail(zone,project,ui.detailTab)}</div><div class="project-skills"><div><h3>常用技能</h3><button class="mini-link" data-action="manage-project-skills">管理</button></div>${renderProjectSkills(project)}</div></aside></div>`;
}

function renderProjectSkills(project) { const selected=state.skills.filter(skill=>(project.skillIds||[]).includes(skill.id)); return selected.length ? selected.map(skill=>`<span class="skill-chip">${escapeHtml(skill.name)}</span>`).join("") : '<p class="form-hint">尚未设置常用能力。</p>'; }

function renderActionDirective(project){return`<section class="project-action-directive"><div><span>行动指示</span><strong>${escapeHtml(nextAction(project))}</strong></div><button class="mini-link" data-action="edit-project-state" data-edit-field="next">编辑</button></section>`}
function renderProjectStatePanel(project,stage){const progress=project.currentProgressSummary||"尚未记录";return`<article class="project-state-panel full"><div class="project-state-panel-head"><div><span>项目状态</span><strong>${escapeHtml(stage)}</strong></div><div class="state-panel-actions"><button class="mini-link" data-action="edit-project-state" data-edit-field="state">编辑状态</button><button class="mini-link" data-action="edit-project-state" data-edit-field="phase">编辑阶段</button></div></div><div class="project-state-content"><div><small>当前状态</small><p>${escapeHtml(project.currentState||"尚未记录")}</p></div><div><small>最新进度</small><p>${escapeHtml(progress)}</p></div></div>${phaseTrack(stage)}</article>`}
function resumeBlock(label,value,full=false,priority=false,editField="") { return `<article class="resume-block ${full?"full":""} ${priority?"is-priority":""}"><div class="resume-block-head"><label>${label}</label>${editField?`<button class="mini-link" data-action="edit-project-state" data-edit-field="${editField}">编辑</button>`:""}</div><p>${escapeHtml(value)}</p></article>`; }
function renderIssueChip(item,index,status){const resolved=status==="resolved";return`<div class="issue-chip ${resolved?"is-resolved":""}"><input type="checkbox" data-action="set-issue-status" data-issue-list="${status}" data-issue-index="${index}" ${resolved?"checked":""} aria-label="${resolved?"恢复为未解决":"标记为已解决"}"><span class="issue-chip-text">${escapeHtml(item)}</span><em>${resolved?"已解决":"未解决"}</em><button class="issue-delete" data-action="delete-issue" data-issue-list="${status}" data-issue-index="${index}" aria-label="删除问题" title="删除问题">×</button></div>`}
function renderBlockerChip(item){const resolved=item.status===BLOCKER_STATUS.RESOLVED;const deferred=item.status===BLOCKER_STATUS.DEFERRED;return`<div class="issue-chip blocker-chip ${resolved?"is-resolved":""} ${deferred?"is-deferred":""}"><input type="checkbox" data-action="set-blocker-status" data-blocker-id="${item.id}" data-blocker-status="${resolved?"OPEN":"RESOLVED"}" ${resolved?"checked":""} aria-label="${resolved?"恢复为未解决":"标记为已解决"}"><span class="issue-chip-text">${escapeHtml(item.text)}</span><em>${resolved?"已解决":deferred?"稍后处理":item.priority==="HIGH"?"高优先级":"未解决"}</em><button class="issue-delete" data-action="delete-blocker" data-blocker-id="${item.id}" aria-label="删除问题" title="删除问题">×</button></div>`}
function renderBlockersBlock(project){const active=currentBlockers(project);const closed=(project.blockers||[]).filter(item=>item.status!==BLOCKER_STATUS.OPEN);const openIssues=project.openIssues||[];const resolvedIssues=project.resolvedIssues||[];const issues=[...openIssues.map((item,index)=>renderIssueChip(item,index,"open")),...resolvedIssues.map((item,index)=>renderIssueChip(item,index,"resolved"))].join("");const issuesHtml=issues?`<div class="issue-list"><strong>当前问题</strong><div class="issue-chip-list">${issues}</div></div>`:'<div class="issue-list is-empty"><strong>当前问题</strong><p>暂无已确认问题</p></div>';const activeHtml=active.length?`<div class="issue-chip-list blocker-list">${active.map(renderBlockerChip).join("")}</div>`:`<div class="blocker-empty"><p>${project.blockerReviewPending&&openIssues.length?"尚未确认哪些问题会阻塞推进":"当前无明确阻塞"}</p></div>`;const history=closed.length?`<details class="blocker-history"><summary>查看已解决 / 已推迟问题 · ${closed.length}</summary><div class="issue-chip-list">${closed.map(renderBlockerChip).join("")}</div></details>`:"";return`<article class="resume-block full blocker-block"><div class="blocker-block-head"><label>当前问题 / 阻塞</label><div><button class="mini-link" data-action="edit-project-state" data-edit-field="issues">编辑</button><button class="mini-link" data-action="record-blocker">＋ 记录问题</button></div></div>${issuesHtml}<div class="blocker-subhead">当前阻塞</div>${activeHtml}${history}</article>`}
function detailNav(key,label,count) { return `<button class="nav-item ${ui.detailTab===key?"is-active":""}" data-action="detail-tab" data-tab="${key}"><span>${label}</span><strong>${count}</strong></button>`; }
function listHtml(items,empty) { return items.length ? `<ul class="memory-list">${items.map(item=>`<li>${escapeHtml(memoryText(item))}</li>`).join("")}</ul>` : `<p>${empty}</p>`; }
function renderDetail(zone,project,tab) {
  if (tab === "history") return renderHistory(project);
  if (tab === "backlog") return `<h4>待办池</h4>${listHtml(project.backlog,"暂时没有积压事项。")}`;
  if (tab === "parking") return `<h4>项目暂存事项</h4><p class="form-hint">只属于当前项目，不会自动进入 Workspace 灵感库。</p>${listHtml(project.parkingLot,"暂时没有项目暂存事项。")}`;
  return `<h4>项目私有记忆</h4>${listHtml([...project.projectMemory,...project.decisions.map(item=>`决定：${item}`),...project.constraints.map(item=>`约束：${item}`)],"尚未沉淀项目私有记忆。")}<h4>主任务共享记忆</h4>${listHtml(zone.sharedMemory,"当前主任务没有共享记忆。")}`;
}

function renderHistory(project) {
  const sessions=[...project.sessions].reverse();
  const selected=new Set(ui.selectedHistoryIds||[]);
  const items=sessions.map(session=>{const number=project.sessions.findIndex(item=>item.id===session.id)+1;const title=session.title||session.goal||"本次工作";const heading=`No.${number} · ${title}`;const focus=session.timeConfirmedAt&&Number.isFinite(Number(session.focusMinutes))?isJprDemoWorkspace()?` · 集中 ${Math.max(0,Math.round(Number(session.focusMinutes)))}分`:` · 专注 ${Math.max(0,Math.round(Number(session.focusMinutes)))} 分钟`:"";return`<article class="history-item"><div class="history-item-head">${ui.historyManage?`<label class="history-select"><input type="checkbox" data-action="toggle-history-selection" data-session-id="${session.id}" ${selected.has(session.id)?"checked":""}><span><strong>${escapeHtml(heading)}</strong><br>${formatDate(session.startedAt)}</span></label>`:`<div><strong>${escapeHtml(heading)}</strong><br>${formatDate(session.startedAt)}</div>`}<div>${session.isDemo?`<span class="demo-badge ${session.promotedToFormal?"promoted":""}">${session.promotedToFormal?"演示 · 已写入正式项目":"演示"}</span>`:""}</div></div><p>${session.endedAt?"已结束":"进行中"}${focus}${session.summary?` · ${escapeHtml(session.summary.split("\n")[0])}`:""}</p>${ui.historyManage?"":`<button class="history-delete" data-action="delete-session" data-session-id="${session.id}">删除记录</button>`}</article>`}).join("");
  const actions=ui.historyManage?`<div class="history-actions"><div class="history-actions-row"><button class="danger-primary" data-action="delete-selected-history" ${selected.size?"":"disabled"}>删除选中记录</button><button class="danger-button" data-action="clear-project-history" ${sessions.length?"":"disabled"}>清空当前项目的全部工作历史</button></div><button class="text-button" data-action="cancel-history-manage">退出管理</button></div>`:"";
  const legacyDemoCount=project.sessions.filter(session=>session.isDemo).length;
  return `<div class="history-head"><h4>工作历史</h4><button class="mini-link" data-action="manage-history">${ui.historyManage?"选择记录":"管理历史"}</button></div>${sessions.length?`<div class="history-list">${items}</div>`:"<p>还没有工作记录。</p>"}${actions}${legacyDemoCount&&workspaceMode===WORKSPACE_MODES.NORMAL?`<div class="history-actions"><button class="danger-button" data-action="clear-demo-data">清除旧版演示记录</button><p class="form-hint">这是兼容旧数据的清理入口；新的演示请使用独立演示环境。</p></div>`:""}`;
}

function renderFocus(zone,project,session) {
  const parkingItems=session.isDemo?session.parkingAdded:project.parkingLot;
  app.innerHTML = `<section class="focus-shell"><button class="back-button" data-action="back-project">← 返回项目续接</button><header class="focus-head"><div><p class="eyebrow">本次工作进行中</p><h1>${escapeHtml(project.name)}</h1><p class="focus-zone">所属主任务：${escapeHtml(zone.name)}</p></div><span class="focus-badge">${session.isDemo?"演示":"聚焦"}</span></header>${isJprDemoWorkspace()?'<div class="tool-rule"><strong>架空データの独立デモ</strong>ここでの変更はJPRデモ専用Workspaceだけに保存され、通常版と通常デモには影響しません。</div>':session.isDemo?'<div class="tool-rule"><strong>演示模式</strong>本次操作只保存在演示工作记录内，不更新正式项目、长期记忆、统计或关联主任务。</div>':""}<section class="today-focus"><div class="today-focus-head"><div><p class="eyebrow">今日只做</p><h2>${escapeHtml(session.goal)}</h2></div><small>${session.todos.filter(todo=>todo.completed).length} / ${session.todos.length} 完成</small></div><div class="focus-todos">${session.todos.map(todo=>`<article class="focus-todo ${todo.completed?"is-done":""}"><button class="todo-check" data-action="toggle-todo" data-todo-id="${todo.id}" aria-label="${todo.completed?"恢复事项":"完成事项"}"></button><div><span class="todo-kind">${todo.kind==="PRIMARY"?"主行动":"可选"}</span><span class="todo-text">${escapeHtml(todo.text)}</span></div></article>`).join("")}</div></section><div class="focus-grid"><section class="focus-card"><h3>本次工作笔记</h3><textarea id="session-notes" placeholder="记录本次变化、修改内容、测试或验收结果…">${escapeHtml(session.notes||"")}</textarea><small class="form-hint">总结工作只会把已勾选完成项、这里记录的事实和本次已确认写回作为证据。</small><div class="session-actions"><button class="soft-button stuck-button" data-action="stuck" title="我有一个具体问题，需要 AI 帮我解决。">🆘 我卡住了</button><button class="soft-button status-review-button" data-action="status-review" title="我不一定卡住，但想让 AI 帮我看清当前进度和下一步。">🧭 现状总结</button><button class="soft-button work-summary-button" data-action="summarize-work" title="生成本次工作总结提示词，并读取 AI 返回的 JSON。">总结工作</button><button class="soft-button pause-session-button" data-action="pause-session">暂停本次工作</button><button class="primary-button" data-action="end-session">结束本次工作</button></div></section><aside class="focus-card focus-capture-card"><section class="project-private-capture"><div class="capture-heading"><div><h3>${session.isDemo?"演示项目暂存":"项目暂存"}</h3><p>任务、Bug 和以后要处理的事项，只保留在当前项目内。</p></div><span>私有</span></div><div class="quick-add"><input id="parking-input" placeholder="稍后要处理的事…" value="${escapeHtml(sessionDraft(session,"parkingInput")||"")}"><button class="soft-button" data-action="add-parking">存下</button></div><div class="parking-items">${parkingItems.slice(-5).reverse().map(item=>`<div class="parking-item"><small>${session.isDemo?"演示":"暂存"}</small>${escapeHtml(item)}</div>`).join("")||'<p class="form-hint">这里的内容不会自动出现在灵感库。</p>'}</div></section><section class="session-inspiration-capture"><div class="capture-heading"><div><h3>灵感库</h3><p>还没成为任务的点子，可以单独留下来慢慢长大。</p></div><span>Workspace</span></div><form class="quick-add" data-inspiration-form="session"><input id="inspiration-input" autocomplete="off" placeholder="刚刚冒出的想法…" value="${escapeHtml(sessionDraft(session,"inspirationInput")||"")}"><button class="soft-button" type="submit">加入灵感库</button></form></section></aside></div></section>`;
}

function resetAddDialog() { byId("add-form").reset(); byId("manual-name-error").hidden = true; byId("manual-name").classList.remove("input-error"); setAddMode("manual"); }
function openAddDialog(kind) {
  if (kind === "zone" && state.zones.length >= MAX_ZONES) return showToast("当前已有 7 个主任务。建议先完成、归档或合并一个主任务后再新增。");
  ui.addKind = kind; resetAddDialog();
  const isZone = kind === "zone"; const isJpr=isJprDemoWorkspace();
  byId("add-dialog-title").textContent=isJpr?(isZone?"メインテーマを追加":"プロジェクトを追加"):(isZone?"追加主任务":"追加次级项目");
  byId("name-field-label").textContent=isJpr?(isZone?"メインテーマ名":"プロジェクト名"):(isZone?"主任务名称":"项目名称");
  byId("purpose-field-label").textContent=isJpr?(isZone?"方向の説明":"目的・説明"):(isZone?"方向说明":"项目说明");
  byId("goal-field-label").textContent=isJpr?(isZone?"長期的な目標":"現在の目標"):(isZone?"母目标":"当前目标");
  byId("create-submit").textContent=isJpr?(isZone?"メインテーマを作成":"プロジェクトを作成"):(isZone?"建立主任务":"建立次级项目");
  byId("manual-name").placeholder=isJpr?(isZone?"例：業務改善、商品開発、学習":"例：問い合わせ対応の標準化"):(isZone?"例如：工作、个人产品、学习":"例如：客户反馈整理工具");
  byId("manual-purpose").placeholder=isJpr?(isZone?"このメインテーマで目指す方向は？":"このプロジェクトで何を改善しますか？"):(isZone?"这个长期方向是什么？":"这个项目要解决什么？");
  byId("manual-goal").placeholder=isJpr?(isZone?"長期的にどの状態を目指しますか？":"今回どこまで進めますか？"):(isZone?"这个方向长期要推进什么？":"这个项目当前要推进什么？");
  byId("manual-name-error").textContent=isJpr?(isZone?"メインテーマ名を入力してください":"プロジェクト名を入力してください"):"请输入项目名称";
  byId("add-dialog").showModal(); setTimeout(()=>byId("manual-name").focus(),40);
}
function setAddMode(mode) { document.querySelectorAll("[data-add-mode]").forEach(button=>button.classList.toggle("is-active",button.dataset.addMode===mode)); byId("manual-mode").hidden=mode!=="manual"; byId("bootstrap-mode").hidden=mode!=="bootstrap"; }
function clearInlineErrors(root=document) { root.querySelectorAll(".inline-validation").forEach(item=>item.remove()); root.querySelectorAll(".input-error").forEach(item=>item.classList.remove("input-error")); }
function showInlineError(input,message) { clearInlineErrors(input.closest("form")||document); input.classList.add("input-error"); const error=document.createElement("span"); error.className="field-error inline-validation"; error.textContent=message; input.insertAdjacentElement("afterend",error); input.focus(); }
function closeDialog(id) { const dialog=byId(id); if(dialog?.open) dialog.close(); }
function topOpenDialog() { return [...document.querySelectorAll("dialog[open]")].at(-1); }
function resetDialog(dialog) { clearInlineErrors(dialog); const form=dialog.querySelector("form"); if(form) form.reset(); if(dialog.id==="add-dialog") resetAddDialog(); if(dialog.id==="status-review-dialog")pendingStatusReview=null; if(["task-edit-dialog","task-state-dialog","task-delete-dialog"].includes(dialog.id))pendingTaskAction=null; }

function parseJsonFromText(raw) { return window.ProjectOSAIWorkflow.parseJsonFromText(raw); }
function sectionFromText(raw,names){return window.ProjectOSAIWorkflow.sectionFromText(raw,names)}
function bootstrapData(raw,kind) {
  const json=parseJsonFromText(raw)||{};
  if(kind==="zone") return {ok:true,value:{ parsed:Boolean(Object.keys(json).length), kind, name:json.ZONE_NAME||json.name||sectionFromText(raw,["ZONE_NAME","主任务名称"]), purpose:json.ZONE_PURPOSE||json.purpose||sectionFromText(raw,["ZONE_PURPOSE","方向说明"]), goal:json.MOTHER_GOAL||json.goal||sectionFromText(raw,["MOTHER_GOAL","母目标"]), currentState:json.ZONE_SUMMARY||json.summary||sectionFromText(raw,["ZONE_SUMMARY","总体状态"]), nextActions:asList(json.PROJECTS||sectionFromText(raw,["PROJECTS","主要项目"])), openIssues:asList(json.CONSTRAINTS||sectionFromText(raw,["CONSTRAINTS","约束"])), sharedMemory:asList(json.SHARED_MEMORY), relatedZones:asList(json.RELATED_ZONES) }};
  return window.ProjectOSBootstrap.parseProjectBootstrap(raw,now());
}
const BOOTSTRAP_PREVIEW_FIELDS=["purpose","goal","state","phase","next","completed","progress","issues","blockers","decisions","memory","constraints","assets","parking"];
function showBootstrapPreview(data){pendingBootstrap=data;byId("preview-message").textContent=data.kind==="project"?"长期记忆与当前项目现状会一起导入。请先确认或修改，再写入本地项目。":data.parsed?"结构化内容解析成功。确认或修正后再保存。":"未找到有效 JSON。已尽量提取内容，请手动确认字段。";BOOTSTRAP_PREVIEW_FIELDS.forEach(field=>{byId(`preview-apply-${field}`).checked=field!=="completed"});byId("preview-name").value=data.name||"";byId("preview-purpose").value=data.purpose||"";byId("preview-goal").value=data.goal||"";byId("preview-state").value=data.currentState||"";byId("preview-phase").value=data.currentPhase||"";byId("preview-next").value=text(data.nextActions);byId("preview-completed").value=text(data.completed);byId("preview-progress").value=text(data.inProgress);byId("preview-issues").value=text(data.openIssues);byId("preview-blockers").value=text(data.currentBlockers);byId("preview-decisions").value=text(data.decisions);byId("preview-memory").value=text(data.projectMemory);byId("preview-constraints").value=text(data.constraints);byId("preview-assets").value=text(data.assets);byId("preview-parking").value=text(data.parkingLot);closeDialog("add-dialog");byId("preview-dialog").showModal()}
function bootstrapPreviewValue(field,value,emptyValue=""){return byId(`preview-apply-${field}`).checked?value:emptyValue}

const PROJECT_EDIT_FIELDS={purpose:"edit-project-purpose",goal:"edit-project-goal",state:"edit-project-state",phase:"edit-project-phase",completed:"edit-project-completed",issues:"edit-project-issues",blockers:"edit-project-blockers",next:"edit-project-next"};
function openProjectStateEdit(field="") { const project=currentProject();if(!project)return;byId("project-state-edit-form").reset();byId("edit-project-purpose").value=project.purpose||"";byId("edit-project-goal").value=project.goal||"";byId("edit-project-state").value=project.currentState||"";byId("edit-project-phase").value=project.currentPhase||"";byId("edit-project-completed").value=text(project.completed);byId("edit-project-issues").value=text(project.openIssues);byId("edit-project-blockers").value=text(currentBlockers(project).map(item=>item.text));byId("edit-project-next").value=project.nextActions[0]||"";byId("project-state-edit-dialog").showModal();const target=byId(PROJECT_EDIT_FIELDS[field]||"edit-project-state");setTimeout(()=>target?.focus(),40);}
function replaceOpenBlockers(project,values,timestamp,source="manual") { const closed=(project.blockers||[]).filter(item=>item.status!==BLOCKER_STATUS.OPEN);const open=window.ProjectOSBootstrap.dedupeList(values).map(text=>normalizeBlocker({text,status:BLOCKER_STATUS.OPEN,priority:"NORMAL",source,createdAt:timestamp,updatedAt:timestamp},project.id,workspaceMode));project.blockers=[...closed,...open];project.blockerReviewPending=project.openIssues.length>0&&!open.length; }

function openSessionPlan(project){const existing=activeSession(project);if(existing){if(existing.status==="PAUSED"){const timestamp=now();existing.status="RUNNING";existing.resumedAt=timestamp;existing.updatedAt=timestamp;writeSessionDraftMirror(existing)}ui.view="focus";render();return}const plan=isJprDemoWorkspace()?{goal:project.goal,primary:project.nextActions[0]||"過去10件の問い合わせで分類ルールを検証し、差異を記録する。",optional:["担当者ごとの分類結果と判断理由を表に記録する。","差異が出た分類条件を一覧にする。"]}:window.ProjectOSPlanning.buildSessionPlan(project);byId("session-form").reset();byId("session-goal").value=plan.goal;byId("todo-primary").value=plan.primary;byId("todo-optional-1").value=plan.optional[0]||"";byId("todo-optional-2").value=plan.optional[1]||"";byId("session-blocker-none").checked=true;byId("session-blocker-input-panel").hidden=true;byId("session-dialog").showModal()}

function assistancePrompt(zone,project,session,problem,criteria){return window.ProjectOSAIWorkflow.buildAssistancePrompt({zone,project,session,problem,criteria,recentSessionSummary:lastEndedSession(project)?.summary||(isJprDemoWorkspace()?"完了した作業記録はまだありません":"尚无已结束工作记录"),locale:isJprDemoWorkspace()?"ja":"zh-CN"})}
function statusReviewPrompt(zone,project,session,mode="status-review"){const recentSessions=formalSessions(project).filter(item=>item.endedAt).slice(-3).map(item=>({startedAt:item.startedAt,endedAt:item.endedAt,goal:item.goal,summary:item.summary}));return window.ProjectOSAIWorkflow.buildStatusReviewPrompt({zone,project,session,recentSessions,intent:mode==="work-summary"?"WORK_SUMMARY":"STATUS_REVIEW",locale:isJprDemoWorkspace()?"ja":"zh-CN"})}
function resultData(raw){return window.ProjectOSAIWorkflow.parseAIResult(raw)}
function previewRows(data){const proposals=[[data.resultType==="STATUS_REVIEW"?"当前状态总结":"当前进度总结",data.progressSummary,"progress"],["推荐下一步",data.recommendedNextStep,"next"],["仍在发生的问题",data.activeProblems?.length?data.activeProblems:data.remainingIssues,"problems"],["建议写入记忆",data.memoryUpdates,"memory"]];const details=[["已完成",data.completed],["进度判断",data.progressJudgement],["可选下一步",data.optionalNextSteps],["建议停止 / 推迟",data.shouldStopOrDefer],["变化",data.changes],["验证",data.verification],["新发现",data.discoveries],["新决定",data.decisions]];return `<div class="proposal-grid">${proposals.map(([label,value,kind])=>`<article class="proposal-card proposal-${kind}"><strong>${label}</strong><p>${escapeHtml(text(value)||"—")}</p></article>`).join("")}</div><details class="parsed-details"><summary>查看其他已解析字段</summary>${details.map(([label,value])=>`<div class="preview-row"><strong>${label}</strong><p>${escapeHtml(text(value)||"—")}</p></div>`).join("")}</details>`}
function reviewField({id,label,value="",rows=false,checked=true,note=""}){const ja=isJprDemoWorkspace();return`<label class="review-suggestion"><span class="review-suggestion-head"><input id="review-apply-${id}" type="checkbox" ${checked?"checked":""}><strong>${label}</strong><em>${ja?"AIの提案":"AI 建议"}</em></span>${rows?`<textarea id="review-${id}" placeholder="${ja?"1行に1項目":"每行一项"}">${escapeHtml(text(value))}</textarea>`:`<input id="review-${id}" value="${escapeHtml(text(value))}">`}${note?`<small>${note}</small>`:""}</label>`}
function statusReviewPreviewForm(data){
  const ja=isJprDemoWorkspace();const full=data.resultType==="PROJECT_UPDATE";const phaseOptions=ja?[["","未確認"],["IDEA","構想"],["EXPLORATION","探索"],["PROTOTYPE","試作"],["VALIDATION","検証"],["STABILIZATION","安定化"],["DELIVERY","提供可能"],["PAUSED","一時停止"]]:[["","待确认"],["IDEA","构想阶段"],["EXPLORATION","探索阶段"],["PROTOTYPE","原型阶段"],["VALIDATION","验证阶段"],["STABILIZATION","稳定化阶段"],["DELIVERY","可交付阶段"],["PAUSED","暂停 / 待重新评估"]];
  const labels=ja?{purpose:"目的",goal:"現在の目標",state:"現在の状態",completed:"完了したこと",inProgress:"進行中",problems:"現在の問題",blockers:"明確な阻害要因",phase:"現在の段階",reason:"段階判断の理由",next:"次の一歩",optional:"次の候補 → バックログ",defer:"保留候補 → 一時メモ",decisions:"重要な判断",constraints:"制約",assets:"関連資産",memory:"プロジェクト固有の長期情報",parking:"一時メモ"}:{purpose:"项目目的",goal:"当前目标",state:"当前状态",completed:"已完成阶段",inProgress:"正在进行",problems:"当前问题",blockers:"当前阻塞",phase:"当前阶段",reason:"阶段判断原因",next:"推荐下一步",optional:"可选下一步 → 待办池",defer:"建议暂停事项 → 暂存区",decisions:"关键决策",constraints:"约束",assets:"相关资产",memory:"项目私有长期上下文",parking:"项目暂存区"};
  const phase=`<label class="review-suggestion"><span class="review-suggestion-head"><input id="review-apply-phase" type="checkbox" checked><strong>${labels.phase}</strong><em>${ja?"AIの提案":"AI 建议"}</em></span><select id="review-phase">${phaseOptions.map(([value,label])=>`<option value="${value}" ${data.progressPhase===value?"selected":""}>${label}</option>`).join("")}</select></label>`;
  const completed=reviewField({id:"completed",label:labels.completed,value:data.completed,rows:true,checked:false,note:ja?"初期状態では選択されません。証拠を確認した場合だけ反映してください。":"默认不勾选。只有确认完成证据后才写入。"});
  if(full)return`<p class="form-hint">${ja?`更新対象：${escapeHtml(data.projectName||"")}`:`更新当前项目：${escapeHtml(data.projectName||"")}。这不会创建重复项目。`}</p><div class="review-suggestion-grid">${reviewField({id:"purpose",label:labels.purpose,value:data.projectPurpose})}${reviewField({id:"goal",label:labels.goal,value:data.currentGoal})}${reviewField({id:"state",label:labels.state,value:data.currentStateSummary?.[0]||""})}${phase}${completed}${reviewField({id:"in-progress",label:labels.inProgress,value:data.inProgress,rows:true})}${reviewField({id:"problems",label:labels.problems,value:data.activeProblems,rows:true})}${reviewField({id:"blockers",label:labels.blockers,value:data.currentBlockers,rows:true})}${reviewField({id:"next",label:labels.next,value:data.recommendedNextStep})}${reviewField({id:"decisions",label:labels.decisions,value:data.decisions,rows:true})}${reviewField({id:"constraints",label:labels.constraints,value:data.constraints,rows:true})}${reviewField({id:"assets",label:labels.assets,value:data.assets,rows:true})}${reviewField({id:"memory",label:labels.memory,value:data.memoryUpdates,rows:true})}${reviewField({id:"parking",label:labels.parking,value:data.parkingLot,rows:true})}</div>`;
  const reason=String(data.progressJudgement||"").replace(/^[^：]+：/,"");return`<div class="review-suggestion-grid">${reviewField({id:"state",label:labels.state,value:data.currentStateSummary?.[0]||""})}${completed}${reviewField({id:"in-progress",label:labels.inProgress,value:data.inProgress,rows:true})}${reviewField({id:"problems",label:labels.problems,value:data.activeProblems,rows:true})}${reviewField({id:"blockers",label:labels.blockers,value:data.currentBlockers,rows:true})}${phase}${reviewField({id:"reason",label:labels.reason,value:reason})}${reviewField({id:"next",label:labels.next,value:data.recommendedNextStep})}${reviewField({id:"optional",label:labels.optional,value:data.optionalNextSteps,rows:true})}${reviewField({id:"defer",label:labels.defer,value:data.shouldStopOrDefer,rows:true})}${reviewField({id:"memory",label:labels.memory,value:data.memoryUpdates,rows:true})}</div>`;
}
function reviewValue(id){return byId(`review-${id}`)?.value||""}
function collectStatusReviewDraft(){return{projectName:pendingStatusReview?.projectName||"",projectPurpose:reviewValue("purpose").trim(),currentGoal:reviewValue("goal").trim(),currentStateSummary:lines(reviewValue("state")),progressSummary:lines(reviewValue("state")),completed:lines(reviewValue("completed")),inProgress:lines(reviewValue("in-progress")),activeProblems:lines(reviewValue("problems")),currentBlockers:lines(reviewValue("blockers")),progressPhase:reviewValue("phase"),progressJudgement:reviewValue("reason").trim(),recommendedNextStep:reviewValue("next").trim(),nextStep:reviewValue("next").trim(),optionalNextSteps:lines(reviewValue("optional")),shouldStopOrDefer:lines(reviewValue("defer")),decisions:lines(reviewValue("decisions")),constraints:lines(reviewValue("constraints")),assets:lines(reviewValue("assets")),memoryUpdates:lines(reviewValue("memory")),parkingLot:lines(reviewValue("parking")),resultType:pendingStatusReview?.resultType||"STATUS_REVIEW",remainingIssues:[],changes:[],verification:[],discoveries:[],raw:pendingStatusReview?.raw||"",identityProjectName:pendingStatusReview?.identityProjectName||"",identityPrefix:pendingStatusReview?.identityPrefix||""}}
function reviewChecked(id){return Boolean(byId(`review-apply-${id}`)?.checked)}
function statusReviewSelections(){return{purpose:reviewChecked("purpose"),goal:reviewChecked("goal"),state:reviewChecked("state"),completed:reviewChecked("completed"),inProgress:reviewChecked("in-progress"),problems:reviewChecked("problems"),blockers:reviewChecked("blockers"),phase:reviewChecked("phase"),reason:reviewChecked("reason"),next:reviewChecked("next"),optional:reviewChecked("optional"),defer:reviewChecked("defer"),decisions:reviewChecked("decisions"),constraints:reviewChecked("constraints"),assets:reviewChecked("assets"),memory:reviewChecked("memory"),parking:reviewChecked("parking")}}
const REVIEW_SELECTION_IDS={purpose:"purpose",goal:"goal",state:"state",completed:"completed",inProgress:"in-progress",problems:"problems",blockers:"blockers",phase:"phase",reason:"reason",next:"next",optional:"optional",defer:"defer",decisions:"decisions",constraints:"constraints",assets:"assets",memory:"memory",parking:"parking"};
function reviewDraftSection(mode=currentReviewMode){return mode==="work-summary"?"workSummary":"statusReview"}
function restoreReviewSelections(selections={}){Object.entries(REVIEW_SELECTION_IDS).forEach(([key,id])=>{const input=byId(`review-apply-${id}`);if(input&&Object.prototype.hasOwnProperty.call(selections,key))input.checked=Boolean(selections[key])})}
function configureReviewDialog(mode){const ja=isJprDemoWorkspace();const summary=mode==="work-summary";byId("work-summary-evidence-panel").hidden=!summary;byId("work-summary-evidence-label").textContent=ja?"今回実際に完了・確認したこと":"本次实际完成了什么";byId("work-summary-evidence").placeholder=ja?"例：Free / Pro版を分けた；Skillの不足を確認した；ワンクリック導入パッケージを作成・確認した。":"例如：完成 Free / Pro 分装；确认 Skill 的不足；生成并验证一键安装包。";byId("work-summary-evidence-help").textContent=ja?"今回の作業メモとして保存し、完全なプロジェクト更新プロンプトへ反映します。外部で行った作業もここに記録してください。":"这里会同步保存到本次工作笔记，并立即重新生成完整项目更新提示词。外部 Codex 或编辑器中的工作也请写在这里。";byId("status-review-eyebrow").textContent=ja?(summary?"現在のプロジェクトを更新":"プロジェクトの状態確認"):(summary?"完整项目更新":"项目状态审查");byId("status-review-title").textContent=ja?(summary?"作業をプロジェクトに反映":"現状を整理"):(summary?"总结工作并更新项目":"现状总结");byId("status-review-prompt-label").textContent=ja?(summary?"完全なプロジェクト更新プロンプト":"状態確認プロンプト"):(summary?"完整项目更新提示词":"状态审查提示词");byId("status-review-help").textContent=ja?(summary?"既存プロジェクトを作り直さず、完全な更新後スナップショットを人が項目ごとに確認して反映します。":"このプロジェクトと共有を許可した背景だけを含みます。プロンプトをクリックしてコピーできます。"):(summary?"不会重新建立项目。AI 返回完整项目结构，你逐字段确认后更新当前项目。":"只包含当前次级项目和允许共享的背景。点击提示词即可复制，并要求 AI 只返回一个 JSON 代码块。");byId("parse-status-review").textContent=ja?"AIの提案を確認":summary?"读取完整项目更新":"解析现状总结"}
function openStatusReviewDialog(mode="status-review"){const project=currentProject();const session=activeSession(project);if(!session)return;currentReviewMode=mode;pendingStatusReview=null;configureReviewDialog(mode);byId("status-review-form").reset();byId("work-summary-evidence").value=session.notes||"";byId("status-review-output").value=statusReviewPrompt(currentZone(),project,session,mode);const draft=sessionDraft(session,reviewDraftSection(mode));byId("status-review-result").value=draft?.raw||"";byId("status-review-input-panel").hidden=false;byId("status-review-preview-panel").hidden=true;if(draft?.panel==="preview"&&draft.preview?.identityProjectName===project.name){pendingStatusReview=clone(draft.preview);byId("status-review-preview").innerHTML=statusReviewPreviewForm(pendingStatusReview);restoreReviewSelections(draft.selections);byId("status-review-input-panel").hidden=true;byId("status-review-preview-panel").hidden=false}byId("status-review-dialog").showModal()}
function persistStatusReviewDraft(){const session=activeSession(currentProject());if(!session)return;const previewOpen=!byId("status-review-preview-panel").hidden;persistSessionDraft(reviewDraftSection(),{mode:currentReviewMode,evidence:byId("work-summary-evidence").value,raw:byId("status-review-result").value,panel:previewOpen?"preview":"input",preview:previewOpen?collectStatusReviewDraft():null,selections:previewOpen?statusReviewSelections():null},session)}
function openStuckDialog(){const session=activeSession(currentProject());if(!session)return;const draft=sessionDraft(session,"stuck")||{};byId("stuck-form").reset();byId("stuck-problem").value=draft.problem||"";byId("stuck-criteria").value=draft.criteria||"";byId("stuck-output").value=draft.output||"";const outputOpen=draft.panel==="output"&&Boolean(draft.output);byId("stuck-input-panel").hidden=outputOpen;byId("stuck-output-panel").hidden=!outputOpen;byId("stuck-dialog").showModal()}
function persistStuckDraft(){persistSessionDraft("stuck",{problem:byId("stuck-problem").value,criteria:byId("stuck-criteria").value,output:byId("stuck-output").value,panel:byId("stuck-output-panel").hidden?"input":"output"})}
function toDateTimeLocal(value){const date=new Date(value);if(Number.isNaN(date.getTime()))return"";const pad=number=>String(number).padStart(2,"0");return`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`}
function readEndTimeValues(showError=true){const error=byId("end-time-error");const started=new Date(byId("end-started-at").value);const ended=new Date(byId("end-ended-at").value);let message="";if(Number.isNaN(started.getTime())||Number.isNaN(ended.getTime()))message=isJprDemoWorkspace()?"開始時刻と終了時刻を入力してください":"请填写有效的开始和结束时间";else if(ended.getTime()<started.getTime())message=isJprDemoWorkspace()?"終了時刻は開始時刻より後にしてください":"结束时间不能早于开始时间";else if(ended.getTime()>Date.now()+60000)message=isJprDemoWorkspace()?"終了時刻は現在時刻より後にできません":"结束时间不能晚于当前时间";if(error){error.textContent=message;error.hidden=!message}if(message)return null;const focusMinutes=Math.max(0,Math.round((ended.getTime()-started.getTime())/60000));if(showError&&error)error.hidden=true;return{startedAt:started.toISOString(),endedAt:ended.toISOString(),focusMinutes}}
function updateEndTimePreview(resetConfirmation=false){if(resetConfirmation)byId("end-time-confirmed").checked=false;const values=readEndTimeValues(false);byId("end-focus-duration").textContent=values?isJprDemoWorkspace()?`${values.focusMinutes}分`:`${values.focusMinutes} 分钟`:"—";persistEndDraft()}
function confirmedEndTimeValues(){const values=readEndTimeValues(true);if(!values)return null;if(!byId("end-time-confirmed").checked){const error=byId("end-time-error");error.textContent=isJprDemoWorkspace()?"時刻を確認してチェックを入れてください":"请先确认开始和结束时间";error.hidden=false;return null}return values}
function openEndSessionDialog(){const project=currentProject();const session=activeSession(project);if(!session)return;const latest=latestImportedResult(session);const draft=sessionDraft(session,"end");byId("end-summary").innerHTML=sessionSummaryRows(project,session);byId("end-discoveries").value=draft?.discoveries||"";byId("end-next-step").value=draft?draft.nextStep||"":latest?.recommendedNextStep||latest?.nextStep||project.nextActions[0]||session.todos.find(todo=>!todo.completed)?.text||"";byId("end-started-at").value=draft?.startedAt||toDateTimeLocal(session.startedAt);byId("end-ended-at").value=draft?.endedAt||toDateTimeLocal(now());byId("end-time-confirmed").checked=Boolean(draft?.timeConfirmed);byId("end-time-error").hidden=true;byId("formal-end-actions").hidden=session.isDemo;byId("demo-end-actions").hidden=!session.isDemo;updateEndTimePreview(false);byId("end-dialog").showModal()}
function persistEndDraft(){persistSessionDraft("end",{discoveries:byId("end-discoveries").value,nextStep:byId("end-next-step").value,startedAt:byId("end-started-at").value,endedAt:byId("end-ended-at").value,timeConfirmed:byId("end-time-confirmed").checked})}
function pauseActiveWork(){const project=currentProject();const session=activeSession(project);if(!session)return;const timestamp=now();session.notes=byId("session-notes")?.value||session.notes||"";session.status="PAUSED";session.pausedAt=timestamp;session.updatedAt=timestamp;writeSessionDraftMirror(session);ui.view="dashboard";ui.zoneId=null;ui.projectId=null;render();showToast(isJprDemoWorkspace()?"今回の作業を一時停止しました。内容は保存されています":"本次工作已暂停，当前笔记和草稿均已保存")}
function latestImportedResult(session){return[...(session.importedResults||[])].reverse()[0]}
function fallbackProgressSummary(session){const completed=session.todos.filter(todo=>todo.completed).map(todo=>todo.text);const remaining=session.todos.filter(todo=>!todo.completed).map(todo=>todo.text);const notes=lines(byId("session-notes")?.value||session.notes);if(isJprDemoWorkspace())return[completed.length?`完了：${completed.join("；")}`:"今回は完了項目を選択していません",notes.length?`作業メモ：${notes.join("；")}`:"",remaining.length?`未完了：${remaining.join("；")}`:"今回の予定は完了しました",session.parkingAdded?.length?`一時メモ：${session.parkingAdded.join("；")}`:""].filter(Boolean);return[completed.length?`已完成：${completed.join("；")}`:"本次没有勾选完成项",notes.length?`工作记录：${notes.join("；")}`:"",remaining.length?`仍待处理：${remaining.join("；")}`:"当前计划内事项已收束",session.parkingAdded?.length?`暂存：${session.parkingAdded.join("；")}`:""].filter(Boolean)}
function sessionSummaryRows(project,session){const completed=session.todos.filter(todo=>todo.completed).map(todo=>todo.text);const remaining=session.todos.filter(todo=>!todo.completed).map(todo=>todo.text);const latest=latestImportedResult(session);const progress=latest?.progressSummary?.length?latest.progressSummary:fallbackProgressSummary(session);const recommended=latest?.recommendedNextStep||latest?.nextStep||project.nextActions[0]||remaining[0]||(isJprDemoWorkspace()?"要確認":"待确认");const rows=isJprDemoWorkspace()?[["今回の目標",session.goal],["現在地",progress],["完了",completed],["未完了",remaining],["確認結果",session.importedResults.flatMap(item=>item.verification||[])],["次の一歩",recommended]]:[["本次目标",session.goal],["当前进度总结",progress],["已完成",completed],["未完成",remaining],["验证结果",session.importedResults.flatMap(item=>item.verification||[])],["推荐下一步",recommended],["本次暂存",session.parkingAdded||[]]];return rows.map(([label,value])=>`<div class="preview-row"><strong>${label}</strong><p>${escapeHtml(text(value)||"—")}</p></div>`).join("")}
function ensureContributions(session){session.formalContributions={completed:[],nextActions:[],openIssues:[],currentStateBefore:"",currentStateAfter:"",progressSummaryBefore:"",progressSummaryAfter:"",...(session.formalContributions||{})};return session.formalContributions}
function trackProjectValues(project,session,field,values,{prepend=false}={}){const contribution=ensureContributions(session);const ordered=[...new Set(asList(values))];const incoming=ordered.filter(value=>!project[field].includes(value));if(prepend&&ordered.length)project[field]=[...ordered,...project[field].filter(value=>!ordered.includes(value))];else if(incoming.length)project[field]=[...project[field],...incoming];if(incoming.length)contribution[field]=[...new Set([...(contribution[field]||[]),...incoming])];return incoming}
function trackCurrentState(project,session,nextState){if(!nextState||nextState===project.currentState)return;const contribution=ensureContributions(session);if(!contribution.currentStateBefore)contribution.currentStateBefore=project.currentState;project.currentState=nextState;contribution.currentStateAfter=nextState}
function trackProgressSummary(project,session,summary){if(!summary||summary===project.currentProgressSummary)return;const contribution=ensureContributions(session);if(!contribution.progressSummaryBefore)contribution.progressSummaryBefore=project.currentProgressSummary||"";project.currentProgressSummary=summary;contribution.progressSummaryAfter=summary}
function addAIBlockers(project,session,items,timestamp){asList(items).forEach(value=>{if((project.blockers||[]).some(item=>item.status===BLOCKER_STATUS.OPEN&&window.ProjectOSPlanning.isHighlySimilar(item.text,value)))return;const blocker=normalizeBlocker({text:value,status:BLOCKER_STATUS.OPEN,priority:"NORMAL",source:"ai",sourceSessionId:session.id,createdAt:timestamp,updatedAt:timestamp},project.id,workspaceMode);project.blockers.push(blocker);session.blockerIds=[...new Set([...(session.blockerIds||[]),blocker.id])]})}
function applyResultToFormalProject(zone,project,session,result,timestamp,{recordDiscoveries=true,selections={progress:true,problems:true,next:true,memory:true,backlog:false}}={}){
  selections={problems:result.applyProblems!==false,...selections};
  trackProjectValues(project,session,"completed",result.completed);
  result.decisions.forEach(item=>{if(!project.decisions.includes(item))project.decisions.push(item)});
  if(selections.problems){const active=result.activeProblems||[];trackProjectValues(project,session,"openIssues",result.resultType==="STATUS_REVIEW"?[...active,...(result.remainingIssues||[])]:result.remainingIssues,{prepend:true});if(result.resultType!=="STATUS_REVIEW")addAIBlockers(project,session,active,timestamp);else if(active.length&&!currentBlockers(project).length)project.blockerReviewPending=true}
  if(selections.memory&&result.memoryUpdates.length)project.projectMemory.push(...asMemoryList(result.memoryUpdates).map(memory=>({...memory,sourceSessionId:session.id,source:"ai"})));
  if(recordDiscoveries)session.discoveries.push(...result.discoveries.filter(item=>!session.discoveries.includes(item)));
  if(selections.progress){const summary=result.progressSummary?.length?result.progressSummary.join("；"):[...result.changes,...result.verification.map(item=>`验证：${item}`)].join("；");if(summary){trackCurrentState(project,session,summary);trackProgressSummary(project,session,summary)}if(result.progressPhase)project.currentPhase=window.ProjectOSBootstrap.normalizePhase(result.progressPhase)}
  if(selections.next&&result.recommendedNextStep)trackProjectValues(project,session,"nextActions",[result.recommendedNextStep],{prepend:true});
  if(selections.backlog&&result.optionalNextSteps?.length)project.backlog=[...new Set([...project.backlog,...result.optionalNextSteps])];
  project.inProgress=window.ProjectOSBootstrap.dedupeList(project.inProgress);reconcileIssueLists(project);project.nextActions=window.ProjectOSBootstrap.dedupeList(project.nextActions);session.todos=window.ProjectOSBootstrap.dedupeTodos(session.todos);
  session.updatedAt=timestamp;project.updatedAt=timestamp;project.lastWorkedAt=timestamp;zone.summary=project.currentState;zone.updatedAt=timestamp;
}
function applyStatusReviewDraft(zone,project,session,draft,selections,timestamp){
  if(draft.resultType==="PROJECT_UPDATE"){
    if(selections.purpose)project.purpose=draft.projectPurpose||project.purpose;
    if(selections.goal)project.goal=draft.currentGoal||project.goal;
  }
  if(selections.state&&draft.currentStateSummary[0]){trackCurrentState(project,session,draft.currentStateSummary[0]);trackProgressSummary(project,session,draft.currentStateSummary[0])}
  if(selections.completed)trackProjectValues(project,session,"completed",draft.completed);
  if(selections.inProgress)project.inProgress=window.ProjectOSBootstrap.dedupeList(draft.inProgress);
  if(selections.problems){project.openIssues=window.ProjectOSBootstrap.dedupeList(draft.activeProblems);reconcileIssueLists(project);project.blockerReviewPending=project.openIssues.length>0&&!currentBlockers(project).length}
  if(selections.blockers)replaceOpenBlockers(project,draft.currentBlockers,timestamp,"ai-confirmed");
  if(selections.phase)project.currentPhase=window.ProjectOSBootstrap.normalizePhase(draft.progressPhase);
  if(selections.reason)project.currentProgressSummary=draft.progressJudgement||project.currentProgressSummary;
  if(selections.next&&draft.recommendedNextStep)project.nextActions=window.ProjectOSBootstrap.dedupeList([draft.recommendedNextStep,...project.nextActions.filter(item=>!window.ProjectOSPlanning.isHighlySimilar(item,draft.recommendedNextStep))]);
  if(selections.optional)project.backlog=window.ProjectOSBootstrap.dedupeList([...project.backlog,...draft.optionalNextSteps]);
  if(selections.defer)project.parkingLot=window.ProjectOSBootstrap.dedupeList([...project.parkingLot,...draft.shouldStopOrDefer]);
  if(selections.decisions)project.decisions=window.ProjectOSBootstrap.dedupeList([...project.decisions,...draft.decisions]);
  if(selections.constraints)project.constraints=window.ProjectOSBootstrap.dedupeList([...project.constraints,...draft.constraints]);
  if(selections.assets)project.assets=window.ProjectOSBootstrap.dedupeList([...project.assets,...draft.assets]);
  if(selections.memory&&draft.memoryUpdates.length){const existing=new Set(project.projectMemory.map(memoryText));const additions=asMemoryList(draft.memoryUpdates).filter(memory=>!existing.has(memory.text)).map(memory=>({...memory,sourceSessionId:session.id,source:"ai-confirmed"}));project.projectMemory.push(...additions)}
  if(selections.parking)project.parkingLot=window.ProjectOSBootstrap.dedupeList([...project.parkingLot,...draft.parkingLot]);
  session.updatedAt=timestamp;project.updatedAt=timestamp;project.lastWorkedAt=timestamp;zone.summary=project.currentState;zone.updatedAt=timestamp;
}
function prepareSessionEnd(session,discoveries,nextStep,timeValues){const timestamp=now();session.startedAt=timeValues.startedAt;session.endedAt=timeValues.endedAt;session.focusMinutes=timeValues.focusMinutes;session.timeConfirmedAt=timestamp;session.timeEntryMode="MANUAL_CONFIRMED";session.status="ENDED";session.updatedAt=timestamp;session.completed=session.todos.filter(todo=>todo.completed).map(todo=>todo.text);session.remainingIssues=session.todos.filter(todo=>!todo.completed).map(todo=>todo.text);session.discoveries.push(...lines(discoveries).filter(item=>!session.discoveries.includes(item)));session.nextStep=nextStep.trim();session.notes=byId("session-notes")?.value||session.notes||"";const latest=latestImportedResult(session);session.progressSummary=latest?.progressSummary?.length?latest.progressSummary:fallbackProgressSummary(session);session.summary=isJprDemoWorkspace()?`現在地：${session.progressSummary.join("；")||"未記録"}\n完了：${session.completed.join("；")||"なし"}\n未完了：${session.remainingIssues.join("；")||"なし"}\n集中時間：${session.focusMinutes}分\n次の一歩：${session.nextStep||"要確認"}`:`进度总结：${session.progressSummary.join("；")||"未记录"}\n完成：${session.completed.join("；")||"无"}\n未完成：${session.remainingIssues.join("；")||"无"}\n专注时长：${session.focusMinutes} 分钟\n下一步：${session.nextStep||"待定"}`;clearSessionRecovery(session);return timestamp}
function commitSessionEndToProject(zone,project,session,timestamp){trackProjectValues(project,session,"completed",session.completed);if(!isJprDemoWorkspace())trackProjectValues(project,session,"openIssues",session.remainingIssues,{prepend:true});reconcileIssueLists(project);trackProjectValues(project,session,"nextActions",isJprDemoWorkspace()?[session.nextStep].filter(Boolean):[session.nextStep,...session.remainingIssues].filter(Boolean),{prepend:true});if(!isJprDemoWorkspace())project.inProgress=[];const latest=latestImportedResult(session);if(!latest?.progressSummary?.length&&session.progressSummary?.length)trackCurrentState(project,session,session.progressSummary.join("；"));project.updatedAt=timestamp;project.lastWorkedAt=session.endedAt;zone.summary=project.currentState;zone.updatedAt=timestamp}
function finishStatusReviewUpdate(message){pendingStatusReview=null;closeDialog("status-review-dialog");render();showToast(message)}
function finishEndedSession(message){closeDialog("end-dialog");ui.view="project";ui.detailTab="history";render();showToast(message)}
function formalValuesFromSessions(sessions,field){const values=[];sessions.filter(countsAsFormal).forEach(session=>{values.push(...asList(session.formalContributions?.[field]));if(field==="completed"&&!session.formalContributions?.completed?.length)values.push(...asList(session.completed));if(field==="nextActions"&&!session.formalContributions?.nextActions?.length)values.push(...[session.nextStep,...asList(session.remainingIssues)].filter(Boolean));if(field==="openIssues"&&!session.formalContributions?.openIssues?.length)values.push(...asList(session.remainingIssues))});return new Set(values)}
function recomputeAfterSessionDeletion(zone,project,removed,{preserveFormalized=false,preserveCurrentState=false}={}){const remainingFormal=formalSessions(project);if(!preserveFormalized){[["completed","completed"],["nextActions","nextActions"],["openIssues","openIssues"]].forEach(([projectField,contributionField])=>{const protectedValues=formalValuesFromSessions(remainingFormal,contributionField);const removedValues=formalValuesFromSessions(removed,contributionField);project[projectField]=project[projectField].filter(value=>!removedValues.has(value)||protectedValues.has(value))});if(!preserveCurrentState)[...removed].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).forEach(session=>{const contribution=session.formalContributions||{};if(contribution.currentStateAfter&&project.currentState===contribution.currentStateAfter)project.currentState=contribution.currentStateBefore||project.currentState;if(contribution.progressSummaryAfter&&project.currentProgressSummary===contribution.progressSummaryAfter)project.currentProgressSummary=contribution.progressSummaryBefore||""})}const activeFormal=[...remainingFormal].reverse().find(session=>!session.endedAt);project.inProgress=activeFormal?activeFormal.todos.filter(todo=>!todo.completed).map(todo=>todo.text):[];const last=[...remainingFormal].reverse().find(session=>session.endedAt);project.lastWorkedAt=last?.endedAt||null;const timestamps=[project.nonSessionUpdatedAt||project.createdAt,...remainingFormal.map(session=>session.updatedAt||session.endedAt||session.startedAt)].filter(Boolean).map(value=>new Date(value).getTime()).filter(Number.isFinite);project.updatedAt=new Date(Math.max(...timestamps,new Date(project.createdAt).getTime())).toISOString();zone.summary=project.currentState;const zoneTimes=[zone.createdAt,...zone.projects.map(item=>item.updatedAt)].map(value=>new Date(value).getTime()).filter(Number.isFinite);zone.updatedAt=new Date(Math.max(...zoneTimes)).toISOString()}
function deleteProjectSessions(zone,project,sessionIds,{clearMemory=false,preserveFormalized=false,preserveCurrentState=false}={}){const ids=new Set(sessionIds);const removed=project.sessions.filter(session=>ids.has(session.id));removed.forEach(session=>sessionDraftStore.remove(session.workspaceId||workspaceMode,session.id));project.sessions=project.sessions.filter(session=>!ids.has(session.id));if(clearMemory)project.projectMemory=[];recomputeAfterSessionDeletion(zone,project,removed,{preserveFormalized,preserveCurrentState});return removed.length}
function resetDeleteActionLayout(mode="standard"){byId("standard-delete-actions").hidden=mode!=="standard";byId("last-history-initial-actions").hidden=mode!=="last";byId("last-history-choice").hidden=true;byId("keep-project-after-last-history").checked=false}
function openDeleteHistoryDialog({mode="sessions",projectId=ui.projectId,sessionIds=[]}={}){
  const zone=state.zones.find(item=>item.projects.some(project=>project.id===projectId))||currentZone();const project=zone?.projects.find(item=>item.id===projectId)||currentProject();resetDeleteActionLayout("standard");
  if(mode==="all-demo"){
    const count=state.zones.flatMap(item=>item.projects).flatMap(item=>item.sessions).filter(session=>session.isDemo).length;if(!count)return showToast("当前没有旧版演示记录");pendingDelete={mode};byId("delete-history-title").textContent="清除旧版演示记录";byId("delete-history-message").innerHTML=`<strong>确定永久清除旧版演示记录吗？</strong>将删除 ${count} 条旧版单次演示记录及其提示词和 AI 返回结果。独立演示工作区与正式记录不受影响。`;byId("clear-project-memory-option").hidden=true;
  }else{
    const ids=sessionIds.filter(id=>project?.sessions.some(session=>session.id===id));if(!ids.length)return showToast("请先选择工作历史");const clearAll=project&&ids.length===project.sessions.length;const lastHistory=window.ProjectOSLifecycle.isDeletingLastFormalHistory(project,ids);pendingDelete={mode:"sessions",zoneId:zone.id,projectId:project.id,projectName:project.name,sessionIds:ids,clearAll,lastHistory};byId("clear-project-memory-option").hidden=lastHistory||!clearAll;byId("clear-project-memory").checked=false;
    if(lastHistory){resetDeleteActionLayout("last");byId("delete-history-title").textContent="最后一条工作记录";byId("delete-history-message").innerHTML=`<strong>这是该项目最后一条工作记录。</strong><p>删除后，该项目将不再包含任何工作历史。</p><p>是否同时删除当前次级项目？</p><p>删除项目后，其项目记忆、状态、待办、暂存区等也将永久删除。</p>`}
    else{byId("delete-history-title").textContent=clearAll?"清空全部工作历史":"删除工作历史";byId("delete-history-message").innerHTML=clearAll?`<strong>这会永久删除当前项目的全部所选工作历史，无法恢复。</strong>项目本身及未选择删除的长期资料默认保留。`:`<strong>确定永久删除${ids.length>1?`选中的 ${ids.length} 条`:"这条"}工作历史吗？</strong>删除后无法恢复，也不会继续参与项目记忆与 AI 上下文生成。`}
  }
  byId("delete-history-dialog").showModal();
}

function removeProjectFromZone(zone,project){state.contextEvents=window.ProjectOSLifecycle.reconcileContextEvents(state.contextEvents,project);zone.projects=zone.projects.filter(item=>item.id!==project.id);const recent=recentProject(zone);zone.summary=recent?.currentState||"等待建立次级项目";zone.updatedAt=now()}
async function executePendingDelete({removeProject=false,keepEmptyProject=false}={}){
  if(!pendingDelete)return closeDialog("delete-history-dialog");let deletedCount=0;let removedProjectName="";let retainedProjectName="";
  if(pendingDelete.mode==="all-demo")state.zones.forEach(zone=>zone.projects.forEach(project=>{const ids=project.sessions.filter(session=>session.isDemo).map(session=>session.id);if(ids.length)deletedCount+=deleteProjectSessions(zone,project,ids,{preserveFormalized:true})}));
  else{const zone=state.zones.find(item=>item.id===pendingDelete.zoneId);const project=zone?.projects.find(item=>item.id===pendingDelete.projectId);if(project){deletedCount=deleteProjectSessions(zone,project,pendingDelete.sessionIds,{clearMemory:pendingDelete.clearAll&&byId("clear-project-memory").checked});if(removeProject&&pendingDelete.lastHistory){removedProjectName=project.name;removeProjectFromZone(zone,project);ui.view="zone";ui.zoneId=zone.id;ui.projectId=null}else if(keepEmptyProject&&pendingDelete.lastHistory){retainedProjectName=project.name;Object.assign(project,window.ProjectOSLifecycle.resetProjectAfterLastHistory(project,now()));zone.summary=project.currentState;zone.updatedAt=project.updatedAt}}}
  await save();pendingDelete=null;ui.historyManage=false;ui.selectedHistoryIds=[];closeDialog("delete-history-dialog");if(ui.view==="focus"&&!activeSession(currentProject()))ui.view="project";render();showToast(removedProjectName?`已删除记录并移除空项目「${removedProjectName}」`:retainedProjectName?`已删除记录并保留空项目「${retainedProjectName}」`:`已永久删除 ${deletedCount} 条工作历史`);
}

function findTask(kind,id){if(kind==="zone"){const zone=state.zones.find(item=>item.id===id);return zone?{task:zone,zone}:null}for(const zone of state.zones){const project=zone.projects.find(item=>item.id===id);if(project)return{task:project,zone,project}}return null}
function closeTaskMenus(except=null){document.querySelectorAll(".task-menu-dropdown").forEach(menu=>{if(menu!==except)menu.hidden=true})}
function openTaskEdit(kind,id){const found=findTask(kind,id);if(!found)return showToast("任务不存在或已被删除");pendingTaskAction={kind,id,command:"EDIT"};const task=found.task;byId("task-edit-eyebrow").textContent=kind==="zone"?"主任务设置":"项目设置";byId("task-edit-title").textContent=`编辑「${task.name}」`;byId("task-edit-name").value=task.name;byId("task-edit-purpose").value=task.purpose||"";byId("task-edit-goal-label").textContent=kind==="zone"?"母目标":"当前目标";byId("task-edit-goal").value=kind==="zone"?task.motherGoal||"":task.goal||"";byId("task-edit-dialog").showModal()}
const STATE_ACTIONS={PAUSE:{status:TASK_STATUS.PAUSED,title:"暂停任务",message:"暂停后，该任务仍会保留全部记忆、工作历史和下一步，但暂时不会作为优先推进项目。",confirm:"确认暂停"},FREEZE:{status:TASK_STATUS.FROZEN,title:"冻结任务",message:"冻结适合暂时不准备继续推进的长期任务。所有进度、记忆和工作历史都会完整保存，但不会参与日常推荐和活跃统计。",confirm:"确认冻结"},COMPLETE:{status:TASK_STATUS.COMPLETED,title:"标记完成",message:"标记完成后会完整保留任务存档，并退出日常推荐。需要再次推进时可以重新开启。",confirm:"标记完成"},REOPEN:{status:TASK_STATUS.ACTIVE,title:"重新开启",message:"将恢复为进行中任务，保留原有记忆、全部工作历史、关键决策和推荐下一步，不会创建新的空任务。",confirm:"重新开启"}};
function openTaskStateChange(kind,id,command){const found=findTask(kind,id);const config=STATE_ACTIONS[command];if(!found||!config)return;pendingTaskAction={kind,id,command};byId("task-state-title").textContent=`${config.title}「${found.task.name}」`;byId("task-state-message").innerHTML=`<strong>${config.message}</strong><p>项目生命周期与本次工作状态相互独立，当前工作记录不会被删除。</p>`;byId("confirm-task-state").textContent=config.confirm;byId("task-state-dialog").showModal()}
function openTaskDelete(kind,id){const found=findTask(kind,id);if(!found)return showToast("任务不存在或已被删除");pendingTaskAction={kind,id,command:"DELETE"};const task=found.task;const isZone=kind==="zone";const projects=isZone?task.projects:[];const links=linkedFor(found.zone.id);byId("task-delete-title").textContent=`永久删除「${task.name}」`;byId("task-delete-message").innerHTML=isZone?`<strong>删除主任务将级联删除其下全部 ${projects.length} 个次级项目。</strong>项目记忆、工作历史、AI Prompt、AI 返回结果、待办池、暂存区、资产与决策都会立即永久删除。`:`<strong>确定永久删除「${escapeHtml(task.name)}」吗？</strong>将同时删除项目记忆、工作历史、AI Prompt、AI 返回结果、待办池、暂存区、资产与决策。删除后无法恢复。`;byId("task-delete-children").hidden=!projects.length;byId("task-delete-children").innerHTML=projects.length?`<strong>将被级联删除的次级项目</strong><ul>${projects.map(project=>`<li>${escapeHtml(project.name)}</li>`).join("")}</ul>`:"";byId("task-delete-links").hidden=!links.length;byId("task-delete-links").innerHTML=links.length?(isZone?`该任务与 ${links.length} 个其他主任务存在关联。删除后相关 ZoneLink 会移除；已确认历史事件会保留并标记“来源任务已删除”。`:`该项目所在主任务与 ${links.length} 个其他主任务存在关联。删除后该项目产生的实时引用会移除；主任务间 Link 仍保留。`):"";byId("task-delete-name-confirm").value="";byId("task-delete-name-confirm").placeholder=task.name;byId("confirm-task-delete").disabled=true;byId("task-delete-dialog").showModal()}
function executeTaskDelete(){if(!pendingTaskAction)return;const found=findTask(pendingTaskAction.kind,pendingTaskAction.id);if(!found)return closeDialog("task-delete-dialog");const {kind}=pendingTaskAction;const name=found.task.name;if(kind==="project"){state.contextEvents=window.ProjectOSLifecycle.reconcileDeletedTaskEvents(state.contextEvents,{projectIds:[found.project.id],zoneId:null,zoneName:found.zone.name});found.zone.projects=found.zone.projects.filter(project=>project.id!==found.project.id);const recent=recentProject(found.zone);found.zone.summary=recent?.currentState||"等待建立次级项目";found.zone.updatedAt=now();ui.view="zone";ui.zoneId=found.zone.id;ui.projectId=null}else{const projectIds=found.zone.projects.map(project=>project.id);state.contextEvents=window.ProjectOSLifecycle.reconcileDeletedTaskEvents(state.contextEvents,{projectIds,zoneId:found.zone.id,zoneName:found.zone.name});state.zoneLinks=state.zoneLinks.filter(link=>link.sourceZoneId!==found.zone.id&&link.targetZoneId!==found.zone.id);state.zones=state.zones.filter(zone=>zone.id!==found.zone.id);ui.view="dashboard";ui.zoneId=null;ui.projectId=null}pendingTaskAction=null;closeDialog("task-delete-dialog");render();showToast(`已永久删除${kind==="zone"?"主任务":"次级项目"}「${name}」`)}
function handleTaskCommand(kind,id,command){const found=findTask(kind,id);if(!found)return showToast("任务不存在或已被删除");const allowed=window.ProjectOSLifecycle.taskMenuActions(found.task);if(!allowed.includes(command)&&command!=="REOPEN")return showToast("当前状态不能执行这个操作");closeTaskMenus();if(command==="EDIT")return openTaskEdit(kind,id);if(command==="DELETE")return openTaskDelete(kind,id);if(command==="VIEW"){ui.zoneId=found.zone.id;ui.projectId=kind==="project"?found.project.id:null;ui.view=kind==="project"?"project":"zone";return render()}openTaskStateChange(kind,id,command)}
function showToast(message){const toast=byId("toast");toast.textContent=message;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),2000)}
async function copyText(value,message){try{await navigator.clipboard.writeText(value);showToast(message)}catch{showToast("复制失败，请手动选择文本")}}

const SKILL_TYPE_LABELS={installed:"第三方",self:"自建",external:"外部工具"};
const SKILL_TYPE_ICONS={installed:"◎",self:"✦",external:"↗"};
function skillProjectCount(skillId){return state.zones.flatMap(zone=>zone.projects).filter(project=>(project.skillIds||[]).includes(skillId)).length}
function renderSkillLibrary(){const counts={installed:state.skills.filter(item=>item.type==="installed").length,self:state.skills.filter(item=>item.type==="self").length,external:state.skills.filter(item=>item.type==="external").length};const shown=ui.skillFilter==="all"?state.skills:state.skills.filter(item=>item.type===ui.skillFilter);byId("skill-library-content").innerHTML=`<div class="skill-summary"><div><strong>${state.skills.length}</strong><span>能力总数</span></div><div><strong>${counts.installed}</strong><span>第三方</span></div><div><strong>${counts.self}</strong><span>自建</span></div><div><strong>${counts.external}</strong><span>外部工具</span></div></div><div class="skill-toolbar"><div class="skill-tabs">${[["all","全部"],["installed","第三方"],["self","自建"],["external","外部工具"]].map(([key,label])=>`<button type="button" class="mode-tab ${ui.skillFilter===key?"is-active":""}" data-skill-filter="${key}">${label}</button>`).join("")}</div><button type="button" class="primary-button" data-action-global="add-skill">＋ 手动添加</button></div><div class="skill-grid">${shown.map(skill=>renderSkillCard(skill)).join("")||'<p class="form-hint">这个分类还没有能力资产。</p>'}</div><div class="tool-rule"><strong>能力装备栏只记录可用资源。</strong>项目关联与使用记录只属于当前工作区；本轮仍不会自动调用外部 Agent。</div>`;}
function renderSkillCard(skill){const projectCount=skillProjectCount(skill.id);return `<article class="skill-card equipment-card"><div class="skill-card-head"><div class="skill-identity"><span class="skill-icon">${SKILL_TYPE_ICONS[skill.type]||"•"}</span><span class="skill-type ${skill.type}">${SKILL_TYPE_LABELS[skill.type]||"能力"}</span></div><span class="skill-status">${skill.status==="active"?"可用":"停用"}</span></div><h3>${escapeHtml(skill.name)}</h3><p>${escapeHtml(skill.description||"尚未补充简介")}</p><dl><dt>来源</dt><dd>${escapeHtml(skill.source||"未记录")}</dd><dt>关联项目</dt><dd>${projectCount} 个</dd>${skill.version?`<dt>版本</dt><dd>${escapeHtml(skill.version)}</dd>`:""}</dl><div class="skill-tags">${skill.tags.map(tag=>`<span>${escapeHtml(tag)}</span>`).join("")}</div></article>`;}
function openSkillDialog(){byId("skill-form").reset();clearInlineErrors(byId("skill-dialog"));byId("skill-dialog").showModal();setTimeout(()=>byId("skill-name").focus(),30)}
function openProjectSkillsDialog(){const project=currentProject();byId("project-skill-options").innerHTML=state.skills.map(skill=>`<label><input type="checkbox" name="project-skill" value="${skill.id}" ${(project.skillIds||[]).includes(skill.id)?"checked":""}> ${escapeHtml(skill.name)} <small>${SKILL_TYPE_LABELS[skill.type]}</small></label>`).join("")||'<p>技能库为空，请先添加技能。</p>';byId("project-skills-dialog").showModal();}

function importPreviewRows(workspace) {
  const projects=workspace.zones.flatMap(zone=>zone.projects||[]);
  const sessions=projects.flatMap(project=>project.sessions||[]);
  const memories=workspace.zones.reduce((count,zone)=>count+(zone.sharedMemory||[]).length,0)+projects.reduce((count,project)=>count+(project.projectMemory||[]).length,0);
  const rows=[["主任务",workspace.zones.length],["次级项目",projects.length],["工作记录",sessions.length],["记忆条目",memories],["灵感",(workspace.inspirations||[]).length],["关联关系",(workspace.zoneLinks||[]).length],["技能 / 外部工具",(workspace.skills||[]).length]];
  return rows.map(([label,value])=>`<div class="preview-row"><strong>${label}</strong><p>${value}</p></div>`).join("");
}

app.addEventListener("submit",event=>{
  const form=event.target.closest("[data-inspiration-form]");if(!form)return;
  event.preventDefault();const input=form.querySelector("input");const value=input?.value.trim();if(!value)return;
  const fromSession=form.dataset.inspirationForm==="session";const zone=fromSession?currentZone():null;const project=fromSession?currentProject():null;const session=fromSession?activeSession(project):null;const before=state.inspirations.length;
  const item=addInspiration(value,{zone,project,session});if(!item)return;
  if(fromSession){clearSessionDraft("inspirationInput",session)}else persistDashboardInspirationDraft("");
  ui.inspirationOpen=true;ui.inspirationSelectedId=item.id;render();showToast(before===state.inspirations.length?(isJprDemoWorkspace()?"同じアイデアはすでに保存されています":"这条灵感已经在库中"):(isJprDemoWorkspace()?"アイデアライブラリに保存しました":"已加入灵感库，不会变成待办事项"));
});

app.addEventListener("click",event=>{const control=event.target.closest("[data-action]");if(!control)return;const action=control.dataset.action;
  if(action==="add-zone")openAddDialog("zone"); if(action==="add-project")openAddDialog("project");
  if(action==="load-demo-sample"&&workspaceMode===WORKSPACE_MODES.DEMO){state=demoSampleState(state.skills);render();showToast("示例演示数据已载入")}
  if(action==="load-jpr-sample"&&isJprDemoWorkspace()){state=jprDemoState();resetUi();render();showToast("JPRデモを開始しました")}
  if(action==="today-summary"){ui.todaySummaryOpen=!ui.todaySummaryOpen;render();if(ui.todaySummaryOpen)setTimeout(()=>{const panel=byId("today-summary-panel");panel?.focus({preventScroll:true});panel?.scrollIntoView({behavior:"smooth",block:"start"})},20);return}
  if(action==="toggle-inspiration-library"){ui.inspirationOpen=!ui.inspirationOpen;if(!ui.inspirationOpen)ui.inspirationSelectedId=null;render();return}
  if(action==="select-inspiration"){const id=control.dataset.inspirationId;ui.inspirationSelectedId=ui.inspirationSelectedId===id?null:id;render();return}
  if(action==="set-inspiration-orb"){const item=state.inspirations.find(entry=>entry.id===control.dataset.inspirationId);const presetId=control.dataset.orbPreset;if(!item||!INSPIRATION_ORB_PRESETS.includes(presetId))return;item.orbPresetId=presetId;item.updatedAt=now();render();showToast(isJprDemoWorkspace()?"アイデアのAIオーブを変更しました":"已更换这条灵感绑定的 AI 球");return}
  if(action==="dashboard-stat"){ui.dashboardStat=control.dataset.stat;render();setTimeout(()=>{const panel=byId("dashboard-stat-detail");panel?.focus({preventScroll:true});panel?.scrollIntoView({behavior:"smooth",block:"start"})},20);return}
  if(action==="close-dashboard-stat"){ui.dashboardStat=null;render();return}
  if(action==="toggle-task-menu"){event.stopPropagation();const menu=control.nextElementSibling;const willOpen=menu.hidden;closeTaskMenus(menu);menu.hidden=!willOpen;return}
  if(action==="task-command"){event.stopPropagation();handleTaskCommand(control.dataset.taskKind,control.dataset.taskId,control.dataset.command);return}
  if(action==="dashboard"){ui.view="dashboard";ui.zoneId=null;ui.projectId=null;render()} if(action==="open-zone"){ui.view="zone";ui.zoneId=control.dataset.zoneId;ui.projectId=null;ui.showAllProjects=false;ui.showArchivedProjects=false;render()} if(action==="back-zone"){ui.view="zone";ui.projectId=null;render()} if(action==="open-project"){ui.view="project";if(control.dataset.zoneId)ui.zoneId=control.dataset.zoneId;ui.projectId=control.dataset.projectId;ui.detailTab="memory";render()} if(action==="back-project"){ui.view="project";render()}
  if(action==="edit-project-state")openProjectStateEdit(control.dataset.editField||"");
  if(action==="toggle-other"){ui.showOtherZones=!ui.showOtherZones;render()} if(action==="toggle-archived-zones"){ui.showArchivedZones=!ui.showArchivedZones;render()} if(action==="toggle-archived-projects"){ui.showArchivedProjects=!ui.showArchivedProjects;render()} if(action==="toggle-projects"){ui.showAllProjects=!ui.showAllProjects;render()} if(action==="detail-tab"){ui.detailTab=control.dataset.tab;if(ui.detailTab!=="history"){ui.historyManage=false;ui.selectedHistoryIds=[]}render()} if(action==="continue-work"){if(!isActiveTask(currentZone())||!isActiveTask(currentProject()))return showToast("请先重新开启任务");openSessionPlan(currentProject())} if(action==="manage-links")openLinkDialog(); if(action==="manage-project-skills")openProjectSkillsDialog();
  if(action==="toggle-keep-empty"){const project=currentProject();const timestamp=now();project.keepWhenEmpty=control.checked;project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;render();showToast(project.keepWhenEmpty?"已设置：空项目也会保留":"已取消空项目保留标记")}
  if(action==="record-blocker"){byId("blocker-form").reset();byId("blocker-dialog").showModal();setTimeout(()=>byId("blocker-text").focus(),40)}
  if(action==="set-blocker-status"){
    const project=currentProject();const blocker=project.blockers.find(item=>item.id===control.dataset.blockerId);const status=control.dataset.blockerStatus;
    if(blocker&&Object.values(BLOCKER_STATUS).includes(status)){
      const timestamp=now();blocker.status=status;blocker.updatedAt=timestamp;blocker.resolvedAt=status===BLOCKER_STATUS.RESOLVED?timestamp:null;blocker.deferredAt=status===BLOCKER_STATUS.DEFERRED?timestamp:null;
      if(status!==BLOCKER_STATUS.OPEN){project.nextActions=project.nextActions.filter(item=>!item.includes(blocker.text));const session=activeSession(project);if(status===BLOCKER_STATUS.RESOLVED&&session)session.todos.filter(todo=>todo.text.includes(blocker.text)).forEach(todo=>{todo.completed=true;todo.updatedAt=timestamp});project.inProgress=(session?.todos||[]).filter(todo=>!todo.completed).map(todo=>todo.text)}
      project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;render();showToast(status===BLOCKER_STATUS.RESOLVED?"问题已标记解决":status===BLOCKER_STATUS.DEFERRED?"问题已移到稍后处理":"问题已重新打开");
    }
  }
  if(action==="set-issue-status"){
    const project=currentProject();const source=control.dataset.issueList==="resolved"?project.resolvedIssues:project.openIssues;const index=Number(control.dataset.issueIndex);const value=source?.[index];
    if(value!==undefined){source.splice(index,1);const target=control.dataset.issueList==="resolved"?project.openIssues:project.resolvedIssues;target.push(value);project.openIssues=window.ProjectOSBootstrap.dedupeList(project.openIssues);project.resolvedIssues=window.ProjectOSBootstrap.dedupeList(project.resolvedIssues);const timestamp=now();project.blockerReviewPending=project.openIssues.length>0&&!currentBlockers(project).length;project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;render();showToast(control.dataset.issueList==="resolved"?"问题已恢复为未解决":"问题已标记解决")}
  }
  if(action==="delete-issue"){
    const project=currentProject();const source=control.dataset.issueList==="resolved"?project.resolvedIssues:project.openIssues;const index=Number(control.dataset.issueIndex);if(source?.[index]!==undefined){source.splice(index,1);const timestamp=now();project.blockerReviewPending=project.openIssues.length>0&&!currentBlockers(project).length;project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;render();showToast("问题已删除")}
  }
  if(action==="delete-blocker"){
    const project=currentProject();const index=project.blockers.findIndex(item=>item.id===control.dataset.blockerId);if(index>=0){const [blocker]=project.blockers.splice(index,1);project.sessions.forEach(session=>session.blockerIds=(session.blockerIds||[]).filter(id=>id!==blocker.id));project.nextActions=project.nextActions.filter(item=>!item.includes(blocker.text));const timestamp=now();project.blockerReviewPending=project.openIssues.length>0&&!currentBlockers(project).length;project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;render();showToast("问题已删除")}
  }
  if(action==="toggle-todo"){const project=currentProject();const session=activeSession(project);const todo=session.todos.find(item=>item.id===control.dataset.todoId);const timestamp=now();todo.completed=!todo.completed;todo.updatedAt=timestamp;session.updatedAt=timestamp;if(!session.isDemo)project.updatedAt=timestamp;render()}
  if(action==="add-parking"){const input=byId("parking-input");const value=input.value.trim();if(value){const project=currentProject();const session=activeSession(project);const timestamp=now();if(!session.isDemo)project.parkingLot.push(value);session.parkingAdded.push(value);session.updatedAt=timestamp;if(!session.isDemo)project.updatedAt=timestamp;clearSessionDraft("parkingInput",session);render();showToast(session.isDemo?"已放入演示暂存，不影响正式项目":"已放入暂存区，不打断当前工作")}}
  if(action==="stuck")openStuckDialog();
  if(action==="status-review")openStatusReviewDialog("status-review");
  if(action==="summarize-work")openStatusReviewDialog("work-summary");
  if(action==="pause-session")pauseActiveWork();
  if(action==="end-session")openEndSessionDialog();
  if(action==="manage-history"){ui.historyManage=true;ui.selectedHistoryIds=[];render()}
  if(action==="cancel-history-manage"){ui.historyManage=false;ui.selectedHistoryIds=[];render()}
  if(action==="toggle-history-selection"){const id=control.dataset.sessionId;ui.selectedHistoryIds=control.checked?[...new Set([...ui.selectedHistoryIds,id])]:ui.selectedHistoryIds.filter(item=>item!==id);render()}
  if(action==="delete-session")openDeleteHistoryDialog({sessionIds:[control.dataset.sessionId]});
  if(action==="delete-selected-history")openDeleteHistoryDialog({sessionIds:ui.selectedHistoryIds});
  if(action==="clear-project-history")openDeleteHistoryDialog({sessionIds:currentProject().sessions.map(session=>session.id)});
  if(action==="clear-demo-data")openDeleteHistoryDialog({mode:"all-demo"});
});

document.querySelectorAll("[data-close-dialog]").forEach(button=>button.addEventListener("click",event=>{event.preventDefault();closeDialog(button.dataset.closeDialog)}));
document.querySelectorAll("[data-add-mode]").forEach(button=>button.addEventListener("click",()=>setAddMode(button.dataset.addMode)));
document.querySelectorAll("dialog").forEach(dialog=>{dialog.addEventListener("close",()=>resetDialog(dialog));dialog.addEventListener("click",event=>{if(event.target===dialog)closeDialog(dialog.id)})});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){const dialog=topOpenDialog();if(dialog){event.preventDefault();closeDialog(dialog.id)}}},true);
byId("home-button").addEventListener("click",()=>{ui.view="dashboard";ui.zoneId=null;ui.projectId=null;render()});
byId("tools-button").addEventListener("click",()=>{renderSkillLibrary();byId("tools-dialog").showModal()});
byId("demo-mode-button").addEventListener("click",async()=>{if(IS_JPR_PAGE){window.location.href="./index.html";return}if(isDemoWorkspace()){await switchWorkspace(WORKSPACE_MODES.NORMAL);showToast("已退出演示模式，正式项目保持原样")}else byId("enter-demo-dialog").showModal()});
byId("confirm-enter-demo").addEventListener("click",async()=>{closeDialog("enter-demo-dialog");await switchWorkspace(WORKSPACE_MODES.DEMO);showToast("已进入独立演示环境")});
byId("jpr-demo-button")?.addEventListener("click",()=>{window.location.href="./jpr-demo.html"});
byId("confirm-enter-jpr-demo")?.addEventListener("click",()=>{window.location.href="./jpr-demo.html"});
byId("reset-demo-button").addEventListener("click",()=>byId("reset-demo-dialog").showModal());
byId("confirm-reset-demo").addEventListener("click",async()=>{if(!isDemoWorkspace())return closeDialog("reset-demo-dialog");const wasJpr=isJprDemoWorkspace();sessionDraftStore.clearWorkspace(workspaceMode);state=wasJpr?jprBlankState():demoInitialState(state.skills);resetUi();await save();closeDialog("reset-demo-dialog");render();showToast(wasJpr?"JPRデモを最初の画面に戻しました":"演示数据已重置，正式项目未改变")});
document.addEventListener("click",event=>{
  if(!event.target.closest(".task-menu"))closeTaskMenus();
  const filter=event.target.closest("[data-skill-filter]");
  if(filter){ui.skillFilter=filter.dataset.skillFilter;renderSkillLibrary();save();return;}
  const action=event.target.closest("[data-action-global]")?.dataset.actionGlobal;
  if(action==="add-skill")openSkillDialog();
});

byId("add-form").addEventListener("submit",event=>{event.preventDefault();if(byId("manual-mode").hidden)return;const name=byId("manual-name").value.trim();if(!name){byId("manual-name-error").hidden=false;byId("manual-name").classList.add("input-error");byId("manual-name").focus();return}byId("manual-name-error").hidden=true;byId("manual-name").classList.remove("input-error");const purpose=byId("manual-purpose").value.trim();const goal=byId("manual-goal").value.trim();if(ui.addKind==="zone"){const zone=createZone({name,purpose,motherGoal:goal,summary:"刚刚建立，等待推进。",color:COLORS[state.zones.length%COLORS.length]});state.zones.push(zone);closeDialog("add-dialog");ui.view="zone";ui.zoneId=zone.id;render();showToast("主任务已建立")}else{const zone=currentZone();const project=createProject({name,purpose,goal,nextActions:[],color:zone.color},zone.id);addProjectOriginHistory(project,"manual");zone.projects.push(project);zone.updatedAt=now();closeDialog("add-dialog");ui.view="project";ui.projectId=project.id;render();showToast("次级项目已建立，工作历史 No.1 已保存")}});
byId("manual-name").addEventListener("input",()=>{if(byId("manual-name").value.trim()){byId("manual-name-error").hidden=true;byId("manual-name").classList.remove("input-error")}});
byId("project-state-edit-form").addEventListener("submit",event=>{event.preventDefault();const project=currentProject();if(!project)return closeDialog("project-state-edit-dialog");const timestamp=now();const previousNext=project.nextActions[0]||"";project.purpose=byId("edit-project-purpose").value.trim();project.goal=byId("edit-project-goal").value.trim();project.currentState=byId("edit-project-state").value.trim()||"尚未记录";project.currentPhase=window.ProjectOSBootstrap.normalizePhase(byId("edit-project-phase").value);project.completed=window.ProjectOSBootstrap.dedupeList(lines(byId("edit-project-completed").value));project.importedMilestones=[];project.openIssues=window.ProjectOSBootstrap.dedupeList(lines(byId("edit-project-issues").value));reconcileIssueLists(project);replaceOpenBlockers(project,lines(byId("edit-project-blockers").value),timestamp,"manual");const recommended=byId("edit-project-next").value.trim();project.nextActions=recommended?window.ProjectOSBootstrap.dedupeList([recommended,...project.nextActions.filter(item=>item!==previousNext)]):project.nextActions.filter(item=>item!==previousNext);project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().summary=project.currentState;currentZone().updatedAt=timestamp;closeDialog("project-state-edit-dialog");render();showToast("人工确认的项目现状已保存")});
byId("copy-bootstrap").addEventListener("click",()=>copyText(ui.addKind==="zone"?ZONE_BOOTSTRAP_PROMPT:PROJECT_BOOTSTRAP_PROMPT,"项目归档提示词已复制"));
byId("parse-bootstrap").addEventListener("click",()=>{const raw=byId("bootstrap-result").value.trim();if(!raw)return showToast("请先粘贴 AI 返回内容");const parsed=bootstrapData(raw,ui.addKind);if(!parsed.ok)return showInlineError(byId("bootstrap-result"),parsed.error);showBootstrapPreview(parsed.value)});
byId("preview-form").addEventListener("submit",event=>{
  event.preventDefault();
  const nextActions=bootstrapPreviewValue("next",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-next").value)),[]);
  const completed=bootstrapPreviewValue("completed",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-completed").value)),[]);
  const openIssues=bootstrapPreviewValue("issues",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-issues").value)),[]);
  const blockers=bootstrapPreviewValue("blockers",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-blockers").value)),[]);
  const data={...pendingBootstrap,name:byId("preview-name").value.trim(),purpose:bootstrapPreviewValue("purpose",byId("preview-purpose").value.trim()),goal:bootstrapPreviewValue("goal",byId("preview-goal").value.trim()),currentState:bootstrapPreviewValue("state",byId("preview-state").value.trim()),currentPhase:bootstrapPreviewValue("phase",byId("preview-phase").value),nextActions,completed,importedMilestones:window.ProjectOSBootstrap.makeImportedMilestones(completed,pendingBootstrap.snapshotMeta?.importedAt||now(),pendingBootstrap.importedMilestones),inProgress:bootstrapPreviewValue("progress",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-progress").value)),[]),openIssues,currentBlockers:blockers,blockerReviewPending:openIssues.length>0&&!blockers.length,decisions:bootstrapPreviewValue("decisions",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-decisions").value)),[]),projectMemory:bootstrapPreviewValue("memory",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-memory").value)),[]),constraints:bootstrapPreviewValue("constraints",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-constraints").value)),[]),assets:bootstrapPreviewValue("assets",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-assets").value)),[]),parkingLot:bootstrapPreviewValue("parking",window.ProjectOSBootstrap.dedupeList(lines(byId("preview-parking").value)),[])};
  if(!data.name)return showInlineError(byId("preview-name"),"请输入项目名称");
  if(data.kind==="zone"){const zone=createZone({name:data.name,purpose:data.purpose,motherGoal:data.goal,summary:data.currentState,sharedMemory:data.sharedMemory,constraints:data.openIssues,color:COLORS[state.zones.length%COLORS.length],projects:data.nextActions.map(name=>({name,currentState:"等待确认项目状态"}))});state.zones.push(zone);closeDialog("preview-dialog");ui.view="zone";ui.zoneId=zone.id;ui.projectId=null;render();showToast("主任务背景已导入")}
  else{const zone=currentZone();const project=createProject(data,zone.id);addProjectOriginHistory(project,"ai",data.bootstrapJson);zone.projects.push(project);zone.summary=project.currentState;zone.updatedAt=now();closeDialog("preview-dialog");ui.view="project";ui.projectId=project.id;render();showToast("项目记忆、当前现状与工作历史 No.1 已导入")}
});

byId("task-edit-form").addEventListener("submit",event=>{event.preventDefault();if(!pendingTaskAction)return;const found=findTask(pendingTaskAction.kind,pendingTaskAction.id);if(!found)return closeDialog("task-edit-dialog");const name=byId("task-edit-name").value.trim();if(!name)return showInlineError(byId("task-edit-name"),"请输入任务名称");const timestamp=now();found.task.name=name;found.task.purpose=byId("task-edit-purpose").value.trim();if(pendingTaskAction.kind==="zone")found.task.motherGoal=byId("task-edit-goal").value.trim();else{found.task.goal=byId("task-edit-goal").value.trim();found.task.nonSessionUpdatedAt=timestamp;found.zone.updatedAt=timestamp}found.task.updatedAt=timestamp;const kindLabel=pendingTaskAction.kind==="zone"?"主任务":"次级项目";pendingTaskAction=null;closeDialog("task-edit-dialog");render();showToast(`${kindLabel}设置已更新`)});
byId("task-state-form").addEventListener("submit",event=>{event.preventDefault();if(!pendingTaskAction)return;const action={...pendingTaskAction};const found=findTask(action.kind,action.id);const config=STATE_ACTIONS[action.command];if(!found||!config)return closeDialog("task-state-dialog");const timestamp=now();found.task.status=config.status;found.task.paused=config.status===TASK_STATUS.PAUSED;found.task.updatedAt=timestamp;if(action.kind==="project"){found.task.nonSessionUpdatedAt=timestamp;found.zone.updatedAt=timestamp}pendingTaskAction=null;closeDialog("task-state-dialog");render();showToast(`「${found.task.name}」已${config.status===TASK_STATUS.ACTIVE?"重新开启":config.status===TASK_STATUS.PAUSED?"暂停":config.status===TASK_STATUS.FROZEN?"冻结":"标记完成"}`)});
byId("task-delete-name-confirm").addEventListener("input",()=>{const found=pendingTaskAction?findTask(pendingTaskAction.kind,pendingTaskAction.id):null;byId("confirm-task-delete").disabled=!found||byId("task-delete-name-confirm").value.trim()!==found.task.name});
byId("task-delete-form").addEventListener("submit",event=>{event.preventDefault();if(byId("confirm-task-delete").disabled)return;executeTaskDelete()});

byId("session-form").addEventListener("submit",event=>{if(!byId("session-blocker-yes").checked)return;const blockerText=byId("session-blocker-text").value.trim();if(!blockerText)return;const primary=byId("todo-primary").value.trim();const blockerPrimary=window.ProjectOSPlanning.blockerAction(blockerText);if(window.ProjectOSPlanning.isHighlySimilar(primary,blockerPrimary))return;event.preventDefault();event.stopImmediatePropagation();byId("todo-primary").value=blockerPrimary;showInlineError(byId("todo-primary"),"已根据本次高优先级阻塞生成首要验证动作，请确认后再次开始")},true);
document.querySelectorAll('[name="session-blocker-choice"]').forEach(input=>input.addEventListener("change",()=>{const hasBlocker=byId("session-blocker-yes").checked;byId("session-blocker-input-panel").hidden=!hasBlocker;if(hasBlocker)setTimeout(()=>byId("session-blocker-text").focus(),30)}));
byId("blocker-form").addEventListener("submit",event=>{event.preventDefault();const value=byId("blocker-text").value.trim();if(!value)return showInlineError(byId("blocker-text"),"请描述真实存在的问题");const project=currentProject();const timestamp=now();const session=activeSession(project);const blocker=normalizeBlocker({text:value,status:BLOCKER_STATUS.OPEN,priority:byId("blocker-priority").value,source:"manual",sourceSessionId:session?.id||null,createdAt:timestamp,updatedAt:timestamp},project.id,workspaceMode);project.blockers.push(blocker);project.blockerReviewPending=false;if(session)session.blockerIds=[...new Set([...(session.blockerIds||[]),blocker.id])];project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;closeDialog("blocker-dialog");render();showToast("未解决问题已记录")});
byId("session-form").addEventListener("submit",event=>{event.preventDefault();const goal=byId("session-goal").value.trim();const primary=byId("todo-primary").value.trim();if(!goal)return showInlineError(byId("session-goal"),isJprDemoWorkspace()?"今回の目標を入力してください":"请输入描述完成状态的本次目标");if(!primary)return showInlineError(byId("todo-primary"),isJprDemoWorkspace()?"すぐ実行できる最初のアクションを入力してください":"请输入可立即执行的首要行动");const hasBlocker=byId("session-blocker-yes").checked;const blockerText=byId("session-blocker-text").value.trim();if(hasBlocker&&!blockerText)return showInlineError(byId("session-blocker-text"),isJprDemoWorkspace()?"「なし」を選ぶか、実在する問題を入力してください":"请选择“没有”，或描述真实存在的问题");const project=currentProject();const optional=[byId("todo-optional-1").value,byId("todo-optional-2").value];const cleaned=isJprDemoWorkspace()?{primary,optional:window.ProjectOSBootstrap.dedupeList(optional).filter(value=>value!==primary).slice(0,2),primaryChanged:false,removedCount:0}:window.ProjectOSPlanning.cleanTodoValues({goal,primary,optional,projectName:project.name});if(cleaned.primaryChanged){byId("todo-primary").value=cleaned.primary;return showInlineError(byId("todo-primary"),"主行动与目标重复或不可直接执行，已自动生成具体动作，请确认后再次开始")};byId("todo-optional-1").value=cleaned.optional[0]||"";byId("todo-optional-2").value=cleaned.optional[1]||"";const values=[["PRIMARY",cleaned.primary],...cleaned.optional.map(value=>["OPTIONAL",value])].slice(0,3);const timestamp=now();const sessionId=uid("session");const blockerIds=[];if(hasBlocker){const blocker=normalizeBlocker({text:blockerText,status:BLOCKER_STATUS.OPEN,priority:"HIGH",source:"session-plan",sourceSessionId:sessionId,createdAt:timestamp,updatedAt:timestamp},project.id,workspaceMode);project.blockers.push(blocker);blockerIds.push(blocker.id)}const isLegacyDemo=workspaceMode===WORKSPACE_MODES.DEMO;const session=normalizeSession({id:sessionId,workspaceId:workspaceMode,projectId:project.id,startedAt:timestamp,endedAt:null,goal,isDemo:isLegacyDemo,source:isDemoWorkspace()?"demo":"manual",blockerIds,todos:values.map(([kind,value])=>({id:uid("todo"),workspaceId:workspaceMode,kind,text:value.trim(),completed:false,createdAt:timestamp,updatedAt:timestamp})),notes:"",generatedPrompts:[],importedResults:[],completed:[],discoveries:[],remainingIssues:[],nextStep:"",parkingAdded:[],createdAt:timestamp,updatedAt:timestamp},project.id,workspaceMode);project.sessions.push(session);project.inProgress=values.map(([,value])=>value.trim());project.updatedAt=timestamp;currentZone().updatedAt=timestamp;closeDialog("session-dialog");ui.view="focus";render();showToast(isJprDemoWorkspace()?"今回の作業を開始しました。JPRデモだけに保存されます":cleaned.removedCount>0?"本次工作已开始，重复行动已自动移除":isLegacyDemo?"演示工作已开始，仅写入演示工作区":"本次工作已开始，只看当前项目")});
byId("stuck-form").addEventListener("submit",event=>{event.preventDefault();const problem=byId("stuck-problem").value.trim();if(!problem)return showInlineError(byId("stuck-problem"),isJprDemoWorkspace()?"困っていることを入力してください":"请先描述卡点");byId("stuck-output").value=assistancePrompt(currentZone(),currentProject(),activeSession(currentProject()),problem,byId("stuck-criteria").value.trim());byId("stuck-input-panel").hidden=true;byId("stuck-output-panel").hidden=false;persistStuckDraft()});byId("back-to-stuck").addEventListener("click",()=>{byId("stuck-input-panel").hidden=false;byId("stuck-output-panel").hidden=true;persistStuckDraft()});byId("copy-stuck").addEventListener("click",()=>copyText(byId("stuck-output").value,isJprDemoWorkspace()?"プロンプトをコピーしました":"求助提示词已复制"));byId("save-stuck").addEventListener("click",()=>{const session=activeSession(currentProject());const timestamp=now();session.generatedPrompts.push({id:uid("prompt"),workspaceId:workspaceMode,problem:byId("stuck-problem").value.trim(),acceptanceCriteria:byId("stuck-criteria").value.trim(),prompt:byId("stuck-output").value,source:isDemoWorkspace()||session.isDemo?"demo":"manual",createdAt:timestamp,updatedAt:timestamp});session.updatedAt=timestamp;clearSessionDraft("stuck",session);closeDialog("stuck-dialog");showToast(isJprDemoWorkspace()?"今回の作業に保存しました":workspaceMode===WORKSPACE_MODES.DEMO?"提示词已保存到演示工作区":"提示词已保存到本次工作")});
function copyCurrentReviewPrompt(){const summary=currentReviewMode==="work-summary";copyText(byId("status-review-output").value,isJprDemoWorkspace()?"プロンプトをコピーしました":summary?"工作总结提示词已复制":"现状总结提示词已复制")}
byId("copy-status-review").addEventListener("click",copyCurrentReviewPrompt);
byId("status-review-output").addEventListener("click",copyCurrentReviewPrompt);
byId("save-status-review").addEventListener("click",()=>{const session=activeSession(currentProject());if(!session)return showToast(isJprDemoWorkspace()?"進行中の作業はありません":"当前没有进行中的工作");const timestamp=now();const summary=currentReviewMode==="work-summary";session.generatedPrompts.push({id:uid("prompt"),workspaceId:workspaceMode,type:summary?"WORK_SUMMARY":"STATUS_REVIEW",prompt:byId("status-review-output").value,source:isDemoWorkspace()||session.isDemo?"demo":"manual",createdAt:timestamp,updatedAt:timestamp});session.updatedAt=timestamp;writeSessionDraftMirror(session);save();showToast(isJprDemoWorkspace()?"今回の作業に保存しました":workspaceMode===WORKSPACE_MODES.DEMO?"提示词已保存到演示工作区":summary?"工作总结提示词已保存到本次工作":"状态审查提示词已保存到本次工作")});
byId("fill-jpr-review-sample").addEventListener("click",()=>{if(!isJprDemoWorkspace())return;byId("status-review-result").value=JSON.stringify(currentReviewMode==="work-summary"?JPR_PROJECT_UPDATE_SAMPLE:JPR_STATUS_REVIEW_SAMPLE,null,2);clearInlineErrors(byId("status-review-form"));persistStatusReviewDraft();showToast("架空データのAI回答を入力しました")});
byId("parse-status-review").addEventListener("click",()=>{const raw=byId("status-review-result").value.trim();if(!raw)return showInlineError(byId("status-review-result"),isJprDemoWorkspace()?"AIが返したJSONを貼り付けてください":"请粘贴 AI 返回的 JSON");const parsed=currentReviewMode==="work-summary"?window.ProjectOSBootstrap.parseProjectUpdateJson(raw):window.ProjectOSBootstrap.parseStatusReviewJson(raw);if(!parsed.ok){const ja=isJprDemoWorkspace();const localized=ja&&parsed.code==="STATUS_REVIEW_SHAPE"?"これは現状整理用のJSONです。今回の作業まとめ画面で生成した完全なプロジェクト更新プロンプトを使ってください。":ja&&parsed.code==="PROJECT_NAME_MISSING"?"project_name がないため、対象プロジェクトを確認できません。":parsed.error;return showInlineError(byId("status-review-result"),localized)}const identity=window.ProjectOSAIWorkflow.validateStatusReviewIdentity(parsed.value,{projectName:currentProject()?.name,locale:isJprDemoWorkspace()?"ja":"zh-CN"});if(!identity.ok)return showInlineError(byId("status-review-result"),identity.error);clearInlineErrors(byId("status-review-form"));pendingStatusReview=identity.value;byId("status-review-preview").innerHTML=statusReviewPreviewForm(pendingStatusReview);byId("status-review-input-panel").hidden=true;byId("status-review-preview-panel").hidden=false;persistStatusReviewDraft();byId("status-review-dialog").scrollTop=0});
byId("back-to-status-review").addEventListener("click",()=>{byId("status-review-input-panel").hidden=false;byId("status-review-preview-panel").hidden=true;pendingStatusReview=null;persistStatusReviewDraft()});
byId("confirm-status-review").addEventListener("click",()=>{
  const zone=currentZone();const project=currentProject();const session=activeSession(project);if(!pendingStatusReview||!session)return showToast("没有可确认的现状总结");if(pendingStatusReview.identityProjectName!==project.name){pendingStatusReview=null;byId("status-review-input-panel").hidden=false;byId("status-review-preview-panel").hidden=true;return showInlineError(byId("status-review-result"),isJprDemoWorkspace()?"現在のプロジェクトと一致しないため、AI回答をもう一度確認してください。":"当前项目已变化，请重新解析 AI 回答后再确认。")}const timestamp=now();
  const draft=collectStatusReviewDraft();const selections=statusReviewSelections();
  const imported={...clone(draft),id:uid("result"),workspaceId:workspaceMode,reviewIntent:currentReviewMode==="work-summary"?"WORK_SUMMARY":"STATUS_REVIEW",source:isDemoWorkspace()||session.isDemo?"demo":"ai",appliedSelections:selections,appliedToFormal:workspaceMode===WORKSPACE_MODES.NORMAL&&!session.isDemo,importedAt:timestamp,createdAt:timestamp,updatedAt:timestamp};
  session.importedResults.push(imported);session.updatedAt=timestamp;
  clearSessionDraft(reviewDraftSection(),session);
  if(session.isDemo){finishStatusReviewUpdate("AI 总结只保存到演示记录，正式项目未改变");return}
  applyStatusReviewDraft(zone,project,session,draft,selections,timestamp);finishStatusReviewUpdate(isJprDemoWorkspace()?"選んだ項目だけをJPRデモに反映しました":"已按勾选项更新项目，未勾选字段保持不变");
});
byId("apply-result").addEventListener("click",()=>{if(pendingResult)pendingResult.applyProblems=byId("apply-active-problems").checked},true);
byId("result-form").addEventListener("submit",event=>{
  event.preventDefault();const raw=byId("ai-result").value.trim();if(!raw)return showInlineError(byId("ai-result"),"请粘贴 AI 返回结果");pendingResult=resultData(raw);byId("result-preview").innerHTML=previewRows(pendingResult);byId("result-input-panel").hidden=true;byId("result-preview-panel").hidden=false;
});
byId("back-to-result").addEventListener("click",()=>{byId("result-input-panel").hidden=false;byId("result-preview-panel").hidden=true});
byId("apply-result").addEventListener("click",()=>{
  const zone=currentZone();const project=currentProject();const session=activeSession(project);const timestamp=now();
  const selections={progress:byId("apply-progress-summary").checked,problems:byId("apply-active-problems").checked,next:byId("apply-recommended-next").checked,memory:byId("apply-memory-update").checked,backlog:byId("apply-optional-backlog").checked};
  const imported={...clone(pendingResult),id:uid("result"),workspaceId:workspaceMode,source:isDemoWorkspace()||session.isDemo?"demo":"ai",appliedSelections:selections,appliedToFormal:workspaceMode===WORKSPACE_MODES.NORMAL&&!session.isDemo,importedAt:timestamp,createdAt:timestamp,updatedAt:timestamp};
  session.importedResults.push(imported);session.discoveries.push(...pendingResult.discoveries.filter(item=>!session.discoveries.includes(item)));session.updatedAt=timestamp;
  if(session.isDemo){closeDialog("result-dialog");render();showToast("AI 返回结果仅保存到旧版演示记录，正式项目未改变");return}
  applyResultToFormalProject(zone,project,session,pendingResult,timestamp,{recordDiscoveries:false,selections});closeDialog("result-dialog");render();showToast(workspaceMode===WORKSPACE_MODES.DEMO?"已更新演示项目状态":"已确认进度总结、活动问题、下一步与项目记忆");
});
byId("end-form").addEventListener("submit",event=>{event.preventDefault();const zone=currentZone();const project=currentProject();const session=activeSession(project);if(session.isDemo)return;const timeValues=confirmedEndTimeValues();if(!timeValues)return;const timestamp=prepareSessionEnd(session,byId("end-discoveries").value,byId("end-next-step").value,timeValues);commitSessionEndToProject(zone,project,session,timestamp);finishEndedSession(isJprDemoWorkspace()?`今回の作業を保存し、集中時間 ${session.focusMinutes}分を記録しました`:`本次工作总结已保存，已录入 ${session.focusMinutes} 分钟专注时长`)});
byId("demo-end-keep").addEventListener("click",()=>{const session=activeSession(currentProject());const timeValues=confirmedEndTimeValues();if(!timeValues)return;prepareSessionEnd(session,byId("end-discoveries").value,byId("end-next-step").value,timeValues);finishEndedSession("演示记录已保存，正式项目未改变")});
byId("demo-end-promote").addEventListener("click",()=>{const zone=currentZone();const project=currentProject();const session=activeSession(project);const timeValues=confirmedEndTimeValues();if(!timeValues)return;const timestamp=prepareSessionEnd(session,byId("end-discoveries").value,byId("end-next-step").value,timeValues);session.promotedToFormal=true;session.importedResults.filter(result=>!result.appliedToFormal).forEach(result=>{applyResultToFormalProject(zone,project,session,result,timestamp,{recordDiscoveries:false,selections:result.appliedSelections||{progress:true,next:true,memory:true,backlog:false}});result.appliedToFormal=true;result.updatedAt=timestamp});commitSessionEndToProject(zone,project,session,timestamp);finishEndedSession("演示结果已写入正式项目")});
byId("demo-end-delete").addEventListener("click",()=>{const session=activeSession(currentProject());closeDialog("end-dialog");openDeleteHistoryDialog({sessionIds:[session.id]})});
document.addEventListener("input",event=>{
  if(event.target.id==="session-notes"){const project=currentProject();const session=activeSession(project);if(session){const timestamp=now();session.notes=event.target.value;session.updatedAt=timestamp;if(!session.isDemo)project.updatedAt=timestamp;writeSessionDraftMirror(session);save()}}
  if(event.target.id==="work-summary-evidence"){const project=currentProject();const session=activeSession(project);if(session&&currentReviewMode==="work-summary"){const timestamp=now();session.notes=event.target.value;session.updatedAt=timestamp;if(!session.isDemo)project.updatedAt=timestamp;writeSessionDraftMirror(session);save();byId("status-review-output").value=statusReviewPrompt(currentZone(),project,session,"work-summary");persistStatusReviewDraft()}}
  if(event.target.id==="parking-input")persistSessionDraft("parkingInput",event.target.value);
  if(event.target.id==="inspiration-input")persistSessionDraft("inspirationInput",event.target.value);
  if(event.target.id==="dashboard-inspiration-input")persistDashboardInspirationDraft(event.target.value);
  if(["stuck-problem","stuck-criteria"].includes(event.target.id))persistStuckDraft();
  if(event.target.id==="status-review-result"||event.target.closest("#status-review-preview"))persistStatusReviewDraft();
  if(["end-discoveries","end-next-step"].includes(event.target.id))persistEndDraft();
  if(["end-started-at","end-ended-at"].includes(event.target.id))updateEndTimePreview(true);
});
document.addEventListener("change",event=>{if(event.target.closest("#status-review-preview"))persistStatusReviewDraft();if(event.target.id==="end-time-confirmed"){byId("end-time-error").hidden=true;persistEndDraft()}});
window.addEventListener("pagehide",()=>{const session=activeSession(currentProject());if(!session)return;if(byId("session-notes"))session.notes=byId("session-notes").value;if(byId("stuck-dialog")?.open)persistStuckDraft();if(byId("status-review-dialog")?.open)persistStatusReviewDraft();if(byId("end-dialog")?.open)persistEndDraft();writeSessionDraftMirror(session)});

byId("skill-form").addEventListener("submit",event=>{
  event.preventDefault();
  const name=byId("skill-name").value.trim();
  if(!name)return showInlineError(byId("skill-name"),"请输入技能或工具名称");
  const timestamp=now();
  state.skills.push({
    id:uid(byId("skill-type").value==="external"?"tool":"skill"),workspaceId:workspaceMode,name,type:byId("skill-type").value,
    description:byId("skill-description").value.trim(),source:byId("skill-source").value.trim(),path:byId("skill-path").value.trim(),
    repository:byId("skill-repository").value.trim(),version:byId("skill-version").value.trim(),
    tags:byId("skill-tags").value.split(/[,，]/).map(item=>item.trim()).filter(Boolean),status:"active",createdAt:timestamp,updatedAt:timestamp
  });
  closeDialog("skill-dialog");renderSkillLibrary();save();showToast("已保存到技能库");
});
byId("project-skills-form").addEventListener("submit",event=>{
  event.preventDefault();
  const project=currentProject();
  project.skillIds=[...document.querySelectorAll('[name="project-skill"]:checked')].map(item=>item.value);
  const timestamp=now();project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;
  closeDialog("project-skills-dialog");render();showToast("常用技能已保存");
});

byId("delete-history-form").addEventListener("submit",async event=>{
  event.preventDefault();await executePendingDelete();
});
byId("continue-last-history-delete").addEventListener("click",()=>{if(!pendingDelete?.lastHistory)return;byId("last-history-initial-actions").hidden=true;byId("last-history-choice").hidden=false;byId("delete-history-message").innerHTML=`<strong>请选择是否保留空项目。</strong><p>未勾选时，最后一条历史和当前次级项目会一起永久删除。</p>`});
byId("confirm-last-history-delete").addEventListener("click",()=>{const keep=byId("keep-project-after-last-history").checked;executePendingDelete({keepEmptyProject:keep,removeProject:!keep})});

function openLinkDialog(){const zone=currentZone();const others=state.zones.filter(item=>item.id!==zone.id);if(!others.length)return showToast("还没有其他主任务可以关联");byId("link-target").innerHTML=others.map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");syncLinkForm();byId("link-dialog").showModal()}
function linkBetween(a,b){return state.zoneLinks.find(link=>(link.sourceZoneId===a&&link.targetZoneId===b)||(link.sourceZoneId===b&&link.targetZoneId===a))}
function syncLinkForm(){const zone=currentZone();const targetId=byId("link-target").value;const link=linkBetween(zone.id,targetId);document.querySelectorAll('[name="link-scope"]').forEach(box=>box.checked=Boolean(link?.scopes.includes(box.value)))}
byId("link-target").addEventListener("change",syncLinkForm);byId("link-form").addEventListener("submit",event=>{event.preventDefault();const zone=currentZone();const targetId=byId("link-target").value;const scopes=[...document.querySelectorAll('[name="link-scope"]:checked')].map(box=>box.value);const timestamp=now();let link=linkBetween(zone.id,targetId);if(link){link.scopes=scopes;link.updatedAt=timestamp}else state.zoneLinks.push({id:uid("link"),workspaceId:workspaceMode,sourceZoneId:zone.id,targetZoneId:targetId,scopes,createdAt:timestamp,updatedAt:timestamp});zone.updatedAt=timestamp;closeDialog("link-dialog");render();showToast("关联范围已保存")});byId("remove-link").addEventListener("click",()=>{const zone=currentZone();const targetId=byId("link-target").value;state.zoneLinks=state.zoneLinks.filter(link=>!((link.sourceZoneId===zone.id&&link.targetZoneId===targetId)||(link.sourceZoneId===targetId&&link.targetZoneId===zone.id)));zone.updatedAt=now();closeDialog("link-dialog");render();showToast("两个主任务已设为隔离")});

function downloadPayload(payload,filename){const blob=new Blob([storageAdapter.serializeState(payload)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
byId("export-button").addEventListener("click",()=>{byId("export-form").reset();byId("export-dialog").showModal()});
byId("export-form").addEventListener("submit",async event=>{event.preventDefault();try{await saveQueue;const includeDemo=byId("export-include-demo").checked;const normalWorkspace=workspaceMode===WORKSPACE_MODES.NORMAL?state:await storageAdapter.loadWorkspace(WORKSPACE_MODES.NORMAL);const demoWorkspace=includeDemo?(workspaceMode===WORKSPACE_MODES.DEMO?state:await storageAdapter.loadWorkspace(WORKSPACE_MODES.DEMO)):null;const payload=storageAdapter.exportState(normalWorkspace||emptyState(WORKSPACE_MODES.NORMAL),{includeDemo,demoWorkspace});downloadPayload(payload,`项目存档驾驶舱-${new Date().toISOString().slice(0,10)}.json`);closeDialog("export-dialog");showToast(includeDemo?"已导出正式与演示工作区备份":"已导出正式工作区备份")}catch(error){console.error(error);showToast("导出失败，请重试")}});
byId("export-demo-button").addEventListener("click",async()=>{if(!isDemoWorkspace())return;try{await saveQueue;const isJpr=isJprDemoWorkspace();downloadPayload(storageAdapter.exportDemoState(state,workspaceMode),`${isJpr?"Project-OS-JPR-Demo":"项目存档驾驶舱-演示状态"}-${new Date().toISOString().slice(0,10)}.json`);showToast(isJpr?"JPRデモ状態を出力しました":"已导出演示状态")}catch(error){console.error(error);showToast(isJprDemoWorkspace()?"デモ状態を出力できませんでした":"导出演示状态失败")}});
byId("import-button").addEventListener("click",()=>byId("backup-file").click());
byId("backup-file").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;try{const bundle=storageAdapter.hydrateBundle(await file.text());pendingImportTargetMode=[WORKSPACE_MODES.DEMO,WORKSPACE_MODES.JPR_DEMO].includes(bundle.workspaceMode)?bundle.workspaceMode:WORKSPACE_MODES.NORMAL;if(pendingImportTargetMode!==WORKSPACE_MODES.NORMAL){pendingImportState=null;pendingImportDemoState=migrateAny(bundle.workspace,pendingImportTargetMode);byId("backup-preview-content").innerHTML=`<div class="preview-row"><strong>导入目标</strong><p>${pendingImportTargetMode===WORKSPACE_MODES.JPR_DEMO?"仅替换 JPR 专用演示工作区":"仅替换独立演示工作区"}</p></div>`+importPreviewRows(pendingImportDemoState)}else{pendingImportState=migrateAny(bundle.workspace,WORKSPACE_MODES.NORMAL);pendingImportDemoState=bundle.demoWorkspace?migrateAny(bundle.demoWorkspace,WORKSPACE_MODES.DEMO):null;byId("backup-preview-content").innerHTML=importPreviewRows(pendingImportState)+(pendingImportDemoState?'<div class="preview-row"><strong>演示工作区</strong><p>备份中包含，将同步恢复</p></div>':'')}byId("backup-preview-dialog").showModal()}catch(error){console.error(error);pendingImportState=null;pendingImportDemoState=null;pendingImportTargetMode=WORKSPACE_MODES.NORMAL;showToast("导入失败：无法识别备份格式")}finally{event.target.value=""}});
byId("backup-preview-form").addEventListener("submit",async event=>{event.preventDefault();if(pendingImportTargetMode!==WORKSPACE_MODES.NORMAL){if(!pendingImportDemoState)return closeDialog("backup-preview-dialog");const target=pendingImportTargetMode;const demo=normalizeCurrent(pendingImportDemoState,target);await storageAdapter.saveWorkspace(clone(demo),target);if(workspaceMode===target){state=demo;resetUi()}}else{if(!pendingImportState)return closeDialog("backup-preview-dialog");const normal=normalizeCurrent(pendingImportState,WORKSPACE_MODES.NORMAL);await storageAdapter.saveWorkspace(clone(normal),WORKSPACE_MODES.NORMAL);if(pendingImportDemoState)await storageAdapter.saveWorkspace(clone(normalizeCurrent(pendingImportDemoState,WORKSPACE_MODES.DEMO)),WORKSPACE_MODES.DEMO);if(workspaceMode===WORKSPACE_MODES.NORMAL){state=normal;resetUi()}}pendingImportState=null;pendingImportDemoState=null;pendingImportTargetMode=WORKSPACE_MODES.NORMAL;closeDialog("backup-preview-dialog");render();showToast("已成功导入备份并刷新当前状态")});

window.ProjectOSInspirationAI=Object.freeze({
  states:[...INSPIRATION_AI_STATES],
  setState(id,aiState,{summary}={}){
    if(!INSPIRATION_AI_STATES.includes(aiState))throw new Error(`Unsupported inspiration AI state: ${aiState}`);
    const item=state.inspirations.find(entry=>entry.id===id);if(!item)return null;
    const timestamp=now();item.aiState=aiState;if(summary!==undefined)item.aiSummary=String(summary||"");item.aiUpdatedAt=timestamp;item.updatedAt=timestamp;render();return clone(item);
  }
});

initialize();
