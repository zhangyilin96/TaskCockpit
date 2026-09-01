const STORAGE_KEY = "project-archive-cockpit-v2-1";
const V2_KEY = "task-zone-cockpit-v2";
const V1_KEY = "kiseki-task-zone-cockpit-v1";
const WORKSPACE_MODE_KEY = "project-os-workspace-mode";
const WORKSPACE_MODES = window.ProjectOSStorage.WORKSPACE_MODES;
const TASK_STATUS = window.ProjectOSLifecycle.TASK_STATUS;
const AUTO_SYNC = window.ProjectOSAutoSync;
const INSPIRATION_DRAFT_KEY = "project-os:inspiration-draft:";
const MAX_ZONES = 7;
const COLORS = ["#e96b46", "#4f7866", "#607d8b", "#b88740", "#806f9d", "#9b625d", "#4e7f8f"];
const BLOCKER_STATUS = Object.freeze({ OPEN:"OPEN", RESOLVED:"RESOLVED", DEFERRED:"DEFERRED" });

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
const asList = value => Array.isArray(value) ? value.map(item => typeof item === "string" ? item : item.name || item.text || JSON.stringify(item)).filter(Boolean) : value ? String(value).split(/\r?\n|；|;|•/).map(item => item.replace(/^[-*\d.、\s]+/, "").trim()).filter(Boolean) : [];
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

const storageAdapter = window.ProjectOSStorage.createStorageAdapter();
const sessionDraftStore = new window.ProjectOSStorage.SessionDraftStore(localStorage);
const syncProvider = new window.ProjectOSStorage.SyncProviderStub();
const skillDiscoveryProvider = new window.ProjectOSStorage.SkillDiscoveryProviderStub();
let workspaceMode = WORKSPACE_MODES.NORMAL;
let state = emptyState(WORKSPACE_MODES.NORMAL);
let ui = { view:"dashboard", zoneId:null, projectId:null, detailTab:"memory", addKind:"zone", showOtherZones:false, showAllProjects:false, showArchivedZones:false, showArchivedProjects:false, dashboardStat:null, inspirationOpen:false, inspirationSelectedId:null, skillFilter:"all", historyManage:false, selectedHistoryIds:[] };
let pendingBootstrap = null;
let pendingResult = null;
let pendingStatusReview = null;
let currentReviewMode = "status-review";
let pendingImportState = null;
let pendingImportDemoState = null;
let pendingImportTargetMode = WORKSPACE_MODES.NORMAL;
let pendingDelete = null;
let pendingTaskAction = null;
let autoSyncUi = { status:"idle", runId:null, message:"", error:"" };
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

function emptyState(workspaceId = workspaceMode) { return { schemaVersion:3, version:"3.0", workspaceId, zones:[], zoneLinks:[], contextEvents:[], inspirations:[], activityEvents:[], activityEvidence:[], syncRuns:[], goalSuggestions:[], routingRules:[], projectRelationshipRules:[], skills:defaultSkills(workspaceId), settings:{ storageMode:"indexeddb", syncMode:"local-only", workspaceMode:workspaceId, autoSync:{ enabled:true,lastSyncAt:null,collectorCheckpoints:{},fileIndexes:{},firstSyncLookbackHours:24 } }, createdAt:now(), updatedAt:now() }; }

function createProject(input = {}, zoneId = "", workspaceId = workspaceMode) {
  const timestamp = now();
  const id = input.id || uid("project");
  return {
    id, zoneId, workspaceId:input.workspaceId||workspaceId, status:window.ProjectOSLifecycle.normalizeTaskStatus(input.status,input.paused), keepWhenEmpty:Boolean(input.keepWhenEmpty), name:input.name || "未命名项目", purpose:input.purpose || "", goal:input.goal || "",
    currentState:input.currentState || "刚刚建立，尚未开始第一轮工作。", currentPhase:window.ProjectOSBootstrap.normalizePhase(input.currentPhase), currentProgressSummary:input.currentProgressSummary||input.latestProgressSummary||"", completed:asList(input.completed), importedMilestones:window.ProjectOSBootstrap.makeImportedMilestones(input.importedMilestones||[],input.snapshotMeta?.importedAt||timestamp,input.importedMilestones||[]), inProgress:asList(input.inProgress),
    nextActions:asList(input.nextActions), decisions:asList(input.decisions), constraints:asList(input.constraints), openIssues:asList(input.openIssues), resolvedIssues:asList(input.resolvedIssues),
    blockers:(Array.isArray(input.blockers||input.currentBlockers)?(input.blockers||input.currentBlockers):asList(input.blockers||input.currentBlockers)).map(item=>normalizeBlocker(item,id,workspaceId)).filter(item=>item.text), blockerReviewPending:Boolean(input.blockerReviewPending), snapshotMeta:input.snapshotMeta?{...input.snapshotMeta}:null, assets:asList(input.assets), backlog:asList(input.backlog), parkingLot:asList(input.parkingLot), projectMemory:asMemoryList(input.projectMemory || input.memory,workspaceId), skillIds:asList(input.skillIds), sourcePaths:asList(input.sourcePaths), sourceBindings:Array.isArray(input.sourceBindings)?input.sourceBindings.map(item=>({...item})):[], routingKeywords:asList(input.routingKeywords), timeline:Array.isArray(input.timeline)?input.timeline:[],
    sessions:Array.isArray(input.sessions) ? input.sessions.filter(session=>!session.deletedAt).map(session => normalizeSession(session,id,workspaceId)) : [],
    createdAt:input.createdAt || timestamp, updatedAt:input.updatedAt || timestamp, nonSessionUpdatedAt:input.nonSessionUpdatedAt || (input.sessions?.length ? input.createdAt || timestamp : input.updatedAt || timestamp), lastWorkedAt:input.lastWorkedAt || null, color:input.color || COLORS[0]
  };
}

function normalizeSession(session = {}, projectId = "", workspaceId = workspaceMode) { const timestamp=now(); const isDemo=Boolean(session.isDemo); return { ...session, id:session.id||uid("session"), projectId, workspaceId:session.workspaceId||workspaceId, status:session.status==="ENDED"||session.endedAt?"ENDED":"RUNNING", isDemo, promotedToFormal:Boolean(session.promotedToFormal), source:session.source||(isDemo?"demo":"manual"), blockerIds:asList(session.blockerIds), todos:Array.isArray(session.todos)?session.todos.map(todo=>({ ...todo,id:todo.id||uid("todo"),workspaceId:todo.workspaceId||workspaceId })):[], generatedPrompts:Array.isArray(session.generatedPrompts)?session.generatedPrompts:[], importedResults:Array.isArray(session.importedResults)?session.importedResults:[], completed:asList(session.completed), discoveries:asList(session.discoveries), remainingIssues:asList(session.remainingIssues), parkingAdded:asList(session.parkingAdded), formalContributions:{ completed:asList(session.formalContributions?.completed), nextActions:asList(session.formalContributions?.nextActions), openIssues:asList(session.formalContributions?.openIssues), currentStateBefore:session.formalContributions?.currentStateBefore||"", currentStateAfter:session.formalContributions?.currentStateAfter||"", progressSummaryBefore:session.formalContributions?.progressSummaryBefore||"", progressSummaryAfter:session.formalContributions?.progressSummaryAfter||"" }, createdAt:session.createdAt||session.startedAt||timestamp, updatedAt:session.updatedAt||session.endedAt||timestamp }; }

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
  normalized.zoneLinks = Array.isArray(raw.zoneLinks) ? raw.zoneLinks.map(link=>({ ...link,id:link.id||uid("link"),workspaceId,mode:"REFERENCE_ONLY",reason:String(link.reason||"旧版关联，需重新确认共享原因"),confirmedByUser:Boolean(link.confirmedByUser),createdAt:link.createdAt||now(),updatedAt:link.updatedAt||link.createdAt||now() })) : [];
  normalized.contextEvents = Array.isArray(raw.contextEvents) ? raw.contextEvents.map(event=>({ ...event,id:event.id||uid("event"),workspaceId })) : [];
  normalized.inspirations = Array.isArray(raw.inspirations) ? raw.inspirations.map(item=>normalizeInspiration(item,workspaceId)).filter(item=>item.text) : [];
  normalized.activityEvents = Array.isArray(raw.activityEvents) ? raw.activityEvents.map(event=>({ ...event,workspaceId })) : [];
  normalized.activityEvidence = Array.isArray(raw.activityEvidence) ? raw.activityEvidence.map(item=>({ ...item,workspaceId })) : [];
  normalized.syncRuns = Array.isArray(raw.syncRuns) ? raw.syncRuns.map(run=>({ ...run,workspaceId })) : [];
  normalized.goalSuggestions = Array.isArray(raw.goalSuggestions) ? raw.goalSuggestions.map(item=>({ ...item,workspaceId })) : [];
  normalized.routingRules = Array.isArray(raw.routingRules) ? raw.routingRules.map(rule=>({ ...rule,workspaceId })) : [];
  normalized.projectRelationshipRules = Array.isArray(raw.projectRelationshipRules) ? raw.projectRelationshipRules.map(rule=>({ ...rule,workspaceId })) : [];
  normalized.skills = Array.isArray(raw.skills) && raw.skills.length ? raw.skills.map(skill=>({ ...skill,id:skill.id||uid("skill"),workspaceId,tags:asList(skill.tags),status:skill.status||"active",createdAt:skill.createdAt||now(),updatedAt:skill.updatedAt||skill.createdAt||now() })) : defaultSkills(workspaceId);
  normalized.settings = { ...normalized.settings,...(raw.settings||{}) };
  normalized.zones.forEach(zone => zone.projects.forEach(project => {
    project.zoneId = zone.id;
    project.sessions.forEach(session => { session.projectId = project.id; });
    const running=[...project.sessions].reverse().find(session=>!session.endedAt);
    if(running)repairBlockerOverwrittenPrimary(project,running);
  }));
  return AUTO_SYNC.ensureState(normalized,{createBaselines:true});
}

