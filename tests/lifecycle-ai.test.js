const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "lifecycle.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "ai-workflow.js"), "utf8"));

const lifecycle = window.ProjectOSLifecycle;
const ai = window.ProjectOSAIWorkflow;

test("旧 paused 字段迁移为 PAUSED，新任务默认 ACTIVE", () => {
  assert.equal(lifecycle.normalizeTaskStatus(undefined, true), "PAUSED");
  assert.equal(lifecycle.normalizeTaskStatus(undefined, false), "ACTIVE");
  assert.equal(lifecycle.normalizeTaskStatus("FROZEN", false), "FROZEN");
});

test("四种生命周期状态只暴露允许的任务操作", () => {
  assert.deepEqual(lifecycle.taskMenuActions({ status:"ACTIVE" }), ["EDIT","PAUSE","FREEZE","COMPLETE","DELETE"]);
  assert.deepEqual(lifecycle.taskMenuActions({ status:"PAUSED" }), ["EDIT","REOPEN","FREEZE","DELETE"]);
  assert.deepEqual(lifecycle.taskMenuActions({ status:"FROZEN" }), ["VIEW","REOPEN","DELETE"]);
  assert.deepEqual(lifecycle.taskMenuActions({ status:"COMPLETED" }), ["VIEW","REOPEN","DELETE"]);
});

test("只有 ACTIVE 任务参与日常推荐", () => {
  assert.equal(lifecycle.isRecommendable({ status:"ACTIVE" }), true);
  assert.equal(lifecycle.isRecommendable({ status:"PAUSED" }), false);
  assert.equal(lifecycle.isRecommendable({ status:"FROZEN" }), false);
  assert.equal(lifecycle.isRecommendable({ status:"COMPLETED" }), false);
});

test("用户暂停或冻结的空项目不会被 Orphan Check 误删", () => {
  const base={sessions:[],projectMemory:[],assets:[],completed:[],backlog:[],parkingLot:[],openIssues:[],decisions:[],constraints:[],inProgress:[],nextActions:[],currentState:"刚刚建立，尚未开始第一轮工作。"};
  assert.equal(lifecycle.isOrphanProject({ ...base,status:"ACTIVE" }), true);
  assert.equal(lifecycle.isOrphanProject({ ...base,status:"PAUSED" }), false);
  assert.equal(lifecycle.isOrphanProject({ ...base,status:"FROZEN" }), false);
});

test("项目建立与 AI 导入都能生成工作历史 No.1 快照",()=>{
  const project={id:"p1",goal:"验证真实流程",currentState:"原型已跑通",completed:["完成原型"],openIssues:["误触待验证"],nextActions:["执行 5 次测试"]};
  const manual=lifecycle.buildProjectOriginSession({id:"s1",project,kind:"manual",timestamp:"2026-08-25T01:00:00.000Z"});
  const imported=lifecycle.buildProjectOriginSession({id:"s2",project,kind:"ai",timestamp:"2026-08-25T02:00:00.000Z",bootstrapJson:'{"project_name":"测试"}'});
  assert.equal(manual.title,"项目建立");
  assert.equal(manual.status,"ENDED");
  assert.equal(imported.title,"项目导入");
  assert.equal(imported.bootstrapJson,'{"project_name":"测试"}');
  assert.deepEqual(imported.initialSnapshot.completed,["完成原型"]);
  assert.equal(imported.initialSnapshot.nextStep,"执行 5 次测试");
});

test("删除最后一条有效历史只由 Session 数量决定，不受 Memory 阻止",()=>{
  const project={projectMemory:[{text:"长期记忆"}],sessions:[{id:"origin",isDemo:false},{id:"demo",isDemo:true,promotedToFormal:false}]};
  assert.equal(lifecycle.isDeletingLastFormalHistory(project,["origin"]),true);
  assert.equal(lifecycle.isDeletingLastFormalHistory(project,["demo"]),false);
});

