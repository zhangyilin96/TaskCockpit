const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "planning.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "bootstrap.js"), "utf8"));
const bootstrap=window.ProjectOSBootstrap;

const oldProject={
  project_name:"简易点单",
  project_purpose:"为小店提供无需培训的轻量点单流程",
  current_goal:"完成真实门店的一轮可用性验证",
  current_state:"手机端点单、改数量和订单汇总已经跑通，正在验证真实使用中的出错点。",
  current_phase:"VALIDATION",
  completed_milestones:["完成手机端点单原型","跑通新增商品到订单汇总"],
  in_progress:["收集店员试用反馈","解决：收集店员试用反馈"],
  open_issues:["高峰期误触仍需验证"],
  current_blockers:[],
  recommended_next_step:"邀请 1 名店员完成 5 次完整点单并记录失败步骤",
  key_decisions:["先做单店本地版"],constraints:["不接云端账号"],assets:["真实门店流程截图"],important_context:["店员主要使用手机"],parking_lot:[]
};

test("旧项目 JSON 同时生成记忆与项目现状",()=>{
  const parsed=bootstrap.parseProjectBootstrap(JSON.stringify(oldProject),"2026-08-25T01:00:00.000Z");
  assert.equal(parsed.ok,true);
  assert.equal(parsed.value.currentState,oldProject.current_state);
  assert.equal(parsed.value.currentPhase,"VALIDATION");
  assert.equal(parsed.value.importedMilestones.length,2);
  assert.equal(parsed.value.importedMilestones[0].source,"AI_BOOTSTRAP");
  assert.deepEqual(parsed.value.projectMemory,["店员主要使用手机"]);
  assert.equal(parsed.value.inProgress.length,1);
});

test("没有本地 Session 仍保留已导入历史成果",()=>{
  const snapshot=bootstrap.parseProjectBootstrap(JSON.stringify(oldProject)).value;
  const project={sessions:[],completed:snapshot.completed,importedMilestones:snapshot.importedMilestones};
  assert.equal(project.sessions.length,0);
  assert.deepEqual(project.importedMilestones.map(item=>item.summary),oldProject.completed_milestones);
});

test("缺少明确状态时只依据已有字段生成保守摘要",()=>{
  const parsed=bootstrap.parseProjectBootstrap(JSON.stringify({...oldProject,current_state:"",current_phase:""}));
  assert.equal(parsed.ok,true);
  assert.match(parsed.value.currentState,/已导入 2 项历史成果/);
  assert.doesNotMatch(parsed.value.currentState,/已经上线|全部完成/);
});

test("已知问题不自动等于阻塞",()=>{
  const snapshot=bootstrap.parseProjectBootstrap(JSON.stringify(oldProject)).value;
  assert.deepEqual(snapshot.currentBlockers,[]);
  assert.equal(snapshot.blockerReviewPending,true);
});

test("纯 JSON 与单一 JSON 代码块可解析，普通文本和额外说明被拒绝",()=>{
  assert.equal(bootstrap.parseProjectBootstrap("这是一段说明").ok,false);
  assert.equal(bootstrap.strictJson("```json\n{}\n```").ok,true);
  assert.equal(bootstrap.strictJson("```\n{}\n```").ok,true);
  assert.equal(bootstrap.parseStatusReviewJson("先说明一下：{}").ok,false);
  assert.equal(bootstrap.strictJson("说明\n```json\n{}\n```").ok,false);
});

test("现状总结 JSON 可解析新增进行中与当前阻塞，普通 Markdown 会被拒绝",()=>{
  const raw=JSON.stringify({current_state_summary:"已进入真实验证",completed_milestones:["手机端流程已跑通"],in_progress:["门店连续测试"],active_problems:["误触待验证"],current_blockers:["缺少真实店员"],progress_judgement:{phase:"VALIDATION",reason:"仍需门店测试"},recommended_next_step:"执行 5 次完整点单",optional_next_steps:[],should_stop_or_defer:[],memory_update:["手机端为主要使用场景"]});
  const parsed=bootstrap.parseStatusReviewJson(raw);
  assert.equal(parsed.ok,true);
  assert.equal(parsed.value.progressPhase,"VALIDATION");
  assert.equal(parsed.value.recommendedNextStep,"执行 5 次完整点单");
  assert.deepEqual(parsed.value.inProgress,["门店连续测试"]);
  assert.deepEqual(parsed.value.currentBlockers,["缺少真实店员"]);
  assert.equal(bootstrap.parseStatusReviewJson(`# CURRENT_STATE_SUMMARY\n已进入真实验证`).ok,false);
});

test("X 与解决：X 在导入前只保留一条",()=>{
  assert.deepEqual(bootstrap.dedupeList(["确定下一组单变量对照实验","解决：确定下一组单变量对照实验"]),["确定下一组单变量对照实验"]);
});