function repairBlockerOverwrittenPrimary(project,session) {
  if(!project||!session||session.blockerPrimaryRepairVersion===1)return false;
  const planning=window.ProjectOSPlanning;
  const primary=(session.todos||[]).find(todo=>todo.kind==="PRIMARY");
  if(!primary||!planning.isBlockerAction(primary.text))return false;
  const safeProject={
    ...project,
    nextActions:(project.nextActions||[]).filter(value=>!planning.isBlockerAction(value)),
    inProgress:(project.inProgress||[]).filter(value=>!planning.isBlockerAction(value))
  };
  const replacement=planning.buildSessionPlan(safeProject).primary;
  if(!replacement||planning.isBlockerAction(replacement))return false;
  const timestamp=now();
  const existingOptional=(session.todos||[]).filter(todo=>todo!==primary&&!planning.isBlockerAction(todo.text)).slice(0,2);
  const repairedPrimary={...primary,kind:"PRIMARY",text:replacement,completed:false,updatedAt:timestamp};
  const repairedTodos=[repairedPrimary,...existingOptional];
  if(existingOptional.length<2)repairedTodos.push({...primary,id:uid("todo"),kind:"OPTIONAL",updatedAt:timestamp});
  session.todos=repairedTodos;
  session.blockerPrimaryRepairVersion=1;
  session.blockerPrimaryRepairedAt=timestamp;
  session.updatedAt=timestamp;
  project.inProgress=session.todos.filter(todo=>!todo.completed).map(todo=>todo.text);
  project.updatedAt=timestamp;
  return true;
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
  return target;
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

function save({touch=true}={}) {
  if(touch)state.updatedAt = now();
  state.workspaceId=workspaceMode;state.settings={...(state.settings||{}),workspaceMode};
  localStorage.setItem("project-os-ui",JSON.stringify({ view:ui.view,zoneId:ui.zoneId,projectId:ui.projectId,skillFilter:ui.skillFilter }));
  localStorage.setItem(WORKSPACE_MODE_KEY,workspaceMode);
  const snapshot=clone(state);
  const targetWorkspace=workspaceMode;
  saveQueue=saveQueue.then(()=>storageAdapter.saveWorkspace(snapshot,targetWorkspace)).catch(error=>{ console.error("本地保存失败",error); showToast("本地保存失败，请立即导出备份"); });
  return saveQueue;
}

function writeSessionDraftMirror(session){if(!session||session.endedAt)return;return sessionDraftStore.save({workspaceId:workspaceMode,projectId:session.projectId,sessionId:session.id,notes:session.notes||"",drafts:session.drafts||{},parkingAdded:session.parkingAdded||[],updatedAt:session.updatedAt||now()})}
function restoreSessionDraftMirror(session){if(!session||session.endedAt||session.recoveryHydrated)return session;const draft=sessionDraftStore.load(workspaceMode,session.id);if(draft&&timestampOf(draft.updatedAt)>=timestampOf(session.updatedAt)){session.notes=draft.notes||session.notes||"";session.drafts={...(session.drafts||{}),...(draft.drafts||{})};session.parkingAdded=window.ProjectOSBootstrap.dedupeList([...(session.parkingAdded||[]),...(draft.parkingAdded||[])])}session.recoveryHydrated=true;return session}
function clearSessionRecovery(session){if(session)sessionDraftStore.clear(workspaceMode,session.id)}

function resetUi() { ui={view:"dashboard",zoneId:null,projectId:null,detailTab:"memory",addKind:"zone",showOtherZones:false,showAllProjects:false,showArchivedZones:false,showArchivedProjects:false,dashboardStat:null,inspirationOpen:false,inspirationSelectedId:null,skillFilter:ui.skillFilter||"all",historyManage:false,selectedHistoryIds:[]}; }

function dashboardInspirationDraft(){return localStorage.getItem(`${INSPIRATION_DRAFT_KEY}${workspaceMode}`)||""}
function persistDashboardInspirationDraft(value){const key=`${INSPIRATION_DRAFT_KEY}${workspaceMode}`;if(value)localStorage.setItem(key,value);else localStorage.removeItem(key)}

function updateWorkspaceChrome() {
  const isDemo=workspaceMode===WORKSPACE_MODES.DEMO;
  document.body.dataset.workspaceMode=isDemo?"demo":"normal";
  byId("demo-environment-badge").hidden=!isDemo;
  byId("demo-mode-button").textContent=isDemo?"退出演示模式":"演示模式";
  byId("demo-mode-button").classList.toggle("is-exit",isDemo);
  byId("reset-demo-button").hidden=!isDemo;
  byId("export-demo-button").hidden=!isDemo;
  byId("auto-sync-button").hidden=isDemo;
  document.title=isDemo?"演示环境 · 项目存档驾驶舱":"项目存档驾驶舱";
}

async function switchWorkspace(targetMode) {
  if(targetMode===workspaceMode)return;
  const previousSkills=clone(state.skills||[]);
  await save();
  workspaceMode=targetMode;
  let stored=await storageAdapter.loadWorkspace(targetMode);
  if(!stored&&targetMode===WORKSPACE_MODES.DEMO){stored=demoInitialState(previousSkills);await storageAdapter.saveWorkspace(clone(stored),targetMode)}
  state=stored?normalizeCurrent(stored,targetMode):emptyState(targetMode);
  resetUi();updateWorkspaceChrome();await save();render();
  if(targetMode===WORKSPACE_MODES.NORMAL)setTimeout(()=>runAutoSync({silent:true}),80);
}

async function initialize() {
  try {
    const normalStored=await storageAdapter.loadWorkspace(WORKSPACE_MODES.NORMAL);
    const normalState=AUTO_SYNC.ensureState(normalStored ? migrateAny(normalStored,WORKSPACE_MODES.NORMAL) : loadLegacyState(),{createBaselines:true});
    try { const preferences=JSON.parse(localStorage.getItem("project-os-ui")||"{}"); if(["all","installed","self","external"].includes(preferences.skillFilter))ui.skillFilter=preferences.skillFilter; } catch {}
    await storageAdapter.saveWorkspace(clone(normalState),WORKSPACE_MODES.NORMAL);
    workspaceMode=WORKSPACE_MODES.NORMAL;
    localStorage.setItem(WORKSPACE_MODE_KEY,WORKSPACE_MODES.NORMAL);
    state=normalState;
  } catch(error) {
    console.error("本地数据库初始化失败",error);
    workspaceMode=WORKSPACE_MODES.NORMAL;
    state=loadLegacyState();
  }
  updateWorkspaceChrome();
  render();
  if(workspaceMode===WORKSPACE_MODES.NORMAL)setTimeout(()=>runAutoSync({silent:true}),80);
}
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
function currentZone() { return state.zones.find(zone => zone.id === ui.zoneId); }
function currentProject() { return currentZone()?.projects.find(project => project.id === ui.projectId); }
function activeSession(project) { return [...(project?.sessions || [])].reverse().find(session => !session.endedAt); }
function countsAsFormal(session) { return !session.isDemo || session.promotedToFormal; }
function formalSessions(project) { return (project?.sessions || []).filter(countsAsFormal); }
function lastEndedSession(project) { return [...formalSessions(project)].reverse().find(session => session.endedAt); }
function formatDate(value) { if (!value) return "尚未开始"; return new Intl.DateTimeFormat("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value)); }
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
  (state.activityEvents||[]).filter(event=>event.status===AUTO_SYNC.EVENT_STATUS.CONFIRMED&&event.metadata?.effect?.type!=="snapshot").forEach(event=>{const found=findTask("project",event.projectId);if(found)activities.push({at:event.timestamp||event.confirmedAt,zone:found.zone,project:found.project,text:event.normalizedSummary})});
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
function confirmedFocusSessions(sessions,weekStart){return sessions.filter(session=>session.endedAt&&session.timeEntryMode==="MANUAL_CONFIRMED"&&Number.isFinite(Number(session.focusMinutes))&&timestampOf(session.endedAt)>=weekStart)}
function confirmedFocusMinutes(sessions,weekStart){return confirmedFocusSessions(sessions,weekStart).reduce((total,session)=>total+Math.max(0,Number(session.focusMinutes)||0),0)}
function workspaceStats() {
  const projects=state.zones.flatMap(zone=>zone.projects);
  const sessions=projects.flatMap(project=>formalSessions(project));
  const todayKey=new Date().toDateString();
  const todaySessions=sessions.filter(session=>new Date(session.startedAt||session.createdAt).toDateString()===todayKey);
  const completedSessions=sessions.filter(session=>session.endedAt);
  const currentDate=new Date();const mondayOffset=(currentDate.getDay()+6)%7;const weekStart=new Date(currentDate.getFullYear(),currentDate.getMonth(),currentDate.getDate()-mondayOffset).getTime();
  const focusSessions=confirmedFocusSessions(sessions,weekStart);
  const focusMinutes=confirmedFocusMinutes(sessions,weekStart);
  const activeProjects=state.zones.filter(isActiveTask).flatMap(zone=>zone.projects.filter(isActiveTask)).length;
  return{projects,sessions,today:todaySessions.length,completed:completedSessions.length,activeProjects,focus:focusMinutes?`${(focusMinutes/60).toFixed(1)} h`:"—",todaySessions,completedSessions,focusSessions,focusMs:focusMinutes*60000,focusMinutes,weekStart};
}

function dashboardSessionEntries() {
  return state.zones.flatMap(zone=>zone.projects.flatMap(project=>formalSessions(project).map(session=>({zone,project,session}))));
}

function renderDashboardStatDetail(stats) {
  const mode=ui.dashboardStat;if(!mode)return"";
  const sessionEntries=dashboardSessionEntries();
  const renderEmpty=message=>`<p class="stat-detail-empty">${escapeHtml(message)}</p>`;
  const renderProjectRow=({zone,project})=>`<article class="stat-detail-row"><div><span>${escapeHtml(zone.name)}</span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.currentState||"尚未记录状态")}</small></div><button class="soft-button" data-action="open-project" data-zone-id="${zone.id}" data-project-id="${project.id}">进入项目</button></article>`;
  const renderSessionRow=({zone,project,session},showDuration=false)=>{const number=Math.max(1,project.sessions.indexOf(session)+1);const durationMinutes=Math.round(Math.max(0,timestampOf(session.endedAt)-timestampOf(session.startedAt))/60000);return`<article class="stat-detail-row"><div><span>${escapeHtml(zone.name)} / ${escapeHtml(project.name)}</span><strong>No.${number} · ${escapeHtml(session.title||session.goal||"本次工作记录")}</strong><small>${session.endedAt?`已结束 · ${formatDate(session.endedAt)}`:`进行中 · ${formatDate(session.startedAt)}`}${showDuration?` · ${durationMinutes} 分钟`:""}</small></div><button class="soft-button" data-action="open-project" data-zone-id="${zone.id}" data-project-id="${project.id}">查看项目</button></article>`};
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
    title="本周专注明细";const entries=sessionEntries.filter(({session})=>stats.focusSessions.includes(session)).sort((a,b)=>timestampOf(b.session.endedAt)-timestampOf(a.session.endedAt));note=`已人工确认 ${stats.focusMinutes} 分钟 · ${stats.focus}`;content=entries.length?entries.map(entry=>renderSessionRow(entry,true)).join(""):renderEmpty("本周还没有人工确认的专注记录。");
  }
  return`<section class="stat-detail-panel" id="dashboard-stat-detail" tabindex="-1"><div class="stat-detail-head"><div><p class="section-kicker">统计筛选</p><h2>${title}</h2><span>${escapeHtml(note)}</span></div><button class="text-button" data-action="close-dashboard-stat">收起</button></div><div class="stat-detail-list">${content}</div></section>`;
}

const SOURCE_LABELS={git:"Git",filesystem:"本地文件",codex:"Codex",project_os:"Activity Log",configuration:"目录配置"};
function pendingSyncEvents(){return(state.activityEvents||[]).filter(event=>event.status===AUTO_SYNC.EVENT_STATUS.SUGGESTED)}
function pendingGoalSuggestions(){return(state.goalSuggestions||[]).filter(item=>item.status===AUTO_SYNC.GOAL_SUGGESTION_STATUS.PENDING)}
function pendingGoalSuggestionForProject(projectId){return pendingGoalSuggestions().find(item=>item.projectId===projectId)||null}
function pendingReviewCount(){return pendingSyncEvents().length+pendingGoalSuggestions().length}
function latestSyncRun(){return[...(state.syncRuns||[])].sort((a,b)=>timestampOf(b.syncStartedAt)-timestampOf(a.syncStartedAt))[0]||null}
function projectNameById(projectId){return findTask("project",projectId)?.project?.name||"未确认项目"}
function formatFullDate(value){if(!value)return"尚未同步";return new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(value))}
function sourceStatusIcon(status){return status==="success"?"✓":status==="unavailable"?"—":"!"}
function renderSyncBanner(){
  if(workspaceMode===WORKSPACE_MODES.DEMO)return"";
  const pending=pendingSyncEvents();const goalSuggestions=pendingGoalSuggestions();const reviewCount=pending.length+goalSuggestions.length;const run=latestSyncRun();const lastSync=state.settings?.autoSync?.lastSyncAt;
  if(autoSyncUi.status==="syncing")return`<section class="auto-sync-banner is-syncing"><div><span class="sync-pulse"></span><div><p class="section-kicker">Auto Sync</p><strong>正在同步最近工作…</strong><small>${escapeHtml(autoSyncUi.message||"Git、本地文件与 Activity Log 正在独立采集")}</small></div></div><button class="text-button" data-action="view-sync-run">查看状态</button></section>`;
  if(reviewCount){const grouped=new Map();pending.forEach(event=>grouped.set(projectNameById(event.projectId),(grouped.get(projectNameById(event.projectId))||0)+1));const uncertain=pending.filter(event=>!event.projectId||event.confidence<AUTO_SYNC.ROUTE_THRESHOLDS.review).length;const detail=[...grouped].map(([name,count])=>`${name} +${count}`);if(goalSuggestions.length)detail.push(`${goalSuggestions.length} 项目标建议`);return`<section class="auto-sync-banner has-updates"><div><span class="sync-count">${reviewCount}</span><div><p class="section-kicker">上次同步以来有新的工作</p><strong>${pending.length?`发现 ${pending.length} 项新活动`:"发现项目目标可能发生偏移"}</strong><small>${detail.join(" · ")}${uncertain?` · ${uncertain} 项需要确认`:pending.length?" · 活动已高置信度归类":" · 必须由你确认"}</small></div></div><div class="sync-banner-actions"><button class="text-button" data-action="view-sync-run">同步详情</button><button class="primary-button" data-action="review-sync">查看更新</button></div></section>`}
  const hasSources=state.zones.some(zone=>zone.projects.some(project=>(project.sourcePaths||[]).length));
  return`<section class="auto-sync-banner is-idle"><div><span class="sync-idle-icon">↻</span><div><p class="section-kicker">Auto Sync</p><strong>${hasSources?"最近工作已同步":"为项目注册工作目录后自动发现进展"}</strong><small>${lastSync?`最后同步：${formatFullDate(lastSync)}`:"首次同步默认只回看最近 24 小时"}${run?.errorCount?` · ${run.errorCount} 个数据源暂时不可用`:""}</small></div></div><div class="sync-banner-actions">${!hasSources?'<button class="text-button" data-action="open-first-source-settings">配置目录</button>':""}<button class="soft-button" data-action="run-auto-sync">立即同步</button><button class="text-button" data-action="view-sync-run">详情</button></div></section>`;
}

async function autoSyncRequestInit(payload){
  const json=JSON.stringify(payload);const headers={"Content-Type":"application/json"};
  const byteLength=new TextEncoder().encode(json).byteLength;
  if(byteLength<256*1024||typeof CompressionStream!=="function")return{method:"POST",headers,body:json};
  const compressedStream=new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const body=await new Response(compressedStream).arrayBuffer();
  return{method:"POST",headers:{...headers,"Content-Encoding":"gzip"},body};
}

async function runAutoSync({silent=false}={}){
  if(workspaceMode!==WORKSPACE_MODES.NORMAL||autoSyncUi.status==="syncing")return;
  AUTO_SYNC.ensureState(state,{createBaselines:true});
  const request=AUTO_SYNC.collectorRequest(state,{until:now()});
  const run=AUTO_SYNC.createSyncRun(state,{since:request.since,until:request.until});
  autoSyncUi={status:"syncing",runId:run.id,message:`${formatFullDate(request.since)} 至现在`,error:""};
  if(ui.view==="dashboard")render();else save();
  try{
    const response=await fetch("/api/auto-sync/collect",await autoSyncRequestInit(request));
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||"本地采集服务暂时不可用");
    const sourceChanges=AUTO_SYNC.applyCollectorSourceReports(state,payload.sourceReports||[],now());
    sourceChanges.forEach(change=>{const found=findTask("project",change.projectId);if(!found)return;AUTO_SYNC.recordProjectChange(state,change.projectId,{eventType:"source_path_recovered",sourceType:"project_os",sourceId:`source_path_recovered:${change.bindingId}:${change.to}`,changedAt:now(),summary:`工作目录已恢复：${change.to}`,reason:change.reason,patch:{sourcePaths:found.project.sourcePaths,sourceBindings:found.project.sourceBindings}})});
    const normalized=AUTO_SYNC.normalizeCollectedActivities(payload.candidates||[],state,{detectedAt:now()});
    const knownEvidence=new Set((state.activityEvidence||[]).map(item=>item.id));
    state.activityEvents.push(...normalized.events);
    state.activityEvidence.push(...normalized.evidence.filter(item=>!knownEvidence.has(item.id)));
    const goalSuggestions=AUTO_SYNC.detectGoalDriftSuggestions(state,{createdAt:now()});
    AUTO_SYNC.finishSyncRun(state,run.id,{
      ...payload,
      deduplicatedCount:Number(payload.sourceDuplicateCount||0)+normalized.deduplicatedCount,
      pendingCount:normalized.events.length+goalSuggestions.length,
      fileIndexes:payload.fileIndexes
    },{finishedAt:now()});
    autoSyncUi={status:(normalized.events.length||goalSuggestions.length)?"pending":"done",runId:run.id,message:"",error:""};
    await save();render();
    if(!silent&&(normalized.events.length||goalSuggestions.length))openAutoSyncReview();
    else if(!silent)showToast(normalized.events.length?`发现 ${normalized.events.length} 项新活动`:"没有发现新的工作活动");
  }catch(error){
    const failed=state.syncRuns.find(item=>item.id===run.id);if(failed){failed.status="failed";failed.syncFinishedAt=now();failed.errorCount=1;failed.error=error.message}
    autoSyncUi={status:"failed",runId:run.id,message:"",error:error.message};await save();if(ui.view==="dashboard")render();if(!silent)showToast("同步暂时不可用，驾驶舱仍可正常使用");
  }
}

function evidenceForEvent(event){const ids=new Set(event.evidence||[]);return(state.activityEvidence||[]).filter(item=>ids.has(item.id))}
function projectOptions(selectedId){return state.zones.flatMap(zone=>zone.projects.map(project=>`<option value="${project.id}" ${project.id===selectedId?"selected":""}>${escapeHtml(zone.name)} / ${escapeHtml(project.name)}</option>`)).join("")}
function goalEvidenceEvents(suggestion){const ids=new Set(suggestion.evidenceEventIds||[]);return(state.activityEvents||[]).filter(event=>ids.has(event.id))}
function renderGoalSuggestions(){
  const suggestions=pendingGoalSuggestions();
  byId("auto-sync-goal-suggestions").innerHTML=suggestions.map(suggestion=>{const evidenceEvents=goalEvidenceEvents(suggestion);return`<article class="goal-suggestion-card" data-goal-suggestion-id="${suggestion.id}"><div class="goal-suggestion-head"><div><span>Goal Drift Detection</span><strong>${escapeHtml(projectNameById(suggestion.projectId))}</strong></div><em>${Math.round((suggestion.confidence||0)*100)}% · 必须确认</em></div><dl><dt>当前目标</dt><dd>${escapeHtml(suggestion.oldGoal||"尚未定义")}</dd><dt>近期工作趋势</dt><dd>${escapeHtml(suggestion.recentTrendSummary||"多项工作持续指向新的方向")}</dd></dl><label><span>建议目标</span><textarea rows="2" data-goal-suggestion-edit>${escapeHtml(suggestion.suggestedGoal)}</textarea></label><p class="goal-suggestion-reason"><strong>原因：</strong>${escapeHtml(suggestion.reason)}</p><details class="evidence-chain"><summary>查看目标建议 Evidence · ${evidenceEvents.length} 项</summary>${evidenceEvents.map(event=>`<div><span>${escapeHtml(SOURCE_LABELS[event.sourceType]||event.sourceType)}</span><strong>${escapeHtml(event.normalizedSummary)}</strong><small>${escapeHtml(event.id)}</small></div>`).join("")}</details><div class="goal-suggestion-actions"><button class="text-button" type="button" data-action="reject-goal-suggestion" data-goal-suggestion-id="${suggestion.id}">保持原目标</button><button class="soft-button" type="button" data-action="accept-goal-suggestion" data-goal-suggestion-id="${suggestion.id}" data-accept-mode="original">接受新目标</button><button class="primary-button" type="button" data-action="accept-goal-suggestion" data-goal-suggestion-id="${suggestion.id}" data-accept-mode="edited">编辑后接受</button><button class="text-button" type="button" data-action="defer-goal-suggestion" data-goal-suggestion-id="${suggestion.id}">稍后处理</button></div></article>`}).join("");
}
function renderAutoSyncReview(){
  const events=pendingSyncEvents();const suggestions=pendingGoalSuggestions();const high=events.filter(event=>event.projectId&&event.confidence>=AUTO_SYNC.ROUTE_THRESHOLDS.automatic).length;const uncertain=events.length-high;
  byId("auto-sync-review-summary").innerHTML=`<div><strong>${events.length}</strong><span>检测到的更新</span></div><div><strong>${high}</strong><span>高置信度归类</span></div><div><strong>${uncertain}</strong><span>活动需要查看</span></div><div><strong>${suggestions.length}</strong><span>目标建议待确认</span></div>`;
  renderGoalSuggestions();
  byId("auto-sync-review-list").innerHTML=events.map(event=>{const selected=Boolean(event.projectId&&event.confidence>=AUTO_SYNC.ROUTE_THRESHOLDS.review);const evidence=evidenceForEvent(event);return`<article class="sync-review-event ${event.confidence<AUTO_SYNC.ROUTE_THRESHOLDS.review?"needs-review":""}" data-sync-event-id="${event.id}"><label class="sync-event-check"><input type="checkbox" data-sync-accept ${selected?"checked":""}><span>${selected?"✓":"?"}</span></label><div class="sync-event-main"><div class="sync-event-title"><strong>${escapeHtml(event.normalizedSummary)}</strong><em>${Math.round(event.confidence*100)}%</em></div><label>归属项目<select data-sync-project><option value="">请选择项目</option>${projectOptions(event.projectId)}<option value="__ignore__">忽略这项活动</option></select></label><p class="sync-route-reason">${escapeHtml(event.metadata?.routeReason||"等待归类")}</p>${event.metadata?.inference?`<p class="sync-inference"><strong>推断边界：</strong>${escapeHtml(event.metadata.inference)}</p>`:""}<details class="evidence-chain"><summary>查看来源 · ${evidence.length} 条 Evidence</summary>${evidence.map(item=>`<div><span>${escapeHtml(SOURCE_LABELS[item.sourceType]||item.sourceType)}</span><strong>${escapeHtml(item.summary)}</strong><small>${escapeHtml(item.locator)}</small></div>`).join("")||"<p>暂无可展示证据</p>"}</details></div></article>`}).join("")||'<div class="inline-empty">当前没有待确认活动。</div>';
}
function openAutoSyncReview(){if(!pendingReviewCount())return showToast("当前没有待确认内容");renderAutoSyncReview();byId("auto-sync-review-dialog").showModal()}
function refreshAfterGoalSuggestion(message){const run=latestSyncRun();if(run)run.pendingCount=pendingReviewCount();autoSyncUi.status=pendingReviewCount()?"pending":"done";if(pendingReviewCount()){renderAutoSyncReview();save()}else{closeDialog("auto-sync-review-dialog");render()}showToast(message)}
function renderSyncRunDetail(){const run=latestSyncRun();if(!run){byId("sync-run-detail").innerHTML='<div class="inline-empty">还没有同步记录。</div>';return}const statuses=run.collectorStatuses||[];byId("sync-run-detail").innerHTML=`<div class="sync-audit-times"><div><span>开始</span><strong>${formatFullDate(run.syncStartedAt)}</strong></div><div><span>完成</span><strong>${formatFullDate(run.syncFinishedAt)}</strong></div><div><span>检查区间</span><strong>${formatFullDate(run.since)} → ${formatFullDate(run.until)}</strong></div></div><div class="collector-status-list">${statuses.map(item=>`<div class="collector-status is-${item.status}"><span>${sourceStatusIcon(item.status)}</span><strong>${escapeHtml(SOURCE_LABELS[item.sourceType]||item.sourceType)}</strong><p>${escapeHtml(item.message||item.status)}</p><em>${item.discovered||0} 项</em></div>`).join("")||'<p>同步未能取得数据源状态。</p>'}</div><div class="sync-audit-counts"><span>发现 ${run.discoveredCount||0}</span><span>去重 ${run.deduplicatedCount||0}</span><span>已确认 ${run.confirmedCount||0}</span><span>已忽略 ${run.ignoredCount||0}</span><span>待确认 ${run.pendingCount||0}</span></div>${run.error?`<p class="sync-soft-error">${escapeHtml(run.error)}</p>`:""}`}

function confirmAutoSyncReview(){
  const decisions=[];document.querySelectorAll("[data-sync-event-id]").forEach(card=>{const eventId=card.dataset.syncEventId;const projectValue=card.querySelector("[data-sync-project]").value;const accepted=card.querySelector("[data-sync-accept]").checked;if(projectValue==="__ignore__")decisions.push({eventId,action:"ignore"});else if(accepted&&projectValue)decisions.push({eventId,action:"confirm",projectId:projectValue})});
  const reviewedAt=now();const counts=AUTO_SYNC.applyReviewDecisions(state,decisions,{confirmedAt:reviewedAt});const createdSuggestions=AUTO_SYNC.detectGoalDriftSuggestions(state,{createdAt:reviewedAt});const run=latestSyncRun();if(run){run.confirmedCount=(run.confirmedCount||0)+counts.confirmed;run.ignoredCount=(run.ignoredCount||0)+counts.ignored;run.pendingCount=pendingReviewCount()}
  if(createdSuggestions.length){autoSyncUi.status="pending";renderAutoSyncReview();save();showToast(`活动已确认，并发现 ${createdSuggestions.length} 项目标偏移建议`);return}
  closeDialog("auto-sync-review-dialog");ui.view="dashboard";ui.zoneId=null;ui.projectId=null;autoSyncUi.status=pendingReviewCount()?"pending":"done";render();showToast(`已确认 ${counts.confirmed} 项，忽略 ${counts.ignored} 项`);
}