test("选择保留空项目后重置工作状态但保留长期资料",()=>{
  const project={name:"测试项目",purpose:"保留目的",projectMemory:[{text:"长期记忆"}],goal:"旧目标",currentState:"旧状态",currentPhase:"VALIDATION",completed:["误判完成"],importedMilestones:[{summary:"误判完成"}],inProgress:["进行中"],nextActions:["下一步"],openIssues:["问题"],blockers:[{text:"阻塞"}],sessions:[]};
  const reset=lifecycle.resetProjectAfterLastHistory(project,"2026-08-25T03:00:00.000Z");
  assert.equal(reset.currentState,"尚未开始 / 无工作记录");
  assert.equal(reset.keepWhenEmpty,true);
  assert.deepEqual(reset.completed,[]);
  assert.deepEqual(reset.blockers,[]);
  assert.deepEqual(reset.projectMemory,[{text:"长期记忆"}]);
  assert.equal(reset.purpose,"保留目的");
});

test("级联删除只移除实时引用，正式事件保留并清空来源 ID", () => {
  const events=[
    {id:"live",sourceProjectId:"p1",sourceZoneId:"z1",status:"live"},
    {id:"confirmed",sourceProjectId:"p1",sourceZoneId:"z1",status:"confirmed"},
    {id:"other",sourceProjectId:"p2",sourceZoneId:"z2",status:"live"}
  ];
  const result=lifecycle.reconcileDeletedTaskEvents(events,{projectIds:["p1"],zoneId:"z1",zoneName:"示例主任务"});
  assert.deepEqual(result.map(item=>item.id),["confirmed","other"]);
  assert.equal(result[0].sourceProjectId,null);
  assert.equal(result[0].sourceZoneId,null);
  assert.equal(result[0].sourceStatus,"来源任务已删除");
});

test("我卡住了 Prompt 包含完整背景和强制结束区", () => {
  const prompt=ai.buildAssistancePrompt({
    zone:{name:"示例主任务",sharedMemory:[{text:"统一公开开发母线"}]},
    project:{name:"屏幕文字识别工具",purpose:"识别屏幕文字",goal:"验证稳定性",currentState:"第一版已跑通",completed:["完成 OCR"],inProgress:["回归测试"],openIssues:["误触发"],decisions:["多帧去重"],constraints:["不遮挡目标窗口"]},
    session:{goal:"解决误触发",todos:[{text:"收集失败样本",completed:false}]},
    problem:"动态背景重复识别",criteria:"连续 20 分钟无重复输出",recentSessionSummary:"完成第一版悬浮窗"
  });
  ["当前目标","当前状态","当前进行中","关键决策","最近一次工作","用户当前卡点","CURRENT_PROGRESS_SUMMARY","RECOMMENDED_NEXT_STEP","OPTIONAL_NEXT_STEPS","MEMORY_UPDATE"].forEach(value=>assert.match(prompt,new RegExp(value)));
  assert.match(prompt,/动态背景重复识别/);
});

test("AI JSON 返回可解析进度总结、推荐下一步、备选与记忆", () => {
  const result=ai.parseAIResult(JSON.stringify({CURRENT_PROGRESS_SUMMARY:["前台识别已跑通","剩余稳定性验证"],RECOMMENDED_NEXT_STEP:"连续运行20分钟并记录误触发",OPTIONAL_NEXT_STEPS:["测试不同分辨率"],MEMORY_UPDATE:["空闲检测已优化"]}));
  assert.deepEqual(result.progressSummary,["前台识别已跑通","剩余稳定性验证"]);
  assert.equal(result.recommendedNextStep,"连续运行20分钟并记录误触发");
  assert.deepEqual(result.optionalNextSteps,["测试不同分辨率"]);
  assert.deepEqual(result.memoryUpdates,["空闲检测已优化"]);
});

test("AI Markdown 固定结束区同样可以解析", () => {
  const raw=`## CURRENT_PROGRESS_SUMMARY\n- 已完成前台识别\n- 剩余长期验证\n\n## RECOMMENDED_NEXT_STEP\n在真实前台连续运行20分钟并记录失败样本。\n\n## OPTIONAL_NEXT_STEPS\n- 测试不同分辨率\n\n## MEMORY_UPDATE\n- 去重窗口初值750ms`;
  const result=ai.parseAIResult(raw);
  assert.equal(result.progressSummary.length,2);
  assert.match(result.recommendedNextStep,/连续运行20分钟/);
  assert.deepEqual(result.optionalNextSteps,["测试不同分辨率"]);
  assert.deepEqual(result.memoryUpdates,["去重窗口初值750ms"]);
});
