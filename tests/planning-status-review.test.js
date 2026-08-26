const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "planning.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "bootstrap.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "ai-workflow.js"), "utf8"));

const planning = window.ProjectOSPlanning;
const ai = window.ProjectOSAIWorkflow;

test("视觉一致性实验的 Goal 与主行动分离", () => {
  const plan=planning.buildSessionPlan({name:"视觉一致性实验",goal:"建立稳定、可复现的单变量实验流程。",nextActions:["建立稳定、可复现的单变量实验流程。"]});
  assert.equal(planning.isHighlySimilar(plan.goal,plan.primary),false);
  assert.match(plan.primary,/单变量/);
  assert.match(plan.primary,/3～5 次/);
});

test("实时文字识别工具的主行动是可执行的场景验证", () => {
  const plan=planning.buildSessionPlan({name:"实时文字识别工具",goal:"验证真实场景中的文字识别稳定性。",nextActions:["验证真实场景中的文字识别稳定性。"]});
  assert.match(plan.primary,/20 分钟/);
  assert.match(plan.primary,/误触发/);
  assert.equal(planning.startsWithActionVerb(plan.primary),true);
});

test("移动端流程的主行动包含设备、完整流程和核对条件", () => {
  const plan=planning.buildSessionPlan({name:"移动端业务流程",goal:"验证表单流程完整交互。",nextActions:["验证表单流程完整交互。"]});
  assert.match(plan.primary,/目标设备/);
  assert.match(plan.primary,/从创建到确认/);
  assert.match(plan.primary,/逐步核对/);
});

test("Todo 去除完全重复、高相似和“解决：X / X”", () => {
  const result=planning.cleanTodoValues({goal:"建立可复现的单变量实验方案",primary:"确定下一组单变量对照实验",optional:["解决：确定下一组单变量对照实验","确定下一组单变量对照实验"],projectName:"视觉一致性实验"});
  assert.equal(result.optional.length,0);
  assert.equal(planning.isHighlySimilar(result.primary,result.optional[0]),false);
});

test("高优先级 OPEN blocker 优先成为主行动", () => {
  const plan=planning.buildSessionPlan({name:"角色实验",goal:"建立稳定实验流程",nextActions:["整理旧案例"],blockers:[{text:"右 45° 生成会镜像",status:"OPEN",priority:"HIGH"},{text:"旧问题",status:"RESOLVED",priority:"HIGH"}]});
  assert.match(plan.primary,/右 45° 生成会镜像/);
  assert.doesNotMatch(plan.primary,/旧问题/);
});