function inspirationSource(item) {
  const zone=state.zones.find(entry=>entry.id===item.zoneId);
  const project=zone?.projects.find(entry=>entry.id===item.projectId);
  return{zone,project,label:project?`${zone.name} / ${project.name}`:item.projectName?`${item.zoneName||"原主任务"} / ${item.projectName}`:"Workspace 灵感"};
}
function inspirationVisual(item) {
  const presetId=INSPIRATION_ORB_PRESETS.includes(item.orbPresetId)?item.orbPresetId:fallbackInspirationOrbPreset(item.id);
  return{presetId,label:INSPIRATION_ORB_LABELS[presetId]||"AI 球"};
}
function inspirationAiMeta(item) {
  const labels={idle:"等待 AI",thinking:"AI 分析中",ready:"AI 有新反馈",attention:"需要你确认",error:"AI 暂不可用"};
  const aiState=INSPIRATION_AI_STATES.includes(item.aiState)?item.aiState:"idle";
  return{state:aiState,label:labels[aiState]};
}
function nextInspirationOrbPresetId() {
  const counts=new Map(INSPIRATION_ORB_PRESETS.map(id=>[id,0]));
  (state.inspirations||[]).forEach(item=>{const id=INSPIRATION_ORB_PRESETS.includes(item.orbPresetId)?item.orbPresetId:fallbackInspirationOrbPreset(item.id);counts.set(id,(counts.get(id)||0)+1)});
  return INSPIRATION_ORB_PRESETS.reduce((selected,id)=>(counts.get(id)<counts.get(selected)?id:selected),INSPIRATION_ORB_PRESETS[0]);
}
function addInspiration(value) {
  const textValue=String(value||"").trim();if(!textValue)return null;
  const existing=(state.inspirations||[]).find(item=>item.text.toLocaleLowerCase()===textValue.toLocaleLowerCase());if(existing)return existing;
  const timestamp=now();const item=normalizeInspiration({text:textValue,source:"dashboard",orbPresetId:nextInspirationOrbPresetId(),aiState:"idle",createdAt:timestamp,updatedAt:timestamp},workspaceMode);
  state.inspirations.push(item);return item;
}
function renderInspirationLibrary() {
  const entries=[...(state.inspirations||[])].sort((a,b)=>timestampOf(b.updatedAt)-timestampOf(a.updatedAt));const open=ui.inspirationOpen;
  const selected=entries.find(item=>item.id===ui.inspirationSelectedId);const selectedSource=selected?inspirationSource(selected):null;
  const bubbles=entries.map(item=>{const visual=inspirationVisual(item);const ai=inspirationAiMeta(item);const active=item.id===ui.inspirationSelectedId;return`<button type="button" class="inspiration-bubble inspiration-orb-card ${active?"is-selected":""}" data-action="select-inspiration" data-inspiration-id="${escapeHtml(item.id)}" data-orb-preset="${visual.presetId}" data-ai-state="${ai.state}" aria-pressed="${active}" aria-label="${escapeHtml(item.text)}，${ai.label}"><span class="inspiration-orb-visual" data-orb-preset="${visual.presetId}"><canvas class="inspiration-orb-canvas" data-orb-preset="${visual.presetId}" data-ai-state="${ai.state}" aria-hidden="true"></canvas><span class="inspiration-orb-fallback" aria-hidden="true"></span></span><span class="inspiration-orb-title">${escapeHtml(item.text)}</span></button>`}).join("");
  const picker=selected?INSPIRATION_ORB_PRESETS.map((presetId,index)=>`<button type="button" class="inspiration-orb-choice ${selected.orbPresetId===presetId?"is-selected":""}" data-action="set-inspiration-orb" data-inspiration-id="${escapeHtml(selected.id)}" data-orb-preset="${presetId}" aria-label="更换这条灵感绑定的 AI 球：${INSPIRATION_ORB_LABELS[presetId]}"><i data-orb-preset="${presetId}" aria-hidden="true"></i><span>AI 球 ${index+1}</span></button>`).join(""):"";
  const detail=selected?`<aside class="inspiration-detail"><div class="inspiration-detail-main"><span>正在查看</span><h3>${escapeHtml(selected.text)}</h3><p>记录来源：${escapeHtml(selectedSource.label)} · ${formatDate(selected.createdAt)}</p>${selected.aiSummary?`<p class="inspiration-ai-summary">${escapeHtml(selected.aiSummary)}</p>`:""}</div><div class="inspiration-orb-picker"><span>绑定的 AI 球</span><div>${picker}</div></div>${selectedSource.project?`<button class="soft-button" data-action="open-project" data-zone-id="${selectedSource.zone.id}" data-project-id="${selectedSource.project.id}">打开来源项目</button>`:""}</aside>`:"";
  return`<section class="inspiration-library ${open?"is-open":"is-collapsed"}" id="inspiration-library"><button type="button" class="inspiration-library-head" data-action="toggle-inspiration-library" aria-expanded="${open}" aria-controls="inspiration-library-body"><div><p class="section-kicker">让想法先活下来</p><h2>灵感库</h2><span>这里不放待办事项，只保存还没有定型、值得以后再看的想法。</span></div><div class="inspiration-head-meta"><span class="inspiration-count">${entries.length}</span><strong>${open?"收起":"展开灵感空间"}</strong></div></button>${open?`<div class="inspiration-library-body" id="inspiration-library-body"><form class="inspiration-capture" data-inspiration-form="dashboard"><label for="dashboard-inspiration-input">从首页添加</label><div><input id="dashboard-inspiration-input" autocomplete="off" placeholder="刚刚冒出的想法…" value="${escapeHtml(dashboardInspirationDraft())}"><button class="primary-button" type="submit">加入灵感库</button></div></form><div class="inspiration-bubble-space">${bubbles||'<p class="inspiration-empty">这里还没有灵感。先记下一条没有被规划过的想法吧。</p>'}</div>${detail}</div>`:""}</section>`;
}

function render() {
  if (ui.view === "zone" && currentZone()) renderZone(currentZone());
  else if (ui.view === "project" && currentProject()) renderProject(currentZone(),currentProject());
  else if (ui.view === "focus" && currentProject() && activeSession(currentProject())) renderFocus(currentZone(),currentProject(),activeSession(currentProject()));
  else { ui.view = "dashboard"; renderDashboard(); }
  window.ProjectOSInspirationOrbs?.sync();
  save({touch:false});
}

const TASK_COMMAND_LABELS={EDIT:"编辑任务",PAUSE:"暂停任务",FREEZE:"冻结任务",COMPLETE:"标记完成",REOPEN:"重新开启",VIEW:"查看存档",DELETE:"永久删除"};
function renderTaskControls(kind,task) {
  const status=taskStatus(task);const label=taskStatusLabel(task);const actions=window.ProjectOSLifecycle.taskMenuActions(task);
  return `<div class="task-head-controls"><span class="lifecycle-badge lifecycle-${status}">${label}</span><div class="task-menu"><button class="task-menu-trigger" data-action="toggle-task-menu" aria-label="任务操作" title="任务操作">···</button><div class="task-menu-dropdown" hidden>${actions.map((command,index)=>`${command==="DELETE"?'<span class="task-menu-divider"></span>':""}<button class="task-menu-item ${command==="DELETE"?"is-danger":""}" data-action="task-command" data-task-kind="${kind}" data-task-id="${task.id}" data-command="${command}">${TASK_COMMAND_LABELS[command]}</button>`).join("")}</div></div></div>`;
}
function archiveCounts(items){return{paused:items.filter(item=>taskStatus(item)===TASK_STATUS.PAUSED).length,frozen:items.filter(item=>taskStatus(item)===TASK_STATUS.FROZEN).length,completed:items.filter(item=>taskStatus(item)===TASK_STATUS.COMPLETED).length}}
function renderArchivedZoneRow(zone){return `<article class="archive-task-row"><div>${renderTaskControls("zone",zone)}<strong>${escapeHtml(zone.name)}</strong><small>${zone.projects.length} 个次级项目 · 更新 ${formatDate(zone.updatedAt)}</small></div><button class="soft-button" data-action="open-zone" data-zone-id="${zone.id}">查看存档</button></article>`}
function renderArchivedProjectRow(project){return `<article class="archive-task-row"><div>${renderTaskControls("project",project)}<strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.currentState||"尚未记录状态")} · 更新 ${formatDate(project.updatedAt)}</small></div><button class="soft-button" data-action="open-project" data-project-id="${project.id}">查看存档</button></article>`}

function renderDailyCommandCenter(){
  const brief=AUTO_SYNC.buildDailyBrief(state,now());
  const workRows=brief.yesterday.map(item=>`<article class="daily-brief-row"><div><span>${escapeHtml(item.zoneName)} / ${escapeHtml(item.projectName)}</span><strong>${escapeHtml(item.summary)}</strong><small>${formatDate(item.timestamp)} · ${escapeHtml(SOURCE_LABELS[item.sourceType]||item.sourceType)}${item.reason?` · ${escapeHtml(item.reason)}`:""}</small></div><button class="mini-link" data-action="open-project" data-zone-id="${item.zoneId}" data-project-id="${item.projectId}">查看</button></article>`).join("");
  const actionRows=brief.todayActions.map((item,index)=>`<article class="daily-brief-row ${index===0?"is-primary":""}"><div><span>${index===0?"建议先做":"随后可做"} · ${escapeHtml(item.zoneName)} / ${escapeHtml(item.projectName)}</span><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.reason)}</small></div><button class="mini-link" data-action="open-project" data-zone-id="${item.zoneId}" data-project-id="${item.projectId}">进入</button></article>`).join("");
  const blockedRows=brief.blocked.map(item=>`<article class="daily-brief-row is-blocked"><div><span>${item.priority==="HIGH"?"高优先级阻塞":"当前阻塞"} · ${escapeHtml(item.zoneName)} / ${escapeHtml(item.projectName)}</span><strong>${escapeHtml(item.text)}</strong><small>这条阻塞会一直可见，直到明确解决、推迟或删除。</small></div><button class="mini-link" data-action="open-project" data-zone-id="${item.zoneId}" data-project-id="${item.projectId}">处理</button></article>`).join("");
  const pathRows=brief.pathIssues.map(item=>`<div class="daily-path-warning"><span>目录需要修复</span><strong>${escapeHtml(item.projectName)}</strong><code>${escapeHtml(item.path)}</code><button class="mini-link" data-action="open-project-source-settings" data-project-id="${item.projectId}">修复路径</button></div>`).join("");
  return`<section class="daily-command-center"><div class="daily-command-head"><div><p class="section-kicker">每日驾驶舱</p><h2>昨天、今天、卡点</h2><span>只使用已确认记录；待 Review 的 ${brief.reviewCount} 项不会混进正式进度。</span></div>${brief.reviewCount?'<button class="primary-button" data-action="review-sync">处理待确认更新</button>':""}</div>${pathRows?`<div class="daily-path-warnings">${pathRows}</div>`:""}<div class="daily-command-grid"><section><header><span>01</span><div><strong>昨天做了什么</strong><small>${brief.yesterday.length} 条已确认记录</small></div></header><div class="daily-brief-list">${workRows||'<p class="daily-empty">昨天没有已确认记录。Auto Sync 未捕获到的工作可以在项目内手动补充。</p>'}</div></section><section><header><span>02</span><div><strong>今天该做什么</strong><small>${brief.todayActions.length} 个可执行入口</small></div></header><div class="daily-brief-list">${actionRows||'<p class="daily-empty">还没有明确下一步。先进入一个项目补全当前目标和下一步。</p>'}</div></section><section><header><span>03</span><div><strong>项目卡在哪里</strong><small>${brief.blocked.length} 个明确阻塞</small></div></header><div class="daily-brief-list">${blockedRows||'<p class="daily-empty is-clear">当前没有已确认阻塞。</p>'}</div></section></div></section>`;
}

