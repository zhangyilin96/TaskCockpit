(function () {
  const EMPTY_VALUES=new Set(["无","无。","没有","暂无","未记录","none","n/a"]);
  const list = value => {
    if (Array.isArray(value)) return value.map(item => typeof item === "string" ? item : item?.text || item?.name || JSON.stringify(item)).map(item=>String(item).trim()).filter(item=>item&&!EMPTY_VALUES.has(item.toLowerCase()));
    if (value == null) return [];
    return String(value).split(/\r?\n|；|;|•/).map(item=>item.replace(/^[-*\d.、\s]+/, "").trim()).filter(item=>item&&!EMPTY_VALUES.has(item.toLowerCase()));
  };
  const display = value => list(value).join("\n") || "未记录";
  const dedupe = value => window.ProjectOSBootstrap?.dedupeList(value) || list(value);
  const dedupeTodos = value => window.ProjectOSBootstrap?.dedupeTodos(value) || value || [];

  function parseJsonFromText(raw) {
    const source=String(raw||"").trim();
    const fenced=source.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates=[fenced?.[1],source].filter(Boolean);
    for(const candidate of candidates){try{return JSON.parse(candidate)}catch{}}
    const object=source.match(/\{[\s\S]*\}/);
    if(object){try{return JSON.parse(object[0])}catch{}}
    return null;
  }

  function sectionFromText(raw, headings) {
    const names=headings.map(name=>String(name).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");
    const pattern=new RegExp(`(?:^|\\n)#{0,3}\\s*(?:${names})\\s*:?[ \\t]*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s*[A-Z_\\u4e00-\\u9fff]|$)`,"i");
    return raw.match(pattern)?.[1]?.trim()||"";
  }

  function parseAIResult(raw) {
    const source=String(raw||"");
    const json=parseJsonFromText(source)||{};
    const pick=(keys,headings)=>{for(const key of keys)if(json[key]!=null)return list(json[key]);return list(sectionFromText(source,headings))};
    const pickText=(keys,headings)=>{for(const key of keys)if(json[key]!=null)return list(json[key]).join("；");return list(sectionFromText(source,headings)).join("；")};
    const recommendedNextStep=pickText(["RECOMMENDED_NEXT_STEP","recommendedNextStep","nextStep"],["RECOMMENDED_NEXT_STEP","推荐下一步"]);
    const currentStateSummary=pick(["CURRENT_STATE_SUMMARY","currentStateSummary"],["CURRENT_STATE_SUMMARY","当前状态总结"]);
    const activeProblems=pick(["ACTIVE_PROBLEMS","activeProblems"],["ACTIVE_PROBLEMS","当前问题","活跃问题"]);
    const progressSummary=currentStateSummary.length?currentStateSummary:pick(["CURRENT_PROGRESS_SUMMARY","currentProgressSummary","progressSummary"],["CURRENT_PROGRESS_SUMMARY","当前进度总结"]);
    const remainingIssues=pick(["REMAINING_ISSUES","remainingIssues","openIssues"],["REMAINING_ISSUES","遗留问题"]);
    return {
      raw:source,
      resultType:currentStateSummary.length||activeProblems.length?"STATUS_REVIEW":"HELP",
      completed:pick(["COMPLETED_MILESTONES","completedMilestones","COMPLETED","completed"],["COMPLETED_MILESTONES","COMPLETED","已完成里程碑","已完成"]),
      changes:pick(["CHANGES","changes"],["CHANGES","变化"]),
      verification:pick(["VERIFICATION","verification"],["VERIFICATION","验证"]),
      discoveries:pick(["DISCOVERIES","discoveries"],["DISCOVERIES","发现","新发现"]),
      decisions:pick(["NEW_DECISIONS","newDecisions","decisions"],["NEW_DECISIONS","新决定"]),
      activeProblems,
      remainingIssues,
      currentStateSummary,
      progressSummary,
      progressJudgement:pickText(["PROGRESS_JUDGEMENT","progressJudgement"],["PROGRESS_JUDGEMENT","进度判断"]),
      recommendedNextStep,
      nextStep:recommendedNextStep,
      optionalNextSteps:pick(["OPTIONAL_NEXT_STEPS","optionalNextSteps"],["OPTIONAL_NEXT_STEPS","可选下一步"]),
      shouldStopOrDefer:pick(["SHOULD_STOP_OR_DEFER","shouldStopOrDefer"],["SHOULD_STOP_OR_DEFER","建议停止或推迟"]),
      memoryUpdates:pick(["MEMORY_UPDATE","MEMORY_UPDATES","memoryUpdate","memoryUpdates"],["MEMORY_UPDATE","MEMORY_UPDATES","记忆更新","建议写入记忆"])
    };
  }

  function buildAssistancePrompt({ zone, project, session, problem, criteria, recentSessionSummary }) {
    const sessionTodos=dedupeTodos(session?.todos||[]);
    return `你正在协助一个严格限定范围的次级项目。不要读取、推断或混入同一主任务下其他项目的私有记忆。

## 1. 项目背景

主任务：${zone?.name||"未记录"}
次级项目：${project?.name||"未记录"}
项目目的：${project?.purpose||"未记录"}
主任务共享背景：
${display((zone?.sharedMemory||[]).map(item=>typeof item==="string"?item:item?.text))}

## 2. 当前目标

${project?.goal||"未记录"}

## 3. 当前状态

${project?.currentState||"未记录"}

## 4. 已完成

${display(project?.completed)}

## 5. 当前进行中

${display(dedupe(project?.inProgress))}

## 6. 已知问题

${display(dedupe(project?.openIssues))}

当前明确阻塞：
${display((project?.blockers||[]).filter(item=>item.status==="OPEN").map(item=>item.text))}

## 7. 关键决策

${display(project?.decisions)}

## 8. 约束

${display(project?.constraints)}

## 9. 最近一次工作

${recentSessionSummary||"尚无已结束工作记录"}

## 10. 本次 Session

本次目标：${session?.goal||"未记录"}
本次行动：
${display(sessionTodos.map(todo=>`${todo.completed?"[已完成]":"[未完成]"} ${todo.text}`))}

## 11. 用户当前卡点

${problem||"未记录"}

验收标准：${criteria||"请提出清晰、可验证的验收标准。"}

## 12. 本次请求

请先帮助我解决当前卡点，不要重复已经完成的工作。
如果需要修改方案，请明确说明：
- 修改什么
- 为什么
- 如何验证

完成本次分析或执行后，请务必在回答末尾附加以下固定结构：

## CURRENT_PROGRESS_SUMMARY

用 3～8 条简洁总结：当前项目已经做到什么程度、本次解决了什么、目前还剩什么问题。

## RECOMMENDED_NEXT_STEP

只给 1 个最推荐的下一步。必须足够具体、可以直接开始并带有可核对结果；不要写“继续优化”一类空话。

## OPTIONAL_NEXT_STEPS

如有必要，最多给 2 个备选动作；没有则写“无”。

## MEMORY_UPDATE

列出本轮值得写入长期项目记忆的新事实或决策；没有则写“无”。`;
  }

  function buildStatusReviewPrompt({zone,project,session,recentSessions=[]}) {
    const blockers=dedupe((project?.blockers||[]).filter(item=>item.status==="OPEN").map(item=>item.text));
    const todos=dedupeTodos(session?.todos||[]);
    const sessionTodos=todos.map(todo=>`${todo.completed?"[已完成]":"[未完成]"} ${todo.text}`);
    const completedTodos=todos.filter(todo=>todo.completed).map(todo=>todo.text);
    const recent=recentSessions.map(item=>typeof item==="string"?item:`${item.endedAt||item.updatedAt||item.startedAt||"时间未记录"}｜${item.summary||item.goal||"未记录摘要"}`);
    return `你正在帮助我审查一个正在进行中的项目。

请不要直接重新规划整个项目，也不要读取、推断或混入同一主任务下其他项目的私有记忆。

请基于以下真实项目状态，判断：

1. 当前项目已经做到什么程度
2. 目前最重要的进展是什么
3. 当前还剩哪些明确问题
4. 有没有明显重复、偏航或不再值得继续的工作
5. 下一步最值得做什么

---

## 主任务

${zone?.name||"未记录"}

## 次级项目

${project?.name||"未记录"}

## 项目目的

${project?.purpose||"未记录"}

## 当前目标

${project?.goal||"未记录"}

## 当前状态

${project?.currentState||"未记录"}

## 已完成

${display(project?.completed)}

## 正在进行

${display(dedupe(project?.inProgress))}

## 当前阻塞

${display(blockers)}

## 已知问题

${display(dedupe(project?.openIssues))}

## 关键决策

${display(project?.decisions)}

## 约束

${display(project?.constraints)}

## 最近工作历史

${display(recent)}

## 当前 Session

本次目标：${session?.goal||"当前没有进行中的 Session"}
本次行动：
${display(sessionTodos)}
本次已完成 Todo：
${display(completedTodos)}

## 本次工作笔记

${session?.notes||"未记录"}

## 暂存区

${display(project?.parkingLot)}

## 下一步行动

${display(dedupe(project?.nextActions))}

## 相关资产

${display(project?.assets)}

## 主任务允许共享的背景

${display((zone?.sharedMemory||[]).map(item=>typeof item==="string"?item:item?.text))}

---

只返回一个 JSON 代码块，不要正文解释，不要在代码块前后写任何内容，也不要额外增加字段。严格使用以下结构：
\`\`\`json
{
  "current_state_summary": "",
  "completed_milestones": [],
  "in_progress": [],
  "active_problems": [],
  "current_blockers": [],
  "progress_judgement": {
    "phase": "",
    "reason": ""
  },
  "recommended_next_step": "",
  "optional_next_steps": [],
  "should_stop_or_defer": [],
  "memory_update": []
}
\`\`\`

规则：
- current_state_summary 用简洁自然语言说明项目现在究竟处于什么阶段。
- 只有上下文中有明确完成、验证、通过或交付证据的事项，才能进入 completed_milestones。如果无法确认完成状态，请放入 in_progress 或 active_problems，不得推测完成。
- in_progress 只列已经开始但尚未有明确完成证据的事项。
- active_problems 只列仍然真实存在的问题，不要重复已经解决的问题。
- current_blockers 只列有明确证据正在阻碍推进的问题；不能确认时返回空数组。
- progress_judgement.phase 只能写 IDEA、EXPLORATION、PROTOTYPE、VALIDATION、STABILIZATION、DELIVERY 或 PAUSED；信息不足时写空字符串。
- recommended_next_step 只给 1 个具体、可执行、可验证的动作，不要写“继续优化”或“进一步测试”。
- optional_next_steps 最多 2 项。
- should_stop_or_defer 没有则返回空数组。
- memory_update 只包含值得写入长期项目记忆的新事实或决策；没有则返回空数组。
- 不得虚构进度；不确定就使用空字符串或空数组。`;
  }

  window.ProjectOSAIWorkflow={parseAIResult,buildAssistancePrompt,buildStatusReviewPrompt,sectionFromText,parseJsonFromText};
})();