test("现状总结只读取当前 Project、OPEN blockers 和允许共享记忆", () => {
  const prompt=ai.buildStatusReviewPrompt({
    zone:{name:"示例主任务",sharedMemory:[{text:"允许共享的公开开发母线"}],projects:[{name:"其他项目",projectMemory:["不应出现的私有内容"]}]},
    project:{name:"实时文字识别工具",purpose:"识别屏幕上的即时文字",goal:"验证稳定性",currentState:"第一版已跑通",completed:["完成 OCR"],inProgress:["前台测试"],blockers:[{text:"动态背景误触发",status:"OPEN"},{text:"已解决问题",status:"RESOLVED"}],openIssues:["分辨率适配"],decisions:["多帧确认"],constraints:["不遮挡目标窗口"],parkingLot:["安装包"],nextActions:["运行 20 分钟"],assets:["测试录屏"]},
    session:{goal:"验证前台稳定性",todos:[{text:"收集失败样本",completed:true}],notes:"已经记录 3 个样本"},
    recentSessions:[{endedAt:"2026-08-25",summary:"OCR 已跑通"}]
  });
  ["current_state_summary","completed_milestones","in_progress","active_problems","current_blockers","progress_judgement","recommended_next_step","optional_next_steps","should_stop_or_defer","memory_update","动态背景误触发","已经记录 3 个样本","允许共享的公开开发母线"].forEach(value=>assert.match(prompt,new RegExp(value)));
  assert.match(prompt,/只返回一个 JSON 代码块/);
  assert.match(prompt,/当前项目：实时文字识别工具｜/);
  assert.match(prompt,/明确完成、验证、通过或交付证据/);
  assert.match(prompt,/不得推测完成/);
  assert.match(prompt,/```json/);
  assert.doesNotMatch(prompt,/不应出现的私有内容/);
  assert.doesNotMatch(prompt,/已解决问题/);
});

test("总结工作 Prompt 明确依据本次工作生成结构化状态更新建议", () => {
  const prompt=ai.buildStatusReviewPrompt({intent:"WORK_SUMMARY",zone:{name:"业务改善",sharedMemory:[]},project:{name:"咨询标准化",currentState:"等待样本验证",currentPhase:"VALIDATION",completed:["旧成果"],inProgress:["检查10件样本","整理结果"],blockers:[],openIssues:["分类差异"],decisions:[],constraints:[],parkingLot:[],nextActions:["检查10件样本","整理结果"],assets:[]},session:{goal:"验证分类规则",todos:[{text:"检查10件样本",completed:true},{text:"整理结果",completed:false}],notes:"已记录差异，3件样本结果一致"},recentSessions:[{summary:"不应混入的旧历史噪音"}]});
  assert.match(prompt,/重新整理“当前项目更新后的完整档案”/);
  assert.match(prompt,/CURRENT_PROJECT_UPDATE/);
  assert.match(prompt,/本次可核对证据（最高优先级）/);
  assert.match(prompt,/已记录差异，3件样本结果一致/);
  assert.match(prompt,/旧成果/);
  assert.match(prompt,/更新后仍在进行的候选项：\n整理结果/);
  assert.equal((prompt.match(/检查10件样本/g)||[]).length,1);
  assert.doesNotMatch(prompt,/不应混入的旧历史噪音/);
  assert.match(prompt,/"project_name": ""/);
  assert.match(prompt,/"current_state": ""/);
  assert.match(prompt,/"assets": \[\]/);
  assert.match(prompt,/completed_milestones/);
  assert.match(prompt,/只返回一个 JSON 代码块/);
  assert.match(prompt,/project_name 必须准确写为“咨询标准化”/);
});

test("总结工作在本次证据为空时禁止虚构进展", () => {
  const prompt=ai.buildStatusReviewPrompt({intent:"WORK_SUMMARY",zone:{name:"实验室"},project:{name:"角色控制",currentState:"等待单变量实验",currentPhase:"EXPLORATION",completed:[],inProgress:["确定实验变量"],openIssues:["拓扑结果不稳定"],blockers:[],nextActions:["确定实验变量"]},session:{goal:"验证角色一致性",todos:[{text:"确定实验变量",completed:false}],notes:""}});
  assert.match(prompt,/证据不足/);
  assert.match(prompt,/原样保留项目目的、目标、状态、阶段、完成项、问题、阻塞/);
  assert.match(prompt,/不得添加新完成项、新资产、新记忆/);
  assert.match(prompt,/不得.*提高 current_phase/);
});

test("总结工作完整项目结构可解析且用 project_name 阻止串项目", () => {
  const raw=JSON.stringify({project_name:"Character Control",project_purpose:"AI 造物实验",current_goal:"建立可复现流程",current_state:"已完成 Free / Pro 分装，并生成一键安装包；同时确认了 Skill 的能力缺口。",current_phase:"VALIDATION",completed_milestones:["完成 Free / Pro 分装","生成并验证一键安装包"],in_progress:["补齐 Skill 能力缺口"],open_issues:["安装说明仍需验证"],current_blockers:[],recommended_next_step:"在干净环境验证安装包",key_decisions:["Free 与 Pro 使用独立入口"],constraints:[],assets:["一键安装包"],important_context:["Skill 当前不能自动发现外部工作事实"],parking_lot:[]});
  const parsed=window.ProjectOSBootstrap.parseProjectUpdateJson(raw);
  assert.equal(parsed.ok,true);
  assert.equal(parsed.value.resultType,"PROJECT_UPDATE");
  assert.equal(parsed.value.projectName,"Character Control");
  assert.match(parsed.value.currentStateSummary[0],/Free \/ Pro/);
  assert.deepEqual(parsed.value.assets,["一键安装包"]);
  assert.equal(ai.validateStatusReviewIdentity(parsed.value,{projectName:"Character Control"}).ok,true);
  assert.equal(ai.validateStatusReviewIdentity(parsed.value,{projectName:"其他项目"}).ok,false);
  const wrongShape=window.ProjectOSBootstrap.parseProjectUpdateJson(JSON.stringify({current_state_summary:"旧结构",completed_milestones:[]}));
  assert.equal(wrongShape.ok,false);
  assert.equal(wrongShape.code,"STATUS_REVIEW_SHAPE");
});

test("状态总结拒绝其他项目或旧对话的合法 JSON", () => {
  const wrong=window.ProjectOSBootstrap.parseStatusReviewJson(JSON.stringify({current_state_summary:"项目已进入本地 MVP 稳定化阶段，JPR Demo 已完成。",completed_milestones:["完成面向 JPR 的 Demo"],in_progress:[],active_problems:["本周专注口径尚未统一"],current_blockers:[],progress_judgement:{phase:"STABILIZATION",reason:""},recommended_next_step:"核对本周专注",optional_next_steps:[],should_stop_or_defer:[],memory_update:[]}));
  assert.equal(wrong.ok,true);
  const rejected=ai.validateStatusReviewIdentity(wrong.value,{projectName:"AI 人体 Bug / Character Control"});
  assert.equal(rejected.ok,false);
  assert.match(rejected.error,/AI 人体 Bug \/ Character Control/);

  const correct=window.ProjectOSBootstrap.parseStatusReviewJson(JSON.stringify({current_state_summary:"当前项目：AI 人体 Bug / Character Control｜项目处于实验方法收敛阶段。",completed_milestones:[],in_progress:["确定单变量实验"],active_problems:[],current_blockers:[],progress_judgement:{phase:"EXPLORATION",reason:""},recommended_next_step:"执行一组对照实验",optional_next_steps:[],should_stop_or_defer:[],memory_update:[]}));
  const accepted=ai.validateStatusReviewIdentity(correct.value,{projectName:"AI 人体 Bug / Character Control"});
  assert.equal(accepted.ok,true);
  assert.deepEqual(accepted.value.currentStateSummary,["项目处于实验方法收敛阶段。"]) ;
  assert.equal(accepted.value.identityProjectName,"AI 人体 Bug / Character Control");
});

test("现状总结严格 JSON 可解析为写回结构", () => {
  const raw=JSON.stringify({current_state_summary:"已进入真实场景验证阶段。",completed_milestones:["OCR 已跑通"],active_problems:["动态背景误触发"],progress_judgement:{phase:"VALIDATION",reason:"仍需长期前台测试"},recommended_next_step:"启动真实比赛前台运行 20 分钟并记录失败样本。",optional_next_steps:["测试不同分辨率"],should_stop_or_defer:["暂缓安装包美化"],memory_update:["多帧确认已启用"]});
  const parsed=window.ProjectOSBootstrap.parseStatusReviewJson(raw);
  assert.equal(parsed.ok,true);
  const result=parsed.value;
  assert.equal(result.resultType,"STATUS_REVIEW");
  assert.deepEqual(result.progressSummary,["已进入真实场景验证阶段。"]) ;
  assert.deepEqual(result.completed,["OCR 已跑通"]);
  assert.deepEqual(result.activeProblems,["动态背景误触发"]);
  assert.deepEqual(result.remainingIssues,[]);
  assert.match(result.progressJudgement,/验证阶段/);
  assert.match(result.recommendedNextStep,/20 分钟/);
  assert.deepEqual(result.shouldStopOrDefer,["暂缓安装包美化"]);
});

test("AI 返回中的空数组不会创建伪记忆或伪行动",()=>{
  const result=window.ProjectOSBootstrap.parseStatusReviewJson(JSON.stringify({current_state_summary:"原型已跑通。",completed_milestones:[],active_problems:[],progress_judgement:{phase:"PROTOTYPE",reason:""},recommended_next_step:"",optional_next_steps:[],should_stop_or_defer:[],memory_update:[]})).value;
  assert.deepEqual(result.optionalNextSteps,[]);
  assert.deepEqual(result.memoryUpdates,[]);
});

test("现状总结 Prompt 在生成前去除项目与 Session 重复行动",()=>{
  const prompt=ai.buildStatusReviewPrompt({zone:{name:"示例主任务",sharedMemory:[]},project:{name:"实验",inProgress:["确定下一组单变量对照实验","解决：确定下一组单变量对照实验"],openIssues:["动态背景误触发","解决：动态背景误触发"],nextActions:["运行真实测试","解决：运行真实测试"],blockers:[]},session:{todos:[{text:"收集失败样本",completed:false},{text:"解决：收集失败样本",completed:false}]}});
  assert.equal((prompt.match(/确定下一组单变量对照实验/g)||[]).length,1);
  assert.equal((prompt.match(/动态背景误触发/g)||[]).length,1);
  assert.equal((prompt.match(/运行真实测试/g)||[]).length,1);
  assert.equal((prompt.match(/收集失败样本/g)||[]).length,1);
});