function renderDashboard() {
  if (!state.zones.length) {
    app.innerHTML = workspaceMode===WORKSPACE_MODES.DEMO?`<section class="empty-state demo-empty-state"><div class="empty-state-inner"><span class="empty-icon">D</span><p class="eyebrow demo-eyebrow">DEMO / 独立演示工作区</p><h1>选择演示起点</h1><p>保持空白，自行建立演示项目；或一键载入两条示例主线。这里的任何操作都不会进入正式存档。</p><div class="demo-empty-actions"><button class="text-button" data-action="add-zone">建立空白 Demo</button><button class="demo-primary" data-action="load-demo-sample">载入示例数据</button></div></div></section>`:`${renderSyncBanner()}<section class="empty-state"><div class="empty-state-inner"><span class="empty-icon">＋</span><p class="eyebrow">一次聚焦一个长期方向</p><h1>建立第一个主任务</h1><p>建立项目并注册工作目录后，Project OS 会自动观察 Git 与本地文件活动。</p><button class="primary-button hero" data-action="add-zone">＋ 追加主任务</button></div></section>`;
    return;
  }
  const activeZones=state.zones.filter(isActiveTask);const archivedZones=state.zones.filter(zone=>!isActiveTask(zone));const primary = activeZones.slice(0,3); const others = activeZones.slice(3); const recommendation=dashboardRecommendation(); const activities=dashboardActivities(); const pauseSuggestion=dashboardPauseSuggestion(recommendation);const archivedCounts=archiveCounts(archivedZones);
  const stats=workspaceStats(); const isDemo=workspaceMode===WORKSPACE_MODES.DEMO;
  app.innerHTML = `${renderSyncBanner()}<section class="home-hero cockpit-hero"><div><p class="section-kicker">${isDemo?"独立演示工作区 · 本机隔离":"Project OS · 每日工作进度"}</p><h1>${isDemo?"我现在该推进什么？":"先看清进度，再开始今天"}</h1><p>${isDemo?"先选主任务，再进入次级项目，恢复背景后开始本次工作。":"昨天的事实、今天的行动和当前卡点都在下面；未确认推断不会混入正式状态。"}</p></div><button class="primary-button hero" data-action="add-zone">＋ 追加主任务</button></section>
    ${isDemo?"":renderDailyCommandCenter()}
    <section class="cockpit-overview" aria-label="主任务总览"><div class="overview-stats"><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="zones"?"is-selected":""}" data-action="dashboard-stat" data-stat="zones" aria-pressed="${ui.dashboardStat==="zones"}"><span>主任务</span><strong>${state.zones.length} <small>/ ${MAX_ZONES}</small></strong><em>查看列表 →</em></button><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="active-projects"?"is-selected":""}" data-action="dashboard-stat" data-stat="active-projects" aria-pressed="${ui.dashboardStat==="active-projects"}"><span>活跃次级项目</span><strong>${stats.activeProjects}</strong><em>筛选项目 →</em></button><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="today"?"is-selected":""}" data-action="dashboard-stat" data-stat="today" aria-pressed="${ui.dashboardStat==="today"}"><span>今日工作</span><strong>${stats.today}</strong><em>查看今日 →</em></button><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="completed"?"is-selected":""}" data-action="dashboard-stat" data-stat="completed" aria-pressed="${ui.dashboardStat==="completed"}"><span>已完成工作</span><strong>${stats.completed}</strong><em>查看历史 →</em></button><button type="button" class="overview-stat dashboard-stat-card ${ui.dashboardStat==="focus"?"is-selected":""}" data-action="dashboard-stat" data-stat="focus" aria-pressed="${ui.dashboardStat==="focus"}"><span>本周专注</span><strong class="stat-name">${stats.focus}</strong><em>查看明细 →</em></button></div><article class="overview-recommendation"><div class="overview-orb" aria-hidden="true"><iframe src="liquid-orb.html" title="" tabindex="-1" loading="eager"></iframe></div><div class="recommendation-head"><span class="signal-dot"></span><strong>今日建议</strong><small>本地规则生成</small></div>${recommendation?`<h2>建议优先推进：${escapeHtml(recommendation.zone.name)}${recommendation.project?` / ${escapeHtml(recommendation.project.name)}`:""}</h2><p>${escapeHtml(recommendation.reason)}</p><span class="rule-note">判断依据：${escapeHtml(recommendation.rule)}</span>`:'<h2>先建立一个明确的下一步</h2>'}</article></section>
    ${renderDashboardStatDetail(stats)}
    <section class="console-section"><div class="section-head cockpit-section-head"><div><p class="section-kicker">主任务入口</p><h2>选择一个大方向</h2></div><span>默认只显示进行中的主任务</span></div><div class="zone-grid">${primary.map((zone,index) => renderZoneCard(zone,index)).join("")||'<div class="inline-empty">当前没有进行中的主任务，可从下方存档区重新开启。</div>'}</div></section>
    ${others.length ? `<section class="other-zones"><button class="other-toggle" data-action="toggle-other">其他主任务 ${others.length} / ${MAX_ZONES} <span>${ui.showOtherZones ? "收起" : "展开"}</span></button>${ui.showOtherZones ? `<div class="zone-grid">${others.map((zone,index) => renderZoneCard(zone,index+3)).join("")}</div>` : ""}</section>` : ""}
    ${archivedZones.length?`<section class="archive-console"><button class="archive-toggle" data-action="toggle-archived-zones"><span>暂停 / 冻结 / 已完成</span><strong>暂停 ${archivedCounts.paused} · 冻结 ${archivedCounts.frozen} · 完成 ${archivedCounts.completed}</strong><em>${ui.showArchivedZones?"收起":"展开"}</em></button>${ui.showArchivedZones?`<div class="archive-task-list">${archivedZones.map(renderArchivedZoneRow).join("")}</div>`:""}</section>`:""}
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
function renderLink(zone,link) { const target = linkedZone(link,zone.id); const allowed = link.scopes.map(scope => SCOPE_LABELS[scope]).filter(Boolean); return `<article class="link-card"><div class="link-route"><strong>${escapeHtml(zone.name)}</strong><span>↔</span><strong>${escapeHtml(target?.name || "未知主任务")}</strong></div><div><small>关系模式</small><p>只读参考 · 不会跨项目写回状态${link.confirmedByUser?"":" · 旧规则待重新确认"}</p><small>建立原因</small><p>${escapeHtml(link.reason||"尚未填写")}</p><small>当前共享</small><p>${escapeHtml(allowed.join("、") || "仅建立关联，不共享内容")}</p><small>始终不共享</small><p>技术调试、源代码、项目私有记忆、内部提示词、完整工作记录</p></div></article>`; }

function automaticHistoryEntries(project){return(project.timeline||[]).map(item=>({item,event:(state.activityEvents||[]).find(event=>event.id===item.eventId)})).filter(entry=>entry.event?.status===AUTO_SYNC.EVENT_STATUS.CONFIRMED&&["git","filesystem","codex"].includes(entry.event.sourceType))}

function renderProject(zone,project) {
  const recent = lastEndedSession(project); const stage=projectStage(project,zone); const sessionStatus=activeSession(project)?"本次工作进行中":"当前没有进行中的工作";
  const completedSummary=project.completed.length?`${project.importedMilestones?.length?"包含已导入历史成果\n":""}${project.completed.slice(-3).join("\n")}`:"尚无完成记录";
  const workButton=isActiveTask(zone)&&isActiveTask(project)?`<button class="primary-button hero" data-action="continue-work">${activeSession(project) ? "继续任务" : "进入任务"}</button>`:!isActiveTask(zone)?'<span class="archive-view-note">主任务未开启 · 仅查看存档</span>':`<button class="primary-button hero" data-action="task-command" data-task-kind="project" data-task-id="${project.id}" data-command="REOPEN">重新开启</button>`;
  const lastSyncAt=state.settings?.autoSync?.lastSyncAt;
  const goalSuggestion=pendingGoalSuggestionForProject(project.id);
  const goalSuggestionNotice=goalSuggestion?`<article class="project-goal-suggestion-notice"><div><span>检测到目标偏移 · 尚未修改</span><strong>${escapeHtml(goalSuggestion.suggestedGoal)}</strong><small>当前目标会保持不变，直到你明确接受。</small></div><button class="primary-button" data-action="review-sync">查看并确认</button></article>`:"";
  app.innerHTML = `<button class="back-button" data-action="back-zone">← 返回${escapeHtml(zone.name)}</button><div class="breadcrumb">${escapeHtml(zone.name)} <span>›</span> ${escapeHtml(project.name)}</div><section class="resume-hero project-resume-hero"><div><p class="eyebrow">项目续接</p><div class="hero-title-row"><h1>${escapeHtml(project.name)}</h1>${renderTaskControls("project",project)}</div><div class="purpose-row"><p class="purpose">${escapeHtml(project.purpose || "尚未补充项目目的")}</p><button class="mini-link light" data-action="edit-project-state" data-edit-field="purpose">编辑目的</button></div><div class="project-hero-meta"><span>当前阶段 · ${stage}</span><span>项目更新 ${formatDate(project.updatedAt)}</span><span>最近同步 ${lastSyncAt?formatDate(lastSyncAt):"尚未执行"}</span><span>${sessionStatus}</span></div></div>${workButton}</section>
    ${renderActionDirective(project)}<div class="resume-layout"><section class="resume-panel"><div class="resume-grid">${goalSuggestionNotice}${renderProjectStatePanel(project,stage)}${resumeBlock("当前目标",project.goal||"尚未定义",false,false,"goal")}${resumeBlock("已完成阶段",completedSummary,false,false,"completed")}${renderBlockersBlock(project)}${resumeBlock("最后更新时间",formatDate(project.updatedAt),true)}</div></section><aside class="side-panel"><h3>项目背景</h3>${renderSourceHealth(project)}<label class="project-keep-control"><input type="checkbox" data-action="toggle-keep-empty" ${project.keepWhenEmpty?"checked":""}><span><strong>即使没有工作记录，也保留这个项目</strong><small>适合暂停中、待启动或只建立框架的长期项目。</small></span></label><nav class="nav-list">${detailNav("timeline","证据时间线",project.timeline?.length||0)}${detailNav("memory","项目私有记忆",project.projectMemory.length)}${detailNav("history","工作历史",formalSessions(project).length+automaticHistoryEntries(project).length)}${detailNav("backlog","待办池",project.backlog.length)}${detailNav("parking","暂存区",project.parkingLot.length)}</nav><div class="detail-drawer">${renderDetail(zone,project,ui.detailTab)}</div></aside></div>`;
}

function renderProjectSkills(project) { const selected=state.skills.filter(skill=>(project.skillIds||[]).includes(skill.id)); return selected.length ? selected.map(skill=>`<span class="skill-chip">${escapeHtml(skill.name)}</span>`).join("") : '<p class="form-hint">尚未设置常用能力。</p>'; }
function renderSourceHealth(project){const bindings=AUTO_SYNC.ensureProjectSourceBindings(project).filter(item=>item.active!==false);if(!bindings.length)return`<div class="source-health is-empty"><div><strong>工作目录</strong><button class="mini-link" data-action="open-project-source-settings" data-project-id="${project.id}">配置</button></div><p>尚未注册目录，Auto Sync 不会猜测项目归属。</p></div>`;return`<div class="source-health"><div><strong>工作目录 · ${bindings.length}</strong><button class="mini-link" data-action="open-project-source-settings" data-project-id="${project.id}">管理</button></div>${bindings.map(binding=>`<article class="source-health-row is-${escapeHtml(binding.status||"unknown")}"><span>${binding.status==="available"?"✓":binding.status==="missing"?"!":"·"}</span><div><strong>${escapeHtml(binding.canonicalPath)}</strong><small>${escapeHtml(binding.statusMessage||"等待同步验证")}${binding.aliases.length>1?` · 保留 ${binding.aliases.length-1} 个历史路径映射`:""}</small></div></article>`).join("")}</div>`}

function renderActionDirective(project){return`<section class="project-action-directive"><div><span>行动指示 · 推荐下一步</span><strong>${escapeHtml(nextAction(project))}</strong></div><button class="mini-link" data-action="edit-project-state" data-edit-field="next">编辑</button></section>`}
function renderProjectStatePanel(project,stage){const progress=project.currentProgressSummary||"尚未记录";return`<article class="project-state-panel full"><div class="project-state-panel-head"><div><span>项目状态</span><strong>${escapeHtml(stage)}</strong></div><div class="state-panel-actions"><button class="mini-link" data-action="edit-project-state" data-edit-field="state">编辑状态</button><button class="mini-link" data-action="edit-project-state" data-edit-field="phase">编辑阶段</button></div></div><div class="project-state-content"><div><small>当前状态</small><p>${escapeHtml(project.currentState||"尚未记录")}</p></div><div><small>最新进度</small><p>${escapeHtml(progress)}</p></div></div>${phaseTrack(stage)}</article>`}
function resumeBlock(label,value,full=false,priority=false,editField="") { return `<article class="resume-block ${full?"full":""} ${priority?"is-priority":""}"><div class="resume-block-head"><label>${label}</label>${editField?`<button class="mini-link" data-action="edit-project-state" data-edit-field="${editField}">编辑</button>`:""}</div><p>${escapeHtml(value)}</p></article>`; }
function renderIssueChip(issue,index,status="open"){
  const resolved=status==="resolved";
  return`<div class="issue-chip ${resolved?"is-resolved":""}"><button class="issue-chip-toggle" type="button" data-action="set-issue-status" data-issue-index="${index}" data-issue-status="${resolved?"open":"resolved"}" aria-label="${resolved?"恢复为当前问题":"标记已经完成"}" title="${resolved?"恢复为当前问题":"标记已经完成"}">${resolved?"✓":"○"}</button><span class="issue-chip-text">${escapeHtml(issue)}</span>${resolved?'<span class="issue-chip-state">已完成</span>':""}<button class="issue-chip-delete" type="button" data-action="delete-issue" data-issue-index="${index}" data-issue-status="${status}" aria-label="删除问题" title="删除问题">×</button></div>`;
}
function renderBlockersBlock(project){
  const active=currentBlockers(project);
  const closed=(project.blockers||[]).filter(item=>item.status!==BLOCKER_STATUS.OPEN);
  const openIssues=project.openIssues||[];
  const resolvedIssues=project.resolvedIssues||[];
  const pending=project.blockerReviewPending&&openIssues.length;
  const issuesHtml=openIssues.length||resolvedIssues.length
    ?`<div class="issue-list"><strong>当前问题</strong><div class="issue-chip-list">${openIssues.map((item,index)=>renderIssueChip(item,index,"open")).join("")}${resolvedIssues.map((item,index)=>renderIssueChip(item,index,"resolved")).join("")}</div></div>`
    :'<div class="issue-list is-empty"><strong>当前问题</strong><p>暂无已确认问题</p></div>';
  const activeHtml=active.length
    ?`<div class="blocker-list">${active.map(item=>`<div class="blocker-item"><div><span class="blocker-priority ${item.priority==="HIGH"?"is-high":""}">${item.priority==="HIGH"?"高优先级":"未解决"}</span><p>${escapeHtml(item.text)}</p></div><div class="blocker-actions"><button data-action="set-blocker-status" data-blocker-id="${item.id}" data-blocker-status="RESOLVED">标记解决</button><button data-action="set-blocker-status" data-blocker-id="${item.id}" data-blocker-status="DEFERRED">稍后处理</button><button class="delete-blocker-button" data-action="delete-blocker" data-blocker-id="${item.id}" aria-label="删除阻塞" title="删除阻塞">×</button></div></div>`).join("")}</div>`
    :pending?`<div class="blocker-empty"><p>尚未确认哪些问题会阻塞推进</p><button class="mini-link" data-action="record-blocker">确认一个阻塞</button></div>`:`<div class="blocker-empty"><p>当前无明确阻塞</p><button class="mini-link" data-action="record-blocker">记录一个问题</button></div>`;
  const history=closed.length?`<details class="blocker-history"><summary>查看已解决 / 已推迟问题 · ${closed.length}</summary>${closed.map(item=>`<div class="closed-blocker"><span>${item.status===BLOCKER_STATUS.RESOLVED?"已解决":"已推迟"}</span><p>${escapeHtml(item.text)}</p><div><button data-action="set-blocker-status" data-blocker-id="${item.id}" data-blocker-status="OPEN">重新打开</button><button class="delete-blocker-button" data-action="delete-blocker" data-blocker-id="${item.id}" aria-label="删除阻塞" title="删除阻塞">×</button></div></div>`).join("")}</details>`:"";
  return`<article class="resume-block full blocker-block"><div class="blocker-block-head"><label>当前问题 / 阻塞</label><div><button class="mini-link" data-action="edit-project-state" data-edit-field="issues">编辑</button>${active.length?'<button class="mini-link" data-action="record-blocker">＋ 记录问题</button>':""}</div></div>${issuesHtml}<div class="blocker-subhead">当前阻塞</div>${activeHtml}${history}</article>`;
}
function detailNav(key,label,count) { return `<button class="nav-item ${ui.detailTab===key?"is-active":""}" data-action="detail-tab" data-tab="${key}"><span>${label}</span><strong>${count}</strong></button>`; }
function listHtml(items,empty) { return items.length ? `<ul class="memory-list">${items.map(item=>`<li>${escapeHtml(memoryText(item))}</li>`).join("")}</ul>` : `<p>${empty}</p>`; }
function renderDetail(zone,project,tab) {
  if (tab === "timeline") return renderEvidenceTimeline(project);
  if (tab === "history") return renderHistory(project);
  if (tab === "backlog") return `<h4>待办池</h4>${listHtml(project.backlog,"暂时没有积压事项。")}`;
  if (tab === "parking") return `<h4>暂存区</h4>${listHtml(project.parkingLot,"暂时没有临时想法。")}`;
  return `<h4>项目私有记忆</h4>${listHtml([...project.projectMemory,...project.decisions.map(item=>`决定：${item}`),...project.constraints.map(item=>`约束：${item}`)],"尚未沉淀项目私有记忆。")}<h4>主任务共享记忆</h4>${listHtml(zone.sharedMemory,"当前主任务没有共享记忆。")}`;
}

function renderEvidenceTimeline(project){
  const entries=(project.timeline||[]).map(item=>({item,event:(state.activityEvents||[]).find(event=>event.id===item.eventId)})).filter(entry=>entry.event);
  return`<h4>证据时间线</h4>${entries.length?entries.map(({item,event})=>{const evidence=evidenceForEvent(event);const isGoalChange=event.eventType==="goal_change";const reason=event.metadata?.changeReason;const actions=event.metadata?.nonReversible?"":`<div>${isGoalChange?"":`<button class="mini-link" data-action="reroute-activity-event" data-event-id="${event.id}">修改归类</button>`}<button class="mini-link is-danger" data-action="undo-activity-event" data-event-id="${event.id}">${isGoalChange?"撤销目标修改":"撤销"}</button></div>`;return`<article class="timeline-evidence-item ${isGoalChange?"is-goal-change":""}"><time>${formatDate(item.timestamp)}</time><strong>${escapeHtml(item.summary)}</strong><small>${escapeHtml(SOURCE_LABELS[event.sourceType]||event.sourceType)} · Confidence ${Math.round((event.confidence||0)*100)}%${reason?` · 原因：${escapeHtml(reason)}`:""}</small><details><summary>查看来源 · ${evidence.length}</summary>${evidence.map(record=>`<p><b>${escapeHtml(record.summary)}</b><span>${escapeHtml(record.locator)}</span></p>`).join("")}</details>${actions}</article>`}).join(""):'<p>还没有已确认的证据事件。</p>'}`;
}

function renderHistory(project) {
  const sessions=[...project.sessions].reverse();
  const synced=automaticHistoryEntries(project);
  const selected=new Set(ui.selectedHistoryIds||[]);
  const items=sessions.map(session=>{const number=project.sessions.findIndex(item=>item.id===session.id)+1;const title=session.title||session.goal||"本次工作";const heading=`No.${number} · ${title}`;const timing=session.timeEntryMode==="MANUAL_CONFIRMED"?`人工确认 · ${session.focusMinutes||0} 分钟 · ${formatDate(session.startedAt)} 至 ${formatDate(session.endedAt)}`:session.kind==="project-origin"?"项目建立记录":"时长未人工确认";return`<article class="history-item"><div class="history-item-head">${ui.historyManage?`<label class="history-select"><input type="checkbox" data-action="toggle-history-selection" data-session-id="${session.id}" ${selected.has(session.id)?"checked":""}><span><strong>${escapeHtml(heading)}</strong><br>${formatDate(session.startedAt)}</span></label>`:`<div><strong>${escapeHtml(heading)}</strong><br><small>${escapeHtml(timing)}</small></div>`}<div>${session.isDemo?`<span class="demo-badge ${session.promotedToFormal?"promoted":""}">${session.promotedToFormal?"演示 · 已写入正式项目":"演示"}</span>`:""}</div></div><p>${session.endedAt?"已结束":"进行中"}${session.summary?` · ${escapeHtml(session.summary.split("\n")[0])}`:""}</p>${ui.historyManage?"":`<button class="history-delete" data-action="delete-session" data-session-id="${session.id}">删除记录</button>`}</article>`}).join("");
  const actions=ui.historyManage?`<div class="history-actions"><div class="history-actions-row"><button class="danger-primary" data-action="delete-selected-history" ${selected.size?"":"disabled"}>删除选中记录</button><button class="danger-button" data-action="clear-project-history" ${sessions.length?"":"disabled"}>清空当前项目的全部工作历史</button></div><button class="text-button" data-action="cancel-history-manage">退出管理</button></div>`:"";
  const legacyDemoCount=project.sessions.filter(session=>session.isDemo).length;
  const syncedItems=synced.slice(0,8).map(({item,event})=>`<article class="history-item"><div class="history-item-head"><div><strong>Auto Sync · ${escapeHtml(item.summary)}</strong><br>${formatDate(item.timestamp)}</div><span class="demo-badge promoted">已确认</span></div><p>${escapeHtml(SOURCE_LABELS[event.sourceType]||event.sourceType)} · ${Math.round((event.confidence||0)*100)}% · 证据 ${evidenceForEvent(event).length} 条</p></article>`).join("");
  const allEvidenceLink=synced.length>8?`<button class="mini-link" data-action="detail-tab" data-tab="timeline">查看全部 ${synced.length} 条证据</button>`:"";
  return `<div class="history-head"><h4>工作历史</h4><button class="mini-link" data-action="manage-history">${ui.historyManage?"选择记录":"管理历史"}</button></div>${syncedItems?`<div class="history-list"><p class="section-kicker">自动发现且已确认 · 最近 ${Math.min(8,synced.length)} 条</p>${syncedItems}${allEvidenceLink}</div>`:""}${sessions.length?`<div class="history-list"><p class="section-kicker">人工工作记录</p>${items}</div>`:syncedItems?"":"<p>还没有工作记录。</p>"}${actions}${legacyDemoCount&&workspaceMode===WORKSPACE_MODES.NORMAL?`<div class="history-actions"><button class="danger-button" data-action="clear-demo-data">清除旧版演示记录</button><p class="form-hint">这是兼容旧数据的清理入口；新的演示请使用独立演示环境。</p></div>`:""}`;
}

function renderFocus(zone,project,session) {
  restoreSessionDraftMirror(session);
  const parkingItems=session.isDemo?session.parkingAdded:project.parkingLot;
  app.innerHTML = `<section class="focus-shell"><button class="back-button" data-action="back-project">← 返回项目续接</button><header class="focus-head"><div><p class="eyebrow">本次工作进行中</p><h1>${escapeHtml(project.name)}</h1><p class="focus-zone">所属主任务：${escapeHtml(zone.name)}</p></div><span class="focus-badge">${session.isDemo?"演示":"聚焦"}</span></header>${session.isDemo?'<div class="tool-rule"><strong>演示模式</strong>本次操作只保存在演示工作记录内，不更新正式项目、长期记忆、统计或关联主任务。</div>':""}<section class="today-focus"><div class="today-focus-head"><div><p class="eyebrow">今日只做</p><h2>${escapeHtml(session.goal)}</h2></div><small>${session.todos.filter(todo=>todo.completed).length} / ${session.todos.length} 完成</small></div><div class="focus-todos">${session.todos.map(todo=>`<article class="focus-todo ${todo.completed?"is-done":""}"><button class="todo-check" data-action="toggle-todo" data-todo-id="${todo.id}" aria-label="${todo.completed?"恢复事项":"完成事项"}"></button><div><span class="todo-kind">${todo.kind==="PRIMARY"?"主行动":"可选"}</span><span class="todo-text">${escapeHtml(todo.text)}</span></div></article>`).join("")}</div></section><div class="focus-grid"><section class="focus-card"><h3>本次工作笔记</h3><textarea id="session-notes" placeholder="记录本次变化、验证结果或新发现…">${escapeHtml(session.notes||"")}</textarea><div class="session-actions"><button class="soft-button stuck-button" data-action="stuck" title="我有一个具体问题，需要 AI 帮我解决。">🆘 我卡住了</button><button class="soft-button status-review-button" data-action="summarize-work" title="根据本次证据生成可确认的项目更新。">总结工作</button><button class="text-button" data-action="pause-session">暂停本次工作</button><button class="primary-button" data-action="end-session">结束本次工作</button></div></section><aside class="focus-card"><h3>${session.isDemo?"演示暂存":"暂存区"}</h3><div class="quick-add"><input id="parking-input" placeholder="突然想到的事…"><button class="soft-button" data-action="add-parking">存下</button></div><div class="parking-items">${parkingItems.slice(-5).reverse().map(item=>`<div class="parking-item"><small>${session.isDemo?"演示":"暂存"}</small>${escapeHtml(item)}</div>`).join("")||'<p class="form-hint">记录想法、任务、Bug 或未来工作，不打断当前工作。</p>'}</div></aside></div></section>`;
}

function resetAddDialog() { byId("add-form").reset(); byId("manual-name-error").hidden = true; byId("manual-name").classList.remove("input-error"); setAddMode("manual"); }
function openAddDialog(kind) {
  if (kind === "zone" && state.zones.length >= MAX_ZONES) return showToast("当前已有 7 个主任务。建议先完成、归档或合并一个主任务后再新增。");
  ui.addKind = kind; resetAddDialog();
  const isZone = kind === "zone"; byId("add-dialog-title").textContent = isZone ? "追加主任务" : "追加次级项目"; byId("name-field-label").textContent = isZone ? "主任务名称" : "项目名称"; byId("purpose-field-label").textContent = isZone ? "方向说明" : "项目说明"; byId("goal-field-label").textContent = isZone ? "母目标" : "当前目标"; byId("create-submit").textContent = isZone ? "建立主任务" : "建立次级项目"; byId("manual-name").placeholder = isZone ? "例如：工作、个人产品、学习" : "例如：客户反馈整理工具";
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

function openSessionPlan(project){const existing=activeSession(project);if(existing){if(existing.status==="PAUSED"){existing.status="RUNNING";existing.updatedAt=now()}restoreSessionDraftMirror(existing);ui.view="focus";render();return}const plan=window.ProjectOSPlanning.buildSessionPlan(project);byId("session-form").reset();byId("session-goal").value=plan.goal;byId("todo-primary").value=plan.primary;byId("todo-optional-1").value=plan.optional[0]||"";byId("todo-optional-2").value=plan.optional[1]||"";byId("session-blocker-none").checked=true;byId("session-blocker-input-panel").hidden=true;byId("session-dialog").showModal()}
function pauseActiveWork(){const project=currentProject();const session=activeSession(project);if(!session)return;session.notes=byId("session-notes")?.value||session.notes||"";session.status="PAUSED";session.updatedAt=now();writeSessionDraftMirror(session);ui.view="dashboard";render();showToast("本次工作已暂停，草稿和上下文都已保留")}

function assistancePrompt(zone,project,session,problem,criteria){return window.ProjectOSAIWorkflow.buildAssistancePrompt({zone,project,session,problem,criteria,recentSessionSummary:lastEndedSession(project)?.summary||"尚无已结束工作记录"})}
function statusReviewPrompt(zone,project,session,intent="STATUS_REVIEW"){const recentSessions=formalSessions(project).filter(item=>item.endedAt).slice(-3).map(item=>({startedAt:item.startedAt,endedAt:item.endedAt,goal:item.goal,summary:item.summary}));return window.ProjectOSAIWorkflow.buildStatusReviewPrompt({zone,project,session,recentSessions,intent})}
function openStatusReviewDialog(mode="status-review"){const project=currentProject();const session=activeSession(project);if(!project||!session)return showToast("当前没有进行中的工作");currentReviewMode=mode;pendingStatusReview=null;byId("status-review-form").reset();byId("status-review-output").value=statusReviewPrompt(currentZone(),project,session,mode==="work-summary"?"WORK_SUMMARY":"STATUS_REVIEW");byId("status-review-input-panel").hidden=false;byId("status-review-preview-panel").hidden=true;byId("status-review-dialog").showModal()}
function copyCurrentReviewPrompt(){return copyText(byId("status-review-output").value,currentReviewMode==="work-summary"?"总结工作提示词已复制":"现状总结提示词已复制")}
function parseProjectUpdateJson(raw){return window.ProjectOSBootstrap.parseStatusReviewJson(raw)}
function resultData(raw){return window.ProjectOSAIWorkflow.parseAIResult(raw)}
function previewRows(data){const proposals=[[data.resultType==="STATUS_REVIEW"?"当前状态总结":"当前进度总结",data.progressSummary,"progress"],["推荐下一步",data.recommendedNextStep,"next"],["仍在发生的问题",data.activeProblems?.length?data.activeProblems:data.remainingIssues,"problems"],["建议写入记忆",data.memoryUpdates,"memory"]];const details=[["已完成",data.completed],["进度判断",data.progressJudgement],["可选下一步",data.optionalNextSteps],["建议停止 / 推迟",data.shouldStopOrDefer],["变化",data.changes],["验证",data.verification],["新发现",data.discoveries],["新决定",data.decisions]];return `<div class="proposal-grid">${proposals.map(([label,value,kind])=>`<article class="proposal-card proposal-${kind}"><strong>${label}</strong><p>${escapeHtml(text(value)||"—")}</p></article>`).join("")}</div><details class="parsed-details"><summary>查看其他已解析字段</summary>${details.map(([label,value])=>`<div class="preview-row"><strong>${label}</strong><p>${escapeHtml(text(value)||"—")}</p></div>`).join("")}</details>`}
function reviewField({id,label,value="",rows=false,checked=true,note=""}){return`<label class="review-suggestion"><span class="review-suggestion-head"><input id="review-apply-${id}" type="checkbox" ${checked?"checked":""}><strong>${label}</strong><em>AI 建议</em></span>${rows?`<textarea id="review-${id}" placeholder="每行一项">${escapeHtml(text(value))}</textarea>`:`<input id="review-${id}" value="${escapeHtml(text(value))}">`}${note?`<small>${note}</small>`:""}</label>`}
function statusReviewPreviewForm(data){const phaseOptions=[["","待确认"],["IDEA","构想阶段"],["EXPLORATION","探索阶段"],["PROTOTYPE","原型阶段"],["VALIDATION","验证阶段"],["STABILIZATION","稳定化阶段"],["DELIVERY","可交付阶段"],["PAUSED","暂停 / 待重新评估"]];const reason=String(data.progressJudgement||"").replace(/^[^：]+：/,"");return`<div class="review-suggestion-grid">${reviewField({id:"state",label:"当前状态",value:data.currentStateSummary?.[0]||""})}${reviewField({id:"completed",label:"已完成阶段",value:data.completed,rows:true,checked:false,note:"默认不勾选。只有你确认存在完成、验证、通过或交付证据时才写入。"})}${reviewField({id:"in-progress",label:"正在进行",value:data.inProgress,rows:true})}${reviewField({id:"problems",label:"当前问题",value:data.activeProblems,rows:true})}${reviewField({id:"blockers",label:"当前阻塞",value:data.currentBlockers,rows:true})}<label class="review-suggestion"><span class="review-suggestion-head"><input id="review-apply-phase" type="checkbox" checked><strong>当前阶段</strong><em>AI 建议</em></span><select id="review-phase">${phaseOptions.map(([value,label])=>`<option value="${value}" ${data.progressPhase===value?"selected":""}>${label}</option>`).join("")}</select></label>${reviewField({id:"reason",label:"阶段判断原因",value:reason})}${reviewField({id:"next",label:"推荐下一步",value:data.recommendedNextStep})}${reviewField({id:"optional",label:"可选下一步 → 待办池",value:data.optionalNextSteps,rows:true})}${reviewField({id:"defer",label:"建议暂停事项 → 暂存区",value:data.shouldStopOrDefer,rows:true})}${reviewField({id:"memory",label:"建议写入记忆",value:data.memoryUpdates,rows:true})}</div>`}
function collectStatusReviewDraft(){return{currentStateSummary:lines(byId("review-state").value),progressSummary:lines(byId("review-state").value),completed:lines(byId("review-completed").value),inProgress:lines(byId("review-in-progress").value),activeProblems:lines(byId("review-problems").value),currentBlockers:lines(byId("review-blockers").value),progressPhase:byId("review-phase").value,progressJudgement:byId("review-reason").value.trim(),recommendedNextStep:byId("review-next").value.trim(),nextStep:byId("review-next").value.trim(),optionalNextSteps:lines(byId("review-optional").value),shouldStopOrDefer:lines(byId("review-defer").value),memoryUpdates:lines(byId("review-memory").value),resultType:"STATUS_REVIEW",remainingIssues:[],changes:[],verification:[],discoveries:[],decisions:[],raw:pendingStatusReview?.raw||""}}
function statusReviewSelections(){return{state:byId("review-apply-state").checked,completed:byId("review-apply-completed").checked,inProgress:byId("review-apply-in-progress").checked,problems:byId("review-apply-problems").checked,blockers:byId("review-apply-blockers").checked,phase:byId("review-apply-phase").checked,reason:byId("review-apply-reason").checked,next:byId("review-apply-next").checked,optional:byId("review-apply-optional").checked,defer:byId("review-apply-defer").checked,memory:byId("review-apply-memory").checked}}
function statusReviewPatch(project,selections,timestamp){const patch={updatedAt:timestamp,lastWorkedAt:timestamp};if(selections.state){patch.currentState=project.currentState;patch.currentProgressSummary=project.currentProgressSummary}if(selections.completed)patch.completed=project.completed;if(selections.inProgress)patch.inProgress=project.inProgress;if(selections.problems){patch.openIssues=project.openIssues;patch.blockerReviewPending=project.blockerReviewPending}if(selections.blockers){patch.blockers=project.blockers;patch.blockerReviewPending=project.blockerReviewPending}if(selections.phase)patch.currentPhase=project.currentPhase;if(selections.reason)patch.currentProgressSummary=project.currentProgressSummary;if(selections.next)patch.nextActions=project.nextActions;if(selections.optional)patch.backlog=project.backlog;if(selections.defer)patch.parkingLot=project.parkingLot;if(selections.memory)patch.projectMemory=project.projectMemory;return patch}
function importedResultPatch(project,selections,timestamp){const patch={completed:project.completed,decisions:project.decisions,updatedAt:timestamp,lastWorkedAt:timestamp};if(selections.progress){patch.currentState=project.currentState;patch.currentProgressSummary=project.currentProgressSummary;patch.currentPhase=project.currentPhase}if(selections.problems){patch.openIssues=project.openIssues;patch.blockers=project.blockers;patch.blockerReviewPending=project.blockerReviewPending}if(selections.next)patch.nextActions=project.nextActions;if(selections.memory)patch.projectMemory=project.projectMemory;if(selections.backlog)patch.backlog=project.backlog;return patch}
function latestImportedResult(session){return[...(session.importedResults||[])].reverse()[0]}
function fallbackProgressSummary(session){const completed=session.todos.filter(todo=>todo.completed).map(todo=>todo.text);const remaining=session.todos.filter(todo=>!todo.completed).map(todo=>todo.text);const notes=lines(byId("session-notes")?.value||session.notes);return[completed.length?`已完成：${completed.join("；")}`:"本次没有勾选完成项",notes.length?`工作记录：${notes.join("；")}`:"",remaining.length?`仍待处理：${remaining.join("；")}`:"当前计划内事项已收束",session.parkingAdded?.length?`暂存：${session.parkingAdded.join("；")}`:""].filter(Boolean)}
function sessionSummaryRows(project,session){const completed=session.todos.filter(todo=>todo.completed).map(todo=>todo.text);const remaining=session.todos.filter(todo=>!todo.completed).map(todo=>todo.text);const latest=latestImportedResult(session);const progress=latest?.progressSummary?.length?latest.progressSummary:fallbackProgressSummary(session);const recommended=latest?.recommendedNextStep||latest?.nextStep||project.nextActions[0]||remaining[0]||"待确认";const rows=[["本次目标",session.goal],["当前进度总结",progress],["已完成",completed],["未完成",remaining],["验证结果",session.importedResults.flatMap(item=>item.verification||[])],["推荐下一步",recommended],["本次暂存",session.parkingAdded||[]]];return rows.map(([label,value])=>`<div class="preview-row"><strong>${label}</strong><p>${escapeHtml(text(value)||"—")}</p></div>`).join("")}
function localDateTimeInput(value){const date=new Date(value||Date.now());const offset=date.getTimezoneOffset()*60000;return new Date(date.getTime()-offset).toISOString().slice(0,16)}
function refreshEndFocusDuration(){const start=new Date(byId("end-started-at")?.value||0);const end=new Date(byId("end-ended-at")?.value||0);const minutes=Math.round((end-start)/60000);byId("end-focus-duration").textContent=Number.isFinite(minutes)&&minutes>=0?`${minutes} 分钟`:"时间范围无效"}
function prepareEndTimeFields(session){byId("end-started-at").value=localDateTimeInput(session.startedAt);byId("end-ended-at").value=localDateTimeInput(now());byId("end-time-confirmed").checked=false;byId("end-time-error").hidden=true;refreshEndFocusDuration()}
function confirmedEndTimeValues(){if(!byId("end-time-confirmed").checked){byId("end-time-error").textContent="请核对并确认本次工作的开始和结束时间。";byId("end-time-error").hidden=false;return null}const startedAt=new Date(byId("end-started-at").value).toISOString();const endedAt=new Date(byId("end-ended-at").value).toISOString();const focusMinutes=Math.round((timestampOf(endedAt)-timestampOf(startedAt))/60000);if(!Number.isFinite(focusMinutes)||focusMinutes<0){byId("end-time-error").textContent="结束时间不能早于开始时间。";byId("end-time-error").hidden=false;return null}byId("end-time-error").hidden=true;return{startedAt,endedAt,focusMinutes}}
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
  project.inProgress=window.ProjectOSBootstrap.dedupeList(project.inProgress);project.openIssues=window.ProjectOSBootstrap.dedupeList(project.openIssues);project.nextActions=window.ProjectOSBootstrap.dedupeList(project.nextActions);session.todos=window.ProjectOSBootstrap.dedupeTodos(session.todos);
  session.updatedAt=timestamp;project.updatedAt=timestamp;project.lastWorkedAt=timestamp;zone.summary=project.currentState;zone.updatedAt=timestamp;
}
function applyStatusReviewDraft(zone,project,session,draft,selections,timestamp){
  if(selections.state&&draft.currentStateSummary[0]){trackCurrentState(project,session,draft.currentStateSummary[0]);trackProgressSummary(project,session,draft.currentStateSummary[0])}
  if(selections.completed)trackProjectValues(project,session,"completed",draft.completed);
  if(selections.inProgress)project.inProgress=window.ProjectOSBootstrap.dedupeList(draft.inProgress);
  if(selections.problems){project.openIssues=window.ProjectOSBootstrap.dedupeList(draft.activeProblems);project.blockerReviewPending=project.openIssues.length>0&&!currentBlockers(project).length}
  if(selections.blockers)replaceOpenBlockers(project,draft.currentBlockers,timestamp,"ai-confirmed");
  if(selections.phase)project.currentPhase=window.ProjectOSBootstrap.normalizePhase(draft.progressPhase);
  if(selections.reason)project.currentProgressSummary=draft.progressJudgement||project.currentProgressSummary;
  if(selections.next&&draft.recommendedNextStep)project.nextActions=window.ProjectOSBootstrap.dedupeList([draft.recommendedNextStep,...project.nextActions.filter(item=>!window.ProjectOSPlanning.isHighlySimilar(item,draft.recommendedNextStep))]);
  if(selections.optional)project.backlog=window.ProjectOSBootstrap.dedupeList([...project.backlog,...draft.optionalNextSteps]);
  if(selections.defer)project.parkingLot=window.ProjectOSBootstrap.dedupeList([...project.parkingLot,...draft.shouldStopOrDefer]);
  if(selections.memory&&draft.memoryUpdates.length)project.projectMemory.push(...asMemoryList(draft.memoryUpdates).map(memory=>({...memory,sourceSessionId:session.id,source:"ai-confirmed"})));
  session.updatedAt=timestamp;project.updatedAt=timestamp;project.lastWorkedAt=timestamp;zone.summary=project.currentState;zone.updatedAt=timestamp;
}
function prepareSessionEnd(session,discoveries,nextStep){const timestamp=now();session.endedAt=timestamp;session.status="ENDED";session.updatedAt=timestamp;session.completed=session.todos.filter(todo=>todo.completed).map(todo=>todo.text);session.remainingIssues=session.todos.filter(todo=>!todo.completed).map(todo=>todo.text);session.discoveries.push(...lines(discoveries).filter(item=>!session.discoveries.includes(item)));session.nextStep=nextStep.trim();session.notes=byId("session-notes")?.value||session.notes||"";const latest=latestImportedResult(session);session.progressSummary=latest?.progressSummary?.length?latest.progressSummary:fallbackProgressSummary(session);session.summary=`进度总结：${session.progressSummary.join("；")||"未记录"}\n完成：${session.completed.join("；")||"无"}\n未完成：${session.remainingIssues.join("；")||"无"}\n下一步：${session.nextStep||"待定"}`;return timestamp}
function commitSessionEndToProject(zone,project,session,timestamp){trackProjectValues(project,session,"completed",session.completed);trackProjectValues(project,session,"openIssues",session.remainingIssues,{prepend:true});trackProjectValues(project,session,"nextActions",[session.nextStep,...session.remainingIssues].filter(Boolean),{prepend:true});project.inProgress=[];const latest=latestImportedResult(session);if(!latest?.progressSummary?.length&&session.progressSummary?.length)trackCurrentState(project,session,session.progressSummary.join("；"));project.updatedAt=timestamp;project.lastWorkedAt=timestamp;zone.summary=project.currentState;zone.updatedAt=timestamp}
function finishStatusReviewUpdate(message="已按确认项更新项目"){pendingStatusReview=null;closeDialog("status-review-dialog");render();showToast(message)}
function finishEndedSession(message){closeDialog("end-dialog");ui.view="project";ui.detailTab="history";render();showToast(message)}
function formalValuesFromSessions(sessions,field){const values=[];sessions.filter(countsAsFormal).forEach(session=>{values.push(...asList(session.formalContributions?.[field]));if(field==="completed"&&!session.formalContributions?.completed?.length)values.push(...asList(session.completed));if(field==="nextActions"&&!session.formalContributions?.nextActions?.length)values.push(...[session.nextStep,...asList(session.remainingIssues)].filter(Boolean));if(field==="openIssues"&&!session.formalContributions?.openIssues?.length)values.push(...asList(session.remainingIssues))});return new Set(values)}
function recomputeAfterSessionDeletion(zone,project,removed,{preserveFormalized=false,preserveCurrentState=false}={}){const remainingFormal=formalSessions(project);if(!preserveFormalized){[["completed","completed"],["nextActions","nextActions"],["openIssues","openIssues"]].forEach(([projectField,contributionField])=>{const protectedValues=formalValuesFromSessions(remainingFormal,contributionField);const removedValues=formalValuesFromSessions(removed,contributionField);project[projectField]=project[projectField].filter(value=>!removedValues.has(value)||protectedValues.has(value))});if(!preserveCurrentState)[...removed].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).forEach(session=>{const contribution=session.formalContributions||{};if(contribution.currentStateAfter&&project.currentState===contribution.currentStateAfter)project.currentState=contribution.currentStateBefore||project.currentState;if(contribution.progressSummaryAfter&&project.currentProgressSummary===contribution.progressSummaryAfter)project.currentProgressSummary=contribution.progressSummaryBefore||""})}const activeFormal=[...remainingFormal].reverse().find(session=>!session.endedAt);project.inProgress=activeFormal?activeFormal.todos.filter(todo=>!todo.completed).map(todo=>todo.text):[];const last=[...remainingFormal].reverse().find(session=>session.endedAt);project.lastWorkedAt=last?.endedAt||null;const timestamps=[project.nonSessionUpdatedAt||project.createdAt,...remainingFormal.map(session=>session.updatedAt||session.endedAt||session.startedAt)].filter(Boolean).map(value=>new Date(value).getTime()).filter(Number.isFinite);project.updatedAt=new Date(Math.max(...timestamps,new Date(project.createdAt).getTime())).toISOString();zone.summary=project.currentState;const zoneTimes=[zone.createdAt,...zone.projects.map(item=>item.updatedAt)].map(value=>new Date(value).getTime()).filter(Number.isFinite);zone.updatedAt=new Date(Math.max(...zoneTimes)).toISOString()}
function deleteProjectSessions(zone,project,sessionIds,{clearMemory=false,preserveFormalized=false,preserveCurrentState=false}={}){const ids=new Set(sessionIds);const removed=project.sessions.filter(session=>ids.has(session.id));project.sessions=project.sessions.filter(session=>!ids.has(session.id));if(clearMemory)project.projectMemory=[];(state.activityEvents||[]).forEach(event=>{if(event.projectId===project.id&&event.metadata?.effect?.type==="work_log"&&ids.has(event.metadata.effect.sessionId)){event.status=AUTO_SYNC.EVENT_STATUS.REJECTED;event.rejectionReason="对应工作记录已由用户删除";event.rejectedAt=now()}});recomputeAfterSessionDeletion(zone,project,removed,{preserveFormalized,preserveCurrentState});AUTO_SYNC.recalculateProjectState(state,project.id);zone.summary=project.currentState;return removed.length}
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
function openTaskEdit(kind,id){const found=findTask(kind,id);if(!found)return showToast("任务不存在或已被删除");pendingTaskAction={kind,id,command:"EDIT"};const task=found.task;byId("task-edit-eyebrow").textContent=kind==="zone"?"主任务设置":"项目设置";byId("task-edit-title").textContent=`编辑「${task.name}」`;byId("task-edit-name").value=task.name;byId("task-edit-purpose").value=task.purpose||"";byId("task-edit-goal-label").textContent=kind==="zone"?"母目标":"当前目标";byId("task-edit-goal").value=kind==="zone"?task.motherGoal||"":task.goal||"";byId("project-source-settings").hidden=kind!=="project";byId("task-edit-source-paths").value=kind==="project"?text(task.sourcePaths):"";byId("task-edit-routing-keywords").value=kind==="project"?(task.routingKeywords||[]).join(", "):"";byId("task-edit-dialog").showModal()}
const STATE_ACTIONS={PAUSE:{status:TASK_STATUS.PAUSED,title:"暂停任务",message:"暂停后，该任务仍会保留全部记忆、工作历史和下一步，但暂时不会作为优先推进项目。",confirm:"确认暂停"},FREEZE:{status:TASK_STATUS.FROZEN,title:"冻结任务",message:"冻结适合暂时不准备继续推进的长期任务。所有进度、记忆和工作历史都会完整保存，但不会参与日常推荐和活跃统计。",confirm:"确认冻结"},COMPLETE:{status:TASK_STATUS.COMPLETED,title:"标记完成",message:"标记完成后会完整保留任务存档，并退出日常推荐。需要再次推进时可以重新开启。",confirm:"标记完成"},REOPEN:{status:TASK_STATUS.ACTIVE,title:"重新开启",message:"将恢复为进行中任务，保留原有记忆、全部工作历史、关键决策和推荐下一步，不会创建新的空任务。",confirm:"重新开启"}};
function openTaskStateChange(kind,id,command){const found=findTask(kind,id);const config=STATE_ACTIONS[command];if(!found||!config)return;pendingTaskAction={kind,id,command};byId("task-state-title").textContent=`${config.title}「${found.task.name}」`;byId("task-state-message").innerHTML=`<strong>${config.message}</strong><p>项目生命周期与本次工作状态相互独立，当前工作记录不会被删除。</p>`;byId("confirm-task-state").textContent=config.confirm;byId("task-state-dialog").showModal()}
function openTaskDelete(kind,id){const found=findTask(kind,id);if(!found)return showToast("任务不存在或已被删除");pendingTaskAction={kind,id,command:"DELETE"};const task=found.task;const isZone=kind==="zone";const projects=isZone?task.projects:[];const links=linkedFor(found.zone.id);byId("task-delete-title").textContent=`永久删除「${task.name}」`;byId("task-delete-message").innerHTML=isZone?`<strong>删除主任务将级联删除其下全部 ${projects.length} 个次级项目。</strong>项目记忆、工作历史、AI Prompt、AI 返回结果、待办池、暂存区、资产与决策都会立即永久删除。`:`<strong>确定永久删除「${escapeHtml(task.name)}」吗？</strong>将同时删除项目记忆、工作历史、AI Prompt、AI 返回结果、待办池、暂存区、资产与决策。删除后无法恢复。`;byId("task-delete-children").hidden=!projects.length;byId("task-delete-children").innerHTML=projects.length?`<strong>将被级联删除的次级项目</strong><ul>${projects.map(project=>`<li>${escapeHtml(project.name)}</li>`).join("")}</ul>`:"";byId("task-delete-links").hidden=!links.length;byId("task-delete-links").innerHTML=links.length?(isZone?`该任务与 ${links.length} 个其他主任务存在关联。删除后相关 ZoneLink 会移除；已确认历史事件会保留并标记“来源任务已删除”。`:`该项目所在主任务与 ${links.length} 个其他主任务存在关联。删除后该项目产生的实时引用会移除；主任务间 Link 仍保留。`):"";byId("task-delete-name-confirm").value="";byId("task-delete-name-confirm").placeholder=task.name;byId("confirm-task-delete").disabled=true;byId("task-delete-dialog").showModal()}
function executeTaskDelete(){if(!pendingTaskAction)return;const found=findTask(pendingTaskAction.kind,pendingTaskAction.id);if(!found)return closeDialog("task-delete-dialog");const {kind}=pendingTaskAction;const name=found.task.name;if(kind==="project"){state.contextEvents=window.ProjectOSLifecycle.reconcileDeletedTaskEvents(state.contextEvents,{projectIds:[found.project.id],zoneId:null,zoneName:found.zone.name});found.zone.projects=found.zone.projects.filter(project=>project.id!==found.project.id);const recent=recentProject(found.zone);found.zone.summary=recent?.currentState||"等待建立次级项目";found.zone.updatedAt=now();ui.view="zone";ui.zoneId=found.zone.id;ui.projectId=null}else{const projectIds=found.zone.projects.map(project=>project.id);state.contextEvents=window.ProjectOSLifecycle.reconcileDeletedTaskEvents(state.contextEvents,{projectIds,zoneId:found.zone.id,zoneName:found.zone.name});state.zoneLinks=state.zoneLinks.filter(link=>link.sourceZoneId!==found.zone.id&&link.targetZoneId!==found.zone.id);state.zones=state.zones.filter(zone=>zone.id!==found.zone.id);ui.view="dashboard";ui.zoneId=null;ui.projectId=null}pendingTaskAction=null;closeDialog("task-delete-dialog");render();showToast(`已永久删除${kind==="zone"?"主任务":"次级项目"}「${name}」`)}
function handleTaskCommand(kind,id,command){const found=findTask(kind,id);if(!found)return showToast("任务不存在或已被删除");const allowed=window.ProjectOSLifecycle.taskMenuActions(found.task);if(!allowed.includes(command)&&command!=="REOPEN")return showToast("当前状态不能执行这个操作");closeTaskMenus();if(command==="EDIT")return openTaskEdit(kind,id);if(command==="DELETE")return openTaskDelete(kind,id);if(command==="VIEW"){ui.zoneId=found.zone.id;ui.projectId=kind==="project"?found.project.id:null;ui.view=kind==="project"?"project":"zone";return render()}openTaskStateChange(kind,id,command)}
function activeToast(){const dialog=topOpenDialog();if(!dialog)return byId("toast");let toast=dialog.querySelector(":scope>.dialog-toast");if(!toast){toast=document.createElement("div");toast.className="toast dialog-toast";toast.setAttribute("role","status");dialog.appendChild(toast)}return toast}
function showToast(message){const toast=activeToast();toast.textContent=message;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),2000)}
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

function handleGoalSuggestionAction(control){
  const action=control?.dataset?.action;
  if(!["reject-goal-suggestion","defer-goal-suggestion","accept-goal-suggestion"].includes(action))return false;
  if(action==="reject-goal-suggestion"){
    const suggestion=AUTO_SYNC.setGoalSuggestionStatus(state,control.dataset.goalSuggestionId,AUTO_SYNC.GOAL_SUGGESTION_STATUS.REJECTED,{reviewedAt:now()});
    if(suggestion)refreshAfterGoalSuggestion("已保持原目标；相同 Evidence 不会再次弹出");
    return true;
  }
  if(action==="defer-goal-suggestion"){
    const suggestion=AUTO_SYNC.setGoalSuggestionStatus(state,control.dataset.goalSuggestionId,AUTO_SYNC.GOAL_SUGGESTION_STATUS.DEFERRED,{reviewedAt:now()});
    if(suggestion)refreshAfterGoalSuggestion("目标建议已稍后处理，当前目标未改变");
    return true;
  }
  const card=control.closest("[data-goal-suggestion-id]");
  const suggestion=(state.goalSuggestions||[]).find(item=>item.id===control.dataset.goalSuggestionId);
  const edited=control.dataset.acceptMode==="edited";
  const goal=edited?card?.querySelector("[data-goal-suggestion-edit]")?.value.trim():suggestion?.suggestedGoal;
  if(!goal){showToast("建议目标不能为空");return true}
  const goalEvent=AUTO_SYNC.acceptGoalSuggestion(state,control.dataset.goalSuggestionId,{goal,edited,acceptedAt:now()});
  if(goalEvent)refreshAfterGoalSuggestion("新目标已确认，并写入证据时间线");
  else showToast("目标没有变化，未写入");
  return true;
}

app.addEventListener("submit",event=>{
  const form=event.target.closest("[data-inspiration-form]");if(!form)return;
  event.preventDefault();const input=form.querySelector("input");const value=input?.value.trim();if(!value)return;
  const before=state.inspirations.length;const item=addInspiration(value);if(!item)return;
  persistDashboardInspirationDraft("");ui.inspirationOpen=true;ui.inspirationSelectedId=item.id;render();showToast(before===state.inspirations.length?"这条灵感已经在库中":"已加入灵感库，不会变成待办事项");
});

app.addEventListener("click",event=>{const control=event.target.closest("[data-action]");if(!control)return;const action=control.dataset.action;
  if(action==="run-auto-sync"){runAutoSync();return}
  if(action==="review-sync"){openAutoSyncReview();return}
  if(action==="view-sync-run"){renderSyncRunDetail();byId("sync-run-dialog").showModal();return}
  if(handleGoalSuggestionAction(control))return;
  if(action==="open-project-source-settings"){openTaskEdit("project",control.dataset.projectId);return}
  if(action==="open-first-source-settings"){const first=state.zones.flatMap(zone=>zone.projects.map(project=>({zone,project})))[0];if(!first)return showToast("请先建立一个次级项目");openTaskEdit("project",first.project.id);return}
  if(action==="undo-activity-event"){const eventId=control.dataset.eventId;if(AUTO_SYNC.rejectEvent(state,eventId,{rejectedAt:now()})){render();showToast("事件已撤销，项目状态已重新计算")}return}
  if(action==="reroute-activity-event"){const eventId=control.dataset.eventId;if(AUTO_SYNC.reopenEventForReview(state,eventId,{reopenedAt:now()})){render();openAutoSyncReview()}return}
  if(action==="add-zone")openAddDialog("zone"); if(action==="add-project")openAddDialog("project");
  if(action==="load-demo-sample"&&workspaceMode===WORKSPACE_MODES.DEMO){state=demoSampleState(state.skills);render();showToast("示例演示数据已载入")}
  if(action==="toggle-inspiration-library"){ui.inspirationOpen=!ui.inspirationOpen;if(!ui.inspirationOpen)ui.inspirationSelectedId=null;render();return}
  if(action==="select-inspiration"){const id=control.dataset.inspirationId;ui.inspirationSelectedId=ui.inspirationSelectedId===id?null:id;render();return}
  if(action==="set-inspiration-orb"){const item=state.inspirations.find(entry=>entry.id===control.dataset.inspirationId);const presetId=control.dataset.orbPreset;if(!item||!INSPIRATION_ORB_PRESETS.includes(presetId))return;item.orbPresetId=presetId;item.updatedAt=now();render();showToast("已更换这条灵感绑定的 AI 球");return}
  if(action==="dashboard-stat"){ui.dashboardStat=control.dataset.stat;render();setTimeout(()=>{const panel=byId("dashboard-stat-detail");panel?.focus({preventScroll:true});panel?.scrollIntoView({behavior:"smooth",block:"start"})},20);return}
  if(action==="close-dashboard-stat"){ui.dashboardStat=null;render();return}
  if(action==="toggle-task-menu"){event.stopPropagation();const menu=control.nextElementSibling;const willOpen=menu.hidden;closeTaskMenus(menu);menu.hidden=!willOpen;return}
  if(action==="task-command"){event.stopPropagation();handleTaskCommand(control.dataset.taskKind,control.dataset.taskId,control.dataset.command);return}
  if(action==="dashboard"){ui.view="dashboard";ui.zoneId=null;ui.projectId=null;render()} if(action==="open-zone"){ui.view="zone";ui.zoneId=control.dataset.zoneId;ui.projectId=null;ui.showAllProjects=false;ui.showArchivedProjects=false;render()} if(action==="back-zone"){ui.view="zone";ui.projectId=null;render()} if(action==="open-project"){ui.view="project";if(control.dataset.zoneId)ui.zoneId=control.dataset.zoneId;ui.projectId=control.dataset.projectId;ui.detailTab="memory";render()} if(action==="back-project"){ui.view="project";render()}
  if(action==="edit-project-state")openProjectStateEdit(control.dataset.editField||"");
  if(action==="toggle-other"){ui.showOtherZones=!ui.showOtherZones;render()} if(action==="toggle-archived-zones"){ui.showArchivedZones=!ui.showArchivedZones;render()} if(action==="toggle-archived-projects"){ui.showArchivedProjects=!ui.showArchivedProjects;render()} if(action==="toggle-projects"){ui.showAllProjects=!ui.showAllProjects;render()} if(action==="detail-tab"){ui.detailTab=control.dataset.tab;if(ui.detailTab!=="history"){ui.historyManage=false;ui.selectedHistoryIds=[]}render()} if(action==="continue-work"){if(!isActiveTask(currentZone())||!isActiveTask(currentProject()))return showToast("请先重新开启任务");openSessionPlan(currentProject())} if(action==="manage-links")openLinkDialog(); if(action==="manage-project-skills")openProjectSkillsDialog();
  if(action==="toggle-keep-empty"){const project=currentProject();const timestamp=now();project.keepWhenEmpty=control.checked;project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;render();showToast(project.keepWhenEmpty?"已设置：空项目也会保留":"已取消空项目保留标记")}
  if(action==="set-issue-status"){
    const project=currentProject();const status=control.dataset.issueStatus;const index=Number(control.dataset.issueIndex);const timestamp=now();
    project.resolvedIssues=project.resolvedIssues||[];
    if(status==="resolved"){
      const [issue]=project.openIssues.splice(index,1);if(!issue)return;
      project.resolvedIssues=window.ProjectOSBootstrap.dedupeList([...project.resolvedIssues,issue]);
    }else{
      const [issue]=project.resolvedIssues.splice(index,1);if(!issue)return;
      project.openIssues=window.ProjectOSBootstrap.dedupeList([issue,...project.openIssues]);
    }
    project.blockerReviewPending=project.openIssues.length>0&&!currentBlockers(project).length;project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;
    AUTO_SYNC.recordProjectChange(state,project.id,{eventType:"issue_status_change",sourceType:"project_os",sourceId:`issue_status:${project.id}:${timestamp}`,changedAt:timestamp,summary:status==="resolved"?"用户将问题标记为已解决":"用户恢复了一个当前问题",reason:"用户直接纠正问题状态",patch:{openIssues:project.openIssues,resolvedIssues:project.resolvedIssues,blockerReviewPending:project.blockerReviewPending,nonSessionUpdatedAt:timestamp}});
    render();showToast(status==="resolved"?"已标记完成，可点击 ✓ 恢复":"问题已恢复为待处理");return;
  }
  if(action==="delete-issue"){
    const project=currentProject();const status=control.dataset.issueStatus;const index=Number(control.dataset.issueIndex);const timestamp=now();const source=status==="resolved"?(project.resolvedIssues||[]):project.openIssues;const [issue]=source.splice(index,1);if(!issue)return;
    project.blockerReviewPending=project.openIssues.length>0&&!currentBlockers(project).length;project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;
    AUTO_SYNC.recordProjectChange(state,project.id,{eventType:"issue_deleted",sourceType:"project_os",sourceId:`issue_delete:${project.id}:${timestamp}`,changedAt:timestamp,summary:"用户删除了一条项目问题",reason:"用户确认该问题不应保留",patch:{openIssues:project.openIssues,resolvedIssues:project.resolvedIssues,blockerReviewPending:project.blockerReviewPending,nonSessionUpdatedAt:timestamp}});
    render();showToast("问题已删除");return;
  }
  if(action==="record-blocker"){byId("blocker-form").reset();byId("blocker-dialog").showModal();setTimeout(()=>byId("blocker-text").focus(),40)}
  if(action==="delete-blocker"){
    const project=currentProject();const timestamp=now();const before=project.blockers.length;project.blockers=project.blockers.filter(item=>item.id!==control.dataset.blockerId);if(project.blockers.length===before)return;
    project.blockerReviewPending=project.openIssues.length>0&&!currentBlockers(project).length;project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;
    AUTO_SYNC.recordProjectChange(state,project.id,{eventType:"blocker_deleted",sourceType:"project_os",sourceId:`blocker_delete:${project.id}:${timestamp}`,changedAt:timestamp,summary:"用户删除了一条项目阻塞",reason:"用户确认该阻塞不应保留",patch:{blockers:project.blockers,blockerReviewPending:project.blockerReviewPending,nonSessionUpdatedAt:timestamp}});
    render();showToast("阻塞已删除");return;
  }
  if(action==="set-blocker-status"){
    const project=currentProject();const blocker=project.blockers.find(item=>item.id===control.dataset.blockerId);const status=control.dataset.blockerStatus;
    if(blocker&&Object.values(BLOCKER_STATUS).includes(status)){
      const timestamp=now();blocker.status=status;blocker.updatedAt=timestamp;blocker.resolvedAt=status===BLOCKER_STATUS.RESOLVED?timestamp:null;blocker.deferredAt=status===BLOCKER_STATUS.DEFERRED?timestamp:null;
      if(status!==BLOCKER_STATUS.OPEN){project.nextActions=project.nextActions.filter(item=>!item.includes(blocker.text));const session=activeSession(project);if(status===BLOCKER_STATUS.RESOLVED&&session)session.todos.filter(todo=>todo.text.includes(blocker.text)).forEach(todo=>{todo.completed=true;todo.updatedAt=timestamp});project.inProgress=(session?.todos||[]).filter(todo=>!todo.completed).map(todo=>todo.text)}
      project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;AUTO_SYNC.recordProjectChange(state,project.id,{eventType:"blocker_status_change",sourceType:"project_os",sourceId:`blocker_status:${blocker.id}:${timestamp}`,changedAt:timestamp,summary:status===BLOCKER_STATUS.RESOLVED?"用户将阻塞标记为已解决":status===BLOCKER_STATUS.DEFERRED?"用户将阻塞移到稍后处理":"用户重新打开了阻塞",reason:"用户直接纠正阻塞状态",patch:{blockers:project.blockers,nextActions:project.nextActions,inProgress:project.inProgress,nonSessionUpdatedAt:timestamp}});render();showToast(status===BLOCKER_STATUS.RESOLVED?"问题已标记解决":status===BLOCKER_STATUS.DEFERRED?"问题已移到稍后处理":"问题已重新打开");
    }
  }
  if(action==="toggle-todo"){const project=currentProject();const session=activeSession(project);const todo=session.todos.find(item=>item.id===control.dataset.todoId);const timestamp=now();todo.completed=!todo.completed;todo.updatedAt=timestamp;session.updatedAt=timestamp;if(!session.isDemo)project.updatedAt=timestamp;writeSessionDraftMirror(session);render()}
  if(action==="add-parking"){const input=byId("parking-input");const value=input.value.trim();if(value){const project=currentProject();const session=activeSession(project);const timestamp=now();if(!session.isDemo)project.parkingLot.push(value);session.parkingAdded.push(value);session.updatedAt=timestamp;if(!session.isDemo)project.updatedAt=timestamp;writeSessionDraftMirror(session);render();showToast(session.isDemo?"已放入演示暂存，不影响正式项目":"已放入暂存区，不打断当前工作")}}
  if(action==="stuck"){byId("stuck-form").reset();byId("stuck-input-panel").hidden=false;byId("stuck-output-panel").hidden=true;byId("stuck-dialog").showModal()} if(action==="status-review")openStatusReviewDialog("status-review");if(action==="summarize-work")openStatusReviewDialog("work-summary");if(action==="pause-session")pauseActiveWork();if(action==="import-result"){byId("result-form").reset();byId("result-input-panel").hidden=false;byId("result-preview-panel").hidden=true;byId("result-dialog").showModal()} if(action==="end-session"){const project=currentProject();const session=activeSession(project);const latest=latestImportedResult(session);byId("end-summary").innerHTML=sessionSummaryRows(project,session);byId("end-discoveries").value="";byId("end-next-step").value=latest?.recommendedNextStep||latest?.nextStep||project.nextActions[0]||session.todos.find(todo=>!todo.completed)?.text||"";prepareEndTimeFields(session);byId("formal-end-actions").hidden=session.isDemo;byId("demo-end-actions").hidden=!session.isDemo;byId("end-dialog").showModal()}
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
document.querySelectorAll("dialog").forEach(dialog=>{dialog.setAttribute("closedby","none");dialog.addEventListener("close",()=>resetDialog(dialog));dialog.addEventListener("cancel",event=>event.preventDefault());dialog.addEventListener("click",event=>{if(event.target===dialog){event.preventDefault();event.stopPropagation()}})});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&topOpenDialog()){event.preventDefault();event.stopPropagation()}},true);
byId("home-button").addEventListener("click",()=>{ui.view="dashboard";ui.zoneId=null;ui.projectId=null;render()});
byId("auto-sync-button").addEventListener("click",()=>runAutoSync());
byId("tools-button").addEventListener("click",()=>{renderSkillLibrary();byId("tools-dialog").showModal()});
byId("demo-mode-button").addEventListener("click",async()=>{if(workspaceMode===WORKSPACE_MODES.DEMO){await switchWorkspace(WORKSPACE_MODES.NORMAL);showToast("已退出演示模式，正式项目保持原样")}else byId("enter-demo-dialog").showModal()});
byId("confirm-enter-demo").addEventListener("click",async()=>{closeDialog("enter-demo-dialog");await switchWorkspace(WORKSPACE_MODES.DEMO);showToast("已进入独立演示环境")});
byId("reset-demo-button").addEventListener("click",()=>byId("reset-demo-dialog").showModal());
byId("confirm-reset-demo").addEventListener("click",async()=>{if(workspaceMode!==WORKSPACE_MODES.DEMO)return closeDialog("reset-demo-dialog");sessionDraftStore.clearWorkspace(workspaceMode);state=demoInitialState(state.skills);resetUi();await save();closeDialog("reset-demo-dialog");render();showToast("演示数据已重置，正式项目未改变")});
byId("accept-all-sync-events").addEventListener("click",()=>{document.querySelectorAll("[data-sync-event-id]").forEach(card=>{const select=card.querySelector("[data-sync-project]");if(select.value&&select.value!=="__ignore__")card.querySelector("[data-sync-accept]").checked=true})});
byId("auto-sync-review-form").addEventListener("submit",event=>{event.preventDefault();confirmAutoSyncReview()});
byId("auto-sync-review-list").addEventListener("change",event=>{if(!event.target.matches("[data-sync-project]"))return;const card=event.target.closest("[data-sync-event-id]");card.querySelector("[data-sync-accept]").checked=Boolean(event.target.value&&event.target.value!=="__ignore__")});
byId("auto-sync-goal-suggestions").addEventListener("click",event=>{const control=event.target.closest("[data-action]");if(!control)return;if(handleGoalSuggestionAction(control)){event.preventDefault();event.stopPropagation()}});
document.addEventListener("click",event=>{
  if(!event.target.closest(".task-menu"))closeTaskMenus();
  const filter=event.target.closest("[data-skill-filter]");
  if(filter){ui.skillFilter=filter.dataset.skillFilter;renderSkillLibrary();save();return;}
  const action=event.target.closest("[data-action-global]")?.dataset.actionGlobal;
  if(action==="add-skill")openSkillDialog();
});

byId("add-form").addEventListener("submit",event=>{event.preventDefault();if(byId("manual-mode").hidden)return;const name=byId("manual-name").value.trim();if(!name){byId("manual-name-error").hidden=false;byId("manual-name").classList.add("input-error");byId("manual-name").focus();return}byId("manual-name-error").hidden=true;byId("manual-name").classList.remove("input-error");const purpose=byId("manual-purpose").value.trim();const goal=byId("manual-goal").value.trim();if(ui.addKind==="zone"){const zone=createZone({name,purpose,motherGoal:goal,summary:"刚刚建立，等待推进。",color:COLORS[state.zones.length%COLORS.length]});state.zones.push(zone);closeDialog("add-dialog");ui.view="zone";ui.zoneId=zone.id;render();showToast("主任务已建立")}else{const zone=currentZone();const project=createProject({name,purpose,goal,nextActions:[],color:zone.color},zone.id);addProjectOriginHistory(project,"manual");zone.projects.push(project);zone.updatedAt=now();AUTO_SYNC.recordProjectSnapshot(state,project.id,{eventType:"project_state_baseline",sourceType:"project_os",sourceId:`project_state_baseline:${project.id}:v3`,detectedAt:now(),summary:"项目建立时的初始状态"});closeDialog("add-dialog");ui.view="project";ui.projectId=project.id;render();showToast("次级项目已建立，工作历史 No.1 已保存")}});
byId("manual-name").addEventListener("input",()=>{if(byId("manual-name").value.trim()){byId("manual-name-error").hidden=true;byId("manual-name").classList.remove("input-error")}});
byId("project-state-edit-form").addEventListener("submit",event=>{event.preventDefault();const project=currentProject();if(!project)return closeDialog("project-state-edit-dialog");const timestamp=now();const previousNext=project.nextActions[0]||"";project.purpose=byId("edit-project-purpose").value.trim();project.goal=byId("edit-project-goal").value.trim();project.currentState=byId("edit-project-state").value.trim()||"尚未记录";project.currentPhase=window.ProjectOSBootstrap.normalizePhase(byId("edit-project-phase").value);project.completed=window.ProjectOSBootstrap.dedupeList(lines(byId("edit-project-completed").value));project.importedMilestones=[];project.openIssues=window.ProjectOSBootstrap.dedupeList(lines(byId("edit-project-issues").value));replaceOpenBlockers(project,lines(byId("edit-project-blockers").value),timestamp,"manual");const recommended=byId("edit-project-next").value.trim();project.nextActions=recommended?window.ProjectOSBootstrap.dedupeList([recommended,...project.nextActions.filter(item=>item!==previousNext)]):project.nextActions.filter(item=>item!==previousNext);project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().summary=project.currentState;currentZone().updatedAt=timestamp;AUTO_SYNC.recordProjectChange(state,project.id,{eventType:"manual_state_correction",sourceType:"manual",sourceId:`manual_state:${project.id}:${timestamp}`,changedAt:timestamp,summary:"用户人工确认项目现状",reason:"用户在项目状态编辑器中主动修正",patch:{purpose:project.purpose,goal:project.goal,currentState:project.currentState,currentPhase:project.currentPhase,completed:project.completed,importedMilestones:project.importedMilestones,openIssues:project.openIssues,blockers:project.blockers,blockerReviewPending:project.blockerReviewPending,nextActions:project.nextActions,nonSessionUpdatedAt:timestamp}});closeDialog("project-state-edit-dialog");render();showToast("人工确认的项目现状已保存")});
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
  else{const zone=currentZone();const project=createProject(data,zone.id);addProjectOriginHistory(project,"ai",data.bootstrapJson);zone.projects.push(project);zone.summary=project.currentState;zone.updatedAt=now();AUTO_SYNC.recordProjectSnapshot(state,project.id,{eventType:"project_state_baseline",sourceType:"manual",sourceId:`project_state_baseline:${project.id}:v3`,detectedAt:now(),summary:"手动补充记录导入的项目初始状态"});closeDialog("preview-dialog");ui.view="project";ui.projectId=project.id;render();showToast("项目记忆、当前现状与工作历史 No.1 已导入")}
});

byId("task-edit-form").addEventListener("submit",event=>{event.preventDefault();if(!pendingTaskAction)return;const found=findTask(pendingTaskAction.kind,pendingTaskAction.id);if(!found)return closeDialog("task-edit-dialog");const name=byId("task-edit-name").value.trim();if(!name)return showInlineError(byId("task-edit-name"),"请输入任务名称");const timestamp=now();found.task.name=name;found.task.purpose=byId("task-edit-purpose").value.trim();if(pendingTaskAction.kind==="zone")found.task.motherGoal=byId("task-edit-goal").value.trim();else{found.task.goal=byId("task-edit-goal").value.trim();const nextSourcePaths=[...new Set(lines(byId("task-edit-source-paths").value))];const sourceUpdate=AUTO_SYNC.reconcileProjectSources(found.task,nextSourcePaths,timestamp);found.task.routingKeywords=[...new Set(byId("task-edit-routing-keywords").value.split(/[,，]/).map(item=>item.trim()).filter(Boolean))];found.task.nonSessionUpdatedAt=timestamp;found.zone.updatedAt=timestamp;AUTO_SYNC.recordProjectChange(state,found.task.id,{eventType:"project_settings_change",sourceType:"project_os",sourceId:`project_settings:${found.task.id}:${timestamp}`,changedAt:timestamp,summary:sourceUpdate.moved.length?"用户更新了项目目录，保留稳定来源映射":"用户更新了项目设置与 Auto Sync 数据源",reason:sourceUpdate.moved.length?"文件移动或目录重命名后的路径修正":"项目设置修改",patch:{name:found.task.name,purpose:found.task.purpose,goal:found.task.goal,sourcePaths:found.task.sourcePaths,sourceBindings:found.task.sourceBindings,routingKeywords:found.task.routingKeywords,nonSessionUpdatedAt:timestamp}})}found.task.updatedAt=timestamp;const kindLabel=pendingTaskAction.kind==="zone"?"主任务":"次级项目";pendingTaskAction=null;closeDialog("task-edit-dialog");render();showToast(`${kindLabel}设置已更新`)});
byId("task-state-form").addEventListener("submit",event=>{event.preventDefault();if(!pendingTaskAction)return;const action={...pendingTaskAction};const found=findTask(action.kind,action.id);const config=STATE_ACTIONS[action.command];if(!found||!config)return closeDialog("task-state-dialog");const timestamp=now();found.task.status=config.status;found.task.paused=config.status===TASK_STATUS.PAUSED;found.task.updatedAt=timestamp;if(action.kind==="project"){found.task.nonSessionUpdatedAt=timestamp;found.zone.updatedAt=timestamp}pendingTaskAction=null;closeDialog("task-state-dialog");render();showToast(`「${found.task.name}」已${config.status===TASK_STATUS.ACTIVE?"重新开启":config.status===TASK_STATUS.PAUSED?"暂停":config.status===TASK_STATUS.FROZEN?"冻结":"标记完成"}`)});
byId("task-delete-name-confirm").addEventListener("input",()=>{const found=pendingTaskAction?findTask(pendingTaskAction.kind,pendingTaskAction.id):null;byId("confirm-task-delete").disabled=!found||byId("task-delete-name-confirm").value.trim()!==found.task.name});
byId("task-delete-form").addEventListener("submit",event=>{event.preventDefault();if(byId("confirm-task-delete").disabled)return;executeTaskDelete()});

document.querySelectorAll('[name="session-blocker-choice"]').forEach(input=>input.addEventListener("change",()=>{const hasBlocker=byId("session-blocker-yes").checked;byId("session-blocker-input-panel").hidden=!hasBlocker;if(hasBlocker)setTimeout(()=>byId("session-blocker-text").focus(),30)}));
byId("blocker-form").addEventListener("submit",event=>{event.preventDefault();const value=byId("blocker-text").value.trim();if(!value)return showInlineError(byId("blocker-text"),"请描述真实存在的问题");const project=currentProject();const timestamp=now();const session=activeSession(project);const blocker=normalizeBlocker({text:value,status:BLOCKER_STATUS.OPEN,priority:byId("blocker-priority").value,source:"manual",sourceSessionId:session?.id||null,createdAt:timestamp,updatedAt:timestamp},project.id,workspaceMode);project.blockers.push(blocker);project.blockerReviewPending=false;if(session)session.blockerIds=[...new Set([...(session.blockerIds||[]),blocker.id])];project.updatedAt=timestamp;project.nonSessionUpdatedAt=timestamp;currentZone().updatedAt=timestamp;AUTO_SYNC.recordProjectChange(state,project.id,{eventType:"blocker_created",sourceType:"manual",sourceId:`blocker_created:${blocker.id}`,changedAt:timestamp,summary:`记录阻塞：${value}`,reason:"用户明确标记为阻碍当前推进",patch:{blockers:project.blockers,blockerReviewPending:false,nonSessionUpdatedAt:timestamp}});closeDialog("blocker-dialog");render();showToast("未解决问题已记录")});
byId("session-form").addEventListener("submit",event=>{event.preventDefault();const goal=byId("session-goal").value.trim();const primary=byId("todo-primary").value.trim();if(!goal)return showInlineError(byId("session-goal"),"请输入描述完成状态的本次目标");if(!primary)return showInlineError(byId("todo-primary"),"请输入可立即执行的首要行动");const hasBlocker=byId("session-blocker-yes").checked;const blockerText=byId("session-blocker-text").value.trim();if(hasBlocker&&!blockerText)return showInlineError(byId("session-blocker-text"),"请选择“没有”，或描述真实存在的问题");const project=currentProject();let optional=[byId("todo-optional-1").value,byId("todo-optional-2").value];if(hasBlocker){const blockerOptional=window.ProjectOSPlanning.blockerAction(blockerText);if(!window.ProjectOSPlanning.isHighlySimilar(primary,blockerOptional)&&!optional.some(value=>window.ProjectOSPlanning.isHighlySimilar(value,blockerOptional)))optional=[blockerOptional,...optional].slice(0,2)}const cleaned=window.ProjectOSPlanning.cleanTodoValues({goal,primary,optional,projectName:project.name});if(cleaned.primaryChanged){byId("todo-primary").value=cleaned.primary;return showInlineError(byId("todo-primary"),"主行动与目标重复或不可直接执行，已自动生成具体动作，请确认后再次开始")};byId("todo-optional-1").value=cleaned.optional[0]||"";byId("todo-optional-2").value=cleaned.optional[1]||"";const values=[["PRIMARY",cleaned.primary],...cleaned.optional.map(value=>["OPTIONAL",value])].slice(0,3);const timestamp=now();const sessionId=uid("session");const blockerIds=[];if(hasBlocker){const blocker=normalizeBlocker({text:blockerText,status:BLOCKER_STATUS.OPEN,priority:"HIGH",source:"session-plan",sourceSessionId:sessionId,createdAt:timestamp,updatedAt:timestamp},project.id,workspaceMode);project.blockers.push(blocker);blockerIds.push(blocker.id)}const isDemo=workspaceMode===WORKSPACE_MODES.DEMO;const session=normalizeSession({id:sessionId,workspaceId:workspaceMode,projectId:project.id,startedAt:timestamp,endedAt:null,goal,isDemo,source:isDemo?"demo":"manual",blockerIds,todos:values.map(([kind,value])=>({id:uid("todo"),workspaceId:workspaceMode,kind,text:value.trim(),completed:false,createdAt:timestamp,updatedAt:timestamp})),notes:"",generatedPrompts:[],importedResults:[],completed:[],discoveries:[],remainingIssues:[],nextStep:"",parkingAdded:[],createdAt:timestamp,updatedAt:timestamp},project.id,workspaceMode);project.sessions.push(session);project.inProgress=values.map(([,value])=>value.trim());project.updatedAt=timestamp;currentZone().updatedAt=timestamp;writeSessionDraftMirror(session);closeDialog("session-dialog");ui.view="focus";render();showToast(cleaned.removedCount>0?"本次工作已开始，重复行动已自动移除":isDemo?"演示工作已开始，仅写入演示工作区":"本次工作已开始，只看当前项目")});
byId("stuck-form").addEventListener("submit",event=>{event.preventDefault();const problem=byId("stuck-problem").value.trim();if(!problem)return showInlineError(byId("stuck-problem"),"请先描述卡点");byId("stuck-output").value=assistancePrompt(currentZone(),currentProject(),activeSession(currentProject()),problem,byId("stuck-criteria").value.trim());byId("stuck-input-panel").hidden=true;byId("stuck-output-panel").hidden=false});byId("back-to-stuck").addEventListener("click",()=>{byId("stuck-input-panel").hidden=false;byId("stuck-output-panel").hidden=true});byId("copy-stuck").addEventListener("click",()=>copyText(byId("stuck-output").value,"求助提示词已复制"));byId("save-stuck").addEventListener("click",()=>{const session=activeSession(currentProject());const timestamp=now();session.generatedPrompts.push({id:uid("prompt"),workspaceId:workspaceMode,problem:byId("stuck-problem").value.trim(),acceptanceCriteria:byId("stuck-criteria").value.trim(),prompt:byId("stuck-output").value,source:workspaceMode===WORKSPACE_MODES.DEMO||session.isDemo?"demo":"manual",createdAt:timestamp,updatedAt:timestamp});session.updatedAt=timestamp;closeDialog("stuck-dialog");save();showToast(workspaceMode===WORKSPACE_MODES.DEMO?"提示词已保存到演示工作区":"提示词已保存到本次工作")});
byId("copy-status-review").addEventListener("click",()=>copyText(byId("status-review-output").value,"现状总结提示词已复制"));
byId("status-review-output").addEventListener("click",copyCurrentReviewPrompt);
byId("save-status-review").addEventListener("click",()=>{const session=activeSession(currentProject());if(!session)return showToast("当前没有进行中的工作");const timestamp=now();session.generatedPrompts.push({id:uid("prompt"),workspaceId:workspaceMode,type:"STATUS_REVIEW",prompt:byId("status-review-output").value,source:workspaceMode===WORKSPACE_MODES.DEMO||session.isDemo?"demo":"manual",createdAt:timestamp,updatedAt:timestamp});session.updatedAt=timestamp;save();showToast(workspaceMode===WORKSPACE_MODES.DEMO?"状态审查提示词已保存到演示工作区":"状态审查提示词已保存到本次工作")});
byId("parse-status-review").addEventListener("click",()=>{const raw=byId("status-review-result").value.trim();if(!raw)return showInlineError(byId("status-review-result"),"请粘贴 AI 返回的 JSON");const parsed=parseProjectUpdateJson(raw);if(!parsed.ok)return showInlineError(byId("status-review-result"),parsed.error);pendingStatusReview={...parsed.value,reviewIntent:currentReviewMode==="work-summary"?"WORK_SUMMARY":"STATUS_REVIEW"};byId("status-review-preview").innerHTML=statusReviewPreviewForm(pendingStatusReview);byId("status-review-input-panel").hidden=true;byId("status-review-preview-panel").hidden=false});
byId("back-to-status-review").addEventListener("click",()=>{byId("status-review-input-panel").hidden=false;byId("status-review-preview-panel").hidden=true;pendingStatusReview=null});
byId("confirm-status-review").addEventListener("click",()=>{
  const zone=currentZone();const project=currentProject();const session=activeSession(project);if(!pendingStatusReview||!session)return showToast("没有可确认的现状总结");const timestamp=now();
  const draft=collectStatusReviewDraft();const selections=statusReviewSelections();
  const imported={...clone(draft),id:uid("result"),workspaceId:workspaceMode,source:workspaceMode===WORKSPACE_MODES.DEMO||session.isDemo?"demo":"ai",appliedSelections:selections,appliedToFormal:!session.isDemo,importedAt:timestamp,createdAt:timestamp,updatedAt:timestamp};
  session.importedResults.push(imported);session.updatedAt=timestamp;
  if(session.isDemo){pendingStatusReview=null;closeDialog("status-review-dialog");render();showToast("现状总结只保存到演示记录，正式项目未改变");return}
  applyStatusReviewDraft(zone,project,session,draft,selections,timestamp);AUTO_SYNC.recordProjectChange(state,project.id,{eventType:"ai_review_confirmed",sourceType:"manual",sourceId:`ai_review_confirmed:${project.id}:${timestamp}`,changedAt:timestamp,summary:"用户确认了 AI 现状建议",reason:"用户逐项勾选并确认",patch:statusReviewPatch(project,selections,timestamp)});finishStatusReviewUpdate("已按勾选项更新项目，未勾选字段保持不变");
});
byId("apply-result").addEventListener("click",()=>{if(pendingResult)pendingResult.applyProblems=byId("apply-active-problems").checked},true);
byId("result-form").addEventListener("submit",event=>{
  event.preventDefault();const raw=byId("ai-result").value.trim();if(!raw)return showInlineError(byId("ai-result"),"请粘贴 AI 返回结果");pendingResult=resultData(raw);byId("result-preview").innerHTML=previewRows(pendingResult);byId("result-input-panel").hidden=true;byId("result-preview-panel").hidden=false;
});
byId("back-to-result").addEventListener("click",()=>{byId("result-input-panel").hidden=false;byId("result-preview-panel").hidden=true});
byId("apply-result").addEventListener("click",()=>{
  const zone=currentZone();const project=currentProject();const session=activeSession(project);const timestamp=now();
  const selections={progress:byId("apply-progress-summary").checked,problems:byId("apply-active-problems").checked,next:byId("apply-recommended-next").checked,memory:byId("apply-memory-update").checked,backlog:byId("apply-optional-backlog").checked};
  const imported={...clone(pendingResult),id:uid("result"),workspaceId:workspaceMode,source:workspaceMode===WORKSPACE_MODES.DEMO||session.isDemo?"demo":"ai",appliedSelections:selections,appliedToFormal:!session.isDemo,importedAt:timestamp,createdAt:timestamp,updatedAt:timestamp};
  session.importedResults.push(imported);session.discoveries.push(...pendingResult.discoveries.filter(item=>!session.discoveries.includes(item)));session.updatedAt=timestamp;
  if(session.isDemo){closeDialog("result-dialog");render();showToast("AI 返回结果仅保存到旧版演示记录，正式项目未改变");return}
  applyResultToFormalProject(zone,project,session,pendingResult,timestamp,{recordDiscoveries:false,selections});AUTO_SYNC.recordProjectChange(state,project.id,{eventType:"ai_result_confirmed",sourceType:"manual",sourceId:`ai_result_confirmed:${project.id}:${timestamp}`,changedAt:timestamp,summary:"用户确认了手动导入的 AI 返回结果",reason:"用户逐项确认手动补充记录",patch:importedResultPatch(project,selections,timestamp)});closeDialog("result-dialog");render();showToast(workspaceMode===WORKSPACE_MODES.DEMO?"已更新演示项目状态":"已确认进度总结、活动问题、下一步与项目记忆");
});
byId("end-form").addEventListener("submit",event=>{event.preventDefault();const zone=currentZone();const project=currentProject();const session=activeSession(project);if(session.isDemo)return;const timeValues=confirmedEndTimeValues();if(!timeValues)return;prepareSessionEnd(session,byId("end-discoveries").value,byId("end-next-step").value);session.startedAt=timeValues.startedAt;session.endedAt=timeValues.endedAt;session.focusMinutes=timeValues.focusMinutes;session.timeEntryMode="MANUAL_CONFIRMED";session.timeConfirmedAt=now();const timestamp=session.endedAt;commitSessionEndToProject(zone,project,session,timestamp);AUTO_SYNC.recordWorkLog(state,project.id,{sessionId:session.id,title:session.title||session.goal,summary:session.progressSummary.join("；")||session.summary,completed:session.completed,remaining:session.remainingIssues,nextAction:session.nextStep,openIssues:session.remainingIssues,currentState:project.currentState,currentProgressSummary:session.progressSummary.join("；"),endedAt:timestamp,timeConfirmed:byId("end-time-confirmed").checked},{sourceType:"manual",sourceId:`session_end:${session.id}`,changedAt:timestamp,reason:"用户结束并保存本次工作"});clearSessionRecovery(session);finishEndedSession("本次工作总结已保存，下次可直接续接")});
byId("demo-end-keep").addEventListener("click",()=>{const session=activeSession(currentProject());prepareSessionEnd(session,byId("end-discoveries").value,byId("end-next-step").value);finishEndedSession("演示记录已保存，正式项目未改变")});
byId("demo-end-promote").addEventListener("click",()=>{const zone=currentZone();const project=currentProject();const session=activeSession(project);const timestamp=prepareSessionEnd(session,byId("end-discoveries").value,byId("end-next-step").value);session.promotedToFormal=true;session.importedResults.filter(result=>!result.appliedToFormal).forEach(result=>{applyResultToFormalProject(zone,project,session,result,timestamp,{recordDiscoveries:false,selections:result.appliedSelections||{progress:true,next:true,memory:true,backlog:false}});result.appliedToFormal=true;result.updatedAt=timestamp});commitSessionEndToProject(zone,project,session,timestamp);finishEndedSession("演示结果已写入正式项目")});
byId("demo-end-delete").addEventListener("click",()=>{const session=activeSession(currentProject());closeDialog("end-dialog");openDeleteHistoryDialog({sessionIds:[session.id]})});
document.addEventListener("input",event=>{if(["end-started-at","end-ended-at"].includes(event.target.id))refreshEndFocusDuration();if(event.target.id==="session-notes"){const project=currentProject();const session=activeSession(project);if(session){const timestamp=now();session.notes=event.target.value;session.updatedAt=timestamp;if(!session.isDemo)project.updatedAt=timestamp;writeSessionDraftMirror(session);save()}}});
window.addEventListener("pagehide",()=>{const session=activeSession(currentProject());if(session)writeSessionDraftMirror(session)});

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
function syncLinkForm(){const zone=currentZone();const targetId=byId("link-target").value;const link=linkBetween(zone.id,targetId);document.querySelectorAll('[name="link-scope"]').forEach(box=>box.checked=Boolean(link?.scopes.includes(box.value)));byId("link-reason").value=link?.reason||""}
byId("link-target").addEventListener("change",syncLinkForm);byId("link-form").addEventListener("submit",event=>{event.preventDefault();const zone=currentZone();const targetId=byId("link-target").value;const scopes=[...document.querySelectorAll('[name="link-scope"]:checked')].map(box=>box.value);const reason=byId("link-reason").value.trim();if(!scopes.length)return showInlineError(byId("link-target"),"至少选择一种明确的共享范围");if(!reason)return showInlineError(byId("link-reason"),"请说明为什么需要建立这条关联");const timestamp=now();let link=linkBetween(zone.id,targetId);if(link){link.scopes=scopes;link.reason=reason;link.mode="REFERENCE_ONLY";link.confirmedByUser=true;link.updatedAt=timestamp}else state.zoneLinks.push({id:uid("link"),workspaceId:workspaceMode,sourceZoneId:zone.id,targetZoneId:targetId,scopes,reason,mode:"REFERENCE_ONLY",confirmedByUser:true,createdAt:timestamp,updatedAt:timestamp});zone.updatedAt=timestamp;closeDialog("link-dialog");render();showToast("只读关联规则已保存，不会互相改写项目状态")});byId("remove-link").addEventListener("click",()=>{const zone=currentZone();const targetId=byId("link-target").value;state.zoneLinks=state.zoneLinks.filter(link=>!((link.sourceZoneId===zone.id&&link.targetZoneId===targetId)||(link.sourceZoneId===targetId&&link.targetZoneId===zone.id)));zone.updatedAt=now();closeDialog("link-dialog");render();showToast("两个主任务已设为隔离")});

function downloadPayload(payload,filename){const blob=new Blob([storageAdapter.serializeState(payload)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
byId("export-button").addEventListener("click",()=>{byId("export-form").reset();byId("export-dialog").showModal()});
byId("export-form").addEventListener("submit",async event=>{event.preventDefault();try{await saveQueue;const includeDemo=byId("export-include-demo").checked;const normalWorkspace=workspaceMode===WORKSPACE_MODES.NORMAL?state:await storageAdapter.loadWorkspace(WORKSPACE_MODES.NORMAL);const demoWorkspace=includeDemo?(workspaceMode===WORKSPACE_MODES.DEMO?state:await storageAdapter.loadWorkspace(WORKSPACE_MODES.DEMO)):null;const payload=storageAdapter.exportState(normalWorkspace||emptyState(WORKSPACE_MODES.NORMAL),{includeDemo,demoWorkspace});downloadPayload(payload,`项目存档驾驶舱-${new Date().toISOString().slice(0,10)}.json`);closeDialog("export-dialog");showToast(includeDemo?"已导出正式与演示工作区备份":"已导出正式工作区备份")}catch(error){console.error(error);showToast("导出失败，请重试")}});
byId("export-demo-button").addEventListener("click",async()=>{if(workspaceMode!==WORKSPACE_MODES.DEMO)return;try{await saveQueue;downloadPayload(storageAdapter.exportDemoState(state),`项目存档驾驶舱-演示状态-${new Date().toISOString().slice(0,10)}.json`);showToast("已导出演示状态")}catch(error){console.error(error);showToast("导出演示状态失败")}});
byId("import-button").addEventListener("click",()=>byId("backup-file").click());
byId("backup-file").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;try{const bundle=storageAdapter.hydrateBundle(await file.text());pendingImportTargetMode=bundle.workspaceMode===WORKSPACE_MODES.DEMO?WORKSPACE_MODES.DEMO:WORKSPACE_MODES.NORMAL;if(pendingImportTargetMode===WORKSPACE_MODES.DEMO){pendingImportState=null;pendingImportDemoState=migrateAny(bundle.workspace,WORKSPACE_MODES.DEMO);byId("backup-preview-content").innerHTML='<div class="preview-row"><strong>导入目标</strong><p>仅替换独立演示工作区</p></div>'+importPreviewRows(pendingImportDemoState)}else{pendingImportState=migrateAny(bundle.workspace,WORKSPACE_MODES.NORMAL);pendingImportDemoState=bundle.demoWorkspace?migrateAny(bundle.demoWorkspace,WORKSPACE_MODES.DEMO):null;byId("backup-preview-content").innerHTML=importPreviewRows(pendingImportState)+(pendingImportDemoState?'<div class="preview-row"><strong>演示工作区</strong><p>备份中包含，将同步恢复</p></div>':'')}byId("backup-preview-dialog").showModal()}catch(error){console.error(error);pendingImportState=null;pendingImportDemoState=null;pendingImportTargetMode=WORKSPACE_MODES.NORMAL;showToast("导入失败：无法识别备份格式")}finally{event.target.value=""}});
byId("backup-preview-form").addEventListener("submit",async event=>{event.preventDefault();if(pendingImportTargetMode===WORKSPACE_MODES.DEMO){if(!pendingImportDemoState)return closeDialog("backup-preview-dialog");const demo=normalizeCurrent(pendingImportDemoState,WORKSPACE_MODES.DEMO);await storageAdapter.saveWorkspace(clone(demo),WORKSPACE_MODES.DEMO);if(workspaceMode===WORKSPACE_MODES.DEMO){state=demo;resetUi()}}else{if(!pendingImportState)return closeDialog("backup-preview-dialog");const normal=normalizeCurrent(pendingImportState,WORKSPACE_MODES.NORMAL);await storageAdapter.saveWorkspace(clone(normal),WORKSPACE_MODES.NORMAL);if(pendingImportDemoState)await storageAdapter.saveWorkspace(clone(normalizeCurrent(pendingImportDemoState,WORKSPACE_MODES.DEMO)),WORKSPACE_MODES.DEMO);if(workspaceMode===WORKSPACE_MODES.NORMAL){state=normal;resetUi()}}pendingImportState=null;pendingImportDemoState=null;pendingImportTargetMode=WORKSPACE_MODES.NORMAL;closeDialog("backup-preview-dialog");render();showToast("已成功导入备份并刷新当前状态")});

window.ProjectOSInspirationAI=Object.freeze({
  states:[...INSPIRATION_AI_STATES],
  setState(id,aiState,{summary}={}){
    if(!INSPIRATION_AI_STATES.includes(aiState))throw new Error(`Unsupported inspiration AI state: ${aiState}`);
    const item=state.inspirations.find(entry=>entry.id===id);if(!item)return null;
    const timestamp=now();item.aiState=aiState;if(summary!==undefined)item.aiSummary=String(summary||"");item.aiUpdatedAt=timestamp;item.updatedAt=timestamp;render();return clone(item);
  }
});

initialize();
