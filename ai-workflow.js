(function () {
  const EMPTY_VALUES=new Set(["无","无。","没有","暂无","未记录","none","n/a"]);
  const list = value => {
    if (Array.isArray(value)) return value.map(item => typeof item === "string" ? item : item?.text || item?.name || JSON.stringify(item)).map(item=>String(item).trim()).filter(item=>item&&!EMPTY_VALUES.has(item.toLowerCase()));
    if (value == null) return [];
    return String(value).split(/\r?\n|；|;|•/).map(item=>item.replace(/^(?:[-*]\s*|\d+[.、)]\s*)/, "").trim()).filter(item=>item&&!EMPTY_VALUES.has(item.toLowerCase()));
  };
  const display = value => list(value).join("\n") || "未记录";
  const displayJa = value => list(value).join("\n") || "未記録";
  const dedupe = value => window.ProjectOSBootstrap?.dedupeList(value) || list(value);
  const dedupeTodos = value => window.ProjectOSBootstrap?.dedupeTodos(value) || value || [];

  function statusReviewIdentityPrefix(projectName,locale="zh-CN") {
    const name=String(projectName||"").trim()||(locale==="ja"?"未記録":"未记录");
    return locale==="ja"?`対象プロジェクト：${name}｜`:`当前项目：${name}｜`;
  }

  function validateStatusReviewIdentity(result,{projectName,locale="zh-CN"}={}) {
    const expectedName=String(projectName||"").trim();
    if(result?.resultType==="PROJECT_UPDATE"||result?.projectName){
      const actualName=String(result?.projectName||"").trim();
      if(!actualName||actualName!==expectedName){
        const name=expectedName||(locale==="ja"?"未記録":"未记录");
        return{ok:false,error:locale==="ja"?`このAI回答の project_name は現在のプロジェクト「${name}」と一致しません。別のプロジェクトや以前の会話の回答を反映できません。`:`这份 AI 回答的 project_name 与当前项目“${name}”不一致，不能把其他项目或旧对话的内容写入当前项目。`};
      }
      return{ok:true,value:{...result,identityProjectName:expectedName,identityPrefix:"project_name"}};
    }
    const prefix=statusReviewIdentityPrefix(projectName,locale);
    const summary=String(result?.currentStateSummary?.[0]||result?.progressSummary?.[0]||"").trim();
    if(!summary.startsWith(prefix)){
      const name=String(projectName||"").trim()||(locale==="ja"?"未記録":"未记录");
      return{ok:false,error:locale==="ja"?`このAI回答は現在のプロジェクト「${name}」と一致しません。別のプロジェクトや以前の会話の回答である可能性があります。新しいプロンプトで生成し直してください。`:`这份 AI 回答与当前项目“${name}”不匹配，可能来自其他项目或旧对话。请使用刚生成的提示词重新生成后再粘贴。`};
    }
    const cleanSummary=summary.slice(prefix.length).trim();
    return{ok:true,value:{...result,currentStateSummary:cleanSummary?[cleanSummary]:[],progressSummary:cleanSummary?[cleanSummary]:[],identityProjectName:String(projectName||"").trim(),identityPrefix:prefix}};
  }

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

  function buildJapaneseAssistancePrompt({ zone, project, session, problem, criteria, recentSessionSummary }) {
    const sessionTodos=dedupeTodos(session?.todos||[]);
    return `あなたは、範囲を厳密に限定した一つのプロジェクトを支援します。同じメインテーマにある他のプロジェクトの非公開メモを読み取ったり、推測して混ぜたりしないでください。

## プロジェクト背景

メインテーマ：${zone?.name||"未記録"}
プロジェクト：${project?.name||"未記録"}
目的：${project?.purpose||"未記録"}
共有を許可した背景：
${displayJa((zone?.sharedMemory||[]).map(item=>typeof item==="string"?item:item?.text))}

## 現在の目標

${project?.goal||"未記録"}

## 現在の状態

${project?.currentState||"未記録"}

## 完了したこと

${displayJa(project?.completed)}

## 進行中

${displayJa(dedupe(project?.inProgress))}

## 現在の問題

${displayJa(dedupe(project?.openIssues))}

明確な阻害要因：
${displayJa((project?.blockers||[]).filter(item=>item.status==="OPEN").map(item=>item.text))}

## 前回の作業

${recentSessionSummary||"完了した作業記録はまだありません"}

## 今回の作業

目標：${session?.goal||"未記録"}
アクション：
${displayJa(sessionTodos.map(todo=>`${todo.completed?"[完了]":"[未完了]"} ${todo.text}`))}

## 今困っていること

${problem||"未記録"}

確認条件：${criteria||"明確で検証できる確認条件を提案してください。"}

まず現在の問題を解くことに集中し、すでに完了した作業を繰り返さないでください。変更案を出す場合は「何を変えるか・なぜか・どう確認するか」を明示してください。

回答の最後に、必ず次の固定セクションを付けてください。

## CURRENT_PROGRESS_SUMMARY

現在地、今回分かったこと、残っている問題を3～8項目で簡潔にまとめてください。内容は日本語にしてください。

## RECOMMENDED_NEXT_STEP

すぐ始められ、結果を確認できる次の一歩を1件だけ日本語で書いてください。

## OPTIONAL_NEXT_STEPS

必要な場合だけ、候補を最大2件。なければ「なし」。

## MEMORY_UPDATE

長期記憶に残す価値のある新しい事実または判断。なければ「なし」。`;
  }

  function buildAssistancePrompt({ zone, project, session, problem, criteria, recentSessionSummary, locale = "zh-CN" }) {
    if(locale==="ja")return buildJapaneseAssistancePrompt({zone,project,session,problem,criteria,recentSessionSummary});
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

  function buildJapaneseStatusReviewPrompt({zone,project,session,recentSessions=[],intent="STATUS_REVIEW"}) {
    const blockers=dedupe((project?.blockers||[]).filter(item=>item.status==="OPEN").map(item=>item.text));
    const todos=dedupeTodos(session?.todos||[]);
    const sessionTodos=todos.map(todo=>`${todo.completed?"[完了]":"[未完了]"} ${todo.text}`);
    const recent=recentSessions.map(item=>typeof item==="string"?item:`${item.endedAt||item.updatedAt||item.startedAt||"日時未記録"}｜${item.summary||item.goal||"要約未記録"}`);
    const request=intent==="WORK_SUMMARY"?"今回の作業内容をまとめ、確認できる事実だけからプロジェクトの現在地を更新する提案を作ってください。":"進行中の一つのプロジェクトについて、現在地を整理してください。";
    return `${request}

同じメインテーマにある他のプロジェクトの非公開メモを読み取ったり、推測して混ぜたりしないでください。プロジェクト全体を勝手に再計画せず、以下の事実だけを使ってください。

## メインテーマ
${zone?.name||"未記録"}

## プロジェクト
${project?.name||"未記録"}

## 目的
${project?.purpose||"未記録"}

## 現在の目標
${project?.goal||"未記録"}

## 現在の状態
${project?.currentState||"未記録"}

## 完了したこと
${displayJa(project?.completed)}

## 進行中
${displayJa(dedupe(project?.inProgress))}

## 現在の問題
${displayJa(dedupe(project?.openIssues))}

## 明確な阻害要因
${displayJa(blockers)}

## 前回までの作業
${displayJa(recent)}

## 今回の作業
目標：${session?.goal||"進行中の作業はありません"}
アクション：
${displayJa(sessionTodos)}
メモ：${session?.notes||"未記録"}

## 次の一歩
${displayJa(dedupe(project?.nextActions))}

## 共有を許可した背景
${displayJa((zone?.sharedMemory||[]).map(item=>typeof item==="string"?item:item?.text))}

JSONの値は日本語で書いてください。次の構造のJSONコードブロックを一つだけ返し、コードブロックの前後に説明や追加フィールドを付けないでください。

プロジェクト識別（必須）：current_state_summary は必ず「${statusReviewIdentityPrefix(project?.name,"ja")}」で始め、その直後に現在の状態を書いてください。この文字列が一致しない回答は、別プロジェクトの混入を防ぐためアプリで拒否されます。
\`\`\`json
{
  "current_state_summary": "",
  "completed_milestones": [],
  "in_progress": [],
  "active_problems": [],
  "current_blockers": [],
  "progress_judgement": { "phase": "", "reason": "" },
  "recommended_next_step": "",
  "optional_next_steps": [],
  "should_stop_or_defer": [],
  "memory_update": []
}
\`\`\`

ルール：
- completed_milestones は、完了・検証・承認・納品の明確な根拠がある項目だけにしてください。推測で完了扱いにしないでください。
- in_progress は開始済みで、まだ完了根拠がない項目だけにしてください。
- active_problems は現在も存在する問題だけにしてください。
- current_blockers は進行を実際に妨げている明確な根拠がある場合だけにし、不明なら空配列にしてください。
- progress_judgement.phase は IDEA、EXPLORATION、PROTOTYPE、VALIDATION、STABILIZATION、DELIVERY、PAUSED のいずれか。不明なら空文字列にしてください。
- recommended_next_step は、具体的・実行可能・検証可能な1件だけにしてください。
- optional_next_steps は最大2件です。
- 進捗を捏造せず、不明な内容は空文字列または空配列にしてください。`;
  }

  const STATUS_REVIEW_JSON_SCHEMA=[
    '```json',
    '{',
    '  "current_state_summary": "",',
    '  "completed_milestones": [],',
    '  "in_progress": [],',
    '  "active_problems": [],',
    '  "current_blockers": [],',
    '  "progress_judgement": { "phase": "", "reason": "" },',
    '  "recommended_next_step": "",',
    '  "optional_next_steps": [],',
    '  "should_stop_or_defer": [],',
    '  "memory_update": []',
    '}',
    '```'
  ].join('\n');

  const PROJECT_UPDATE_JSON_SCHEMA=[
    '```json',
    '{',
    '  "project_name": "",',
    '  "project_purpose": "",',
    '  "current_goal": "",',
    '  "current_state": "",',
    '  "current_phase": "",',
    '  "completed_milestones": [],',
    '  "in_progress": [],',
    '  "open_issues": [],',
    '  "current_blockers": [],',
    '  "recommended_next_step": "",',
    '  "key_decisions": [],',
    '  "constraints": [],',
    '  "assets": [],',
    '  "important_context": [],',
    '  "parking_lot": []',
    '}',
    '```'
  ].join('\n');

  function isSameWorkItem(left,right) {
    const a=String(left||'').trim();
    const b=String(right||'').trim();
    if(!a||!b)return false;
    return window.ProjectOSPlanning?.isHighlySimilar?.(a,b)??a===b;
  }

  function workSummaryEvidence(project,session) {
    const todos=dedupeTodos(session?.todos||[]);
    const todoCompleted=todos.filter(todo=>todo.completed).map(todo=>todo.text);
    const todoRemaining=todos.filter(todo=>!todo.completed).map(todo=>todo.text);
    const contribution=session?.formalContributions||{};
    const completed=dedupe([...todoCompleted,...list(contribution.completed)]);
    const baselineInProgress=dedupe(project?.inProgress).filter(item=>!completed.some(done=>isSameWorkItem(item,done)));
    const baselineNext=dedupe(project?.nextActions).filter(item=>!completed.some(done=>isSameWorkItem(item,done)));
    const inProgressCandidates=dedupe([...todoRemaining,...baselineInProgress]);
    const notes=String(session?.notes||'').trim();
    const confirmedState=String(contribution.currentStateAfter||'').trim();
    const confirmedCompleted=dedupe(contribution.completed);
    const confirmedNext=dedupe(contribution.nextActions);
    const confirmedIssues=dedupe(contribution.openIssues);
    const hasEvidence=Boolean(completed.length||notes||confirmedState||confirmedNext.length||confirmedIssues.length);
    return{completed,todoRemaining,inProgressCandidates,baselineNext,notes,confirmedState,confirmedCompleted,confirmedNext,confirmedIssues,hasEvidence};
  }

  function buildChineseWorkSummaryPrompt({zone,project,session}) {
    const evidence=workSummaryEvidence(project,session);
    const blockers=dedupe((project?.blockers||[]).filter(item=>item.status==='OPEN').map(item=>item.text));
    const evidenceStatus=evidence.hasEvidence
      ?'已记录本次证据。只能把下列证据明确支持的变化写入更新建议。'
      :'证据不足：没有已勾选完成项、本次工作笔记或本 Session 内已人工确认的变化。不得虚构新进展、完成项、记忆或阶段提升。';
    return [
      '请根据当前 Session 的真实证据，重新整理“当前项目更新后的完整档案”。这不是创建新项目，也不是只写一段工作摘要。',
      '',
      '输出协议优先级最高：这是 CURRENT_PROJECT_UPDATE，不是状态审查结构。必须返回 project_name、project_purpose、current_goal、current_state 等下方全部字段；禁止返回 current_state_summary、active_problems、progress_judgement、optional_next_steps、should_stop_or_defer、memory_update。',
      '',
      '只整理当前次级项目。不要读取、推断或混入同一主任务下其他项目的私有记忆，不要把历史成果冒充为本次新成果。',
      '',
      '## 判断顺序',
      '',
      '1. 先读“本次可核对证据”。',
      '2. 再用“更新前项目基线”生成更新后的完整项目快照：保留仍有效的旧事实，加入本次有证据的新事实，移除已有解决证据的旧问题和已经完成的进行中事项。',
      '3. 未完成行动不是完成证据；计划、建议、暂存事项和旧历史也不是完成证据。',
      '4. 工作发生在 Codex、编辑器或浏览器外部时，只有写入本次工作笔记的修改文件、测试结果、验收结果或明确事实才能作为证据。',
      '5. 如果证据不足，原样保留项目目的、目标、状态、阶段、完成项、问题、阻塞、决策、约束、资产和长期上下文，不得用常识补全。',
      '6. “本次工作笔记”中明确写出的交付物、版本拆分、测试结果、安装包、Skill/流程不足等，都属于应优先整理的本次事实；不要因为它们不在旧 Todo 中就忽略。',
      '',
      '## 当前项目身份',
      '',
      '主任务：'+(zone?.name||'未记录'),
      '次级项目：'+(project?.name||'未记录'),
      '项目目的：'+(project?.purpose||'未记录'),
      '本次目标：'+(session?.goal||'未记录'),
      '',
      '## 本次可核对证据（最高优先级）',
      '',
      '证据状态：'+evidenceStatus,
      '',
      '本次已勾选完成的行动：',
      display(evidence.completed),
      '',
      '本次工作笔记：',
      evidence.notes||'未记录',
      '',
      '本次尚未完成的行动：',
      display(evidence.todoRemaining),
      '',
      '本 Session 内已经人工确认写回的变化（已经写入，不要重复新增）：',
      '当前状态：'+(evidence.confirmedState||'未记录'),
      '已完成：\n'+display(evidence.confirmedCompleted),
      '下一步：\n'+display(evidence.confirmedNext),
      '问题：\n'+display(evidence.confirmedIssues),
      '',
      '## 更新前项目基线（只用于比较和保留，不是本次成果）',
      '',
      '当前状态：'+(project?.currentState||'未记录'),
      '当前阶段：'+(project?.currentPhase||'未记录'),
      '已有完成成果（完整快照中应保留，除非有明确纠错证据）：\n'+display(project?.completed),
      '更新后仍在进行的候选项：\n'+display(evidence.inProgressCandidates),
      '当前问题：\n'+display(dedupe(project?.openIssues)),
      '当前阻塞：\n'+display(blockers),
      '现有下一步（已过滤本次明确完成项）：\n'+display(evidence.baselineNext),
      '关键决策：\n'+display(project?.decisions),
      '约束：\n'+display(project?.constraints),
      '相关资产：\n'+display(project?.assets),
      '项目私有长期上下文：\n'+display((project?.projectMemory||[]).map(item=>typeof item==='string'?item:item?.text)),
      '项目暂存区：\n'+display(project?.parkingLot),
      '',
      '## 输出字段含义',
      '',
      '- project_name：必须与当前次级项目名称完全一致，用于阻止串项目。',
      '- project_purpose、current_goal：返回更新后的完整值；没有改变证据时保留原值。',
      '- current_state：用一到三句话说明本次工作后项目真正到达哪里，必须吸收本次笔记中的重要完成事实，不能只复述旧状态。',
      '- current_phase：只能写 IDEA、EXPLORATION、PROTOTYPE、VALIDATION、STABILIZATION、DELIVERY 或 PAUSED；没有阶段变化证据时保留原阶段。',
      '- completed_milestones：返回更新后的完整已完成列表，包含仍有效的历史成果和本次有证据的新成果；不得把未完成计划写入。',
      '- in_progress：返回更新后仍在进行的完整列表；本次已完成项必须移除。',
      '- open_issues：返回更新后仍真实存在的完整问题列表；有明确解决证据的旧问题应移除。',
      '- current_blockers：只列仍明确阻碍推进的问题；一般不足放 open_issues。',
      '- recommended_next_step：只给一个尚未完成、可以立即开始且有核对结果的动作。',
      '- key_decisions、constraints、assets、important_context、parking_lot：都返回更新后的完整列表；保留仍有效旧项，只添加有证据的新项。',
      '',
      '只返回一个 JSON 代码块，不要正文解释，不要在代码块前后写任何内容，也不要增加字段。',
      '',
      '项目身份校验（必须遵守）：project_name 必须准确写为“'+(project?.name||'未记录')+'”。应用会拒绝其他项目名称。',
      PROJECT_UPDATE_JSON_SCHEMA,
      '',
      '若本次证据不足：完整返回原有项目档案，不得添加新完成项、新资产、新记忆或提高 current_phase。'
    ].join('\n');
  }

  function buildJapaneseWorkSummaryPrompt({zone,project,session}) {
    const evidence=workSummaryEvidence(project,session);
    const blockers=dedupe((project?.blockers||[]).filter(item=>item.status==='OPEN').map(item=>item.text));
    const evidenceStatus=evidence.hasEvidence
      ?'今回の証拠が記録されています。以下の証拠が明確に裏付ける変更だけを提案してください。'
      :'証拠不足：完了チェック、今回のメモ、または今回の作業内で人が確認して反映した変更がありません。進捗、完了、記憶、段階の上昇を推測しないでください。';
    return [
      '今回の作業にある確かな証拠を使い、「更新後の現在のプロジェクト全体」を整理してください。新規プロジェクトの作成でも、短い作業要約だけでもありません。',
      '',
      '出力契約を最優先します。これは CURRENT_PROJECT_UPDATE です。project_name、project_purpose、current_goal、current_state など、下記の全フィールドを返してください。current_state_summary、active_problems、progress_judgement、optional_next_steps、should_stop_or_defer、memory_update は返さないでください。',
      '',
      '対象はこのプロジェクトだけです。同じメインテーマにある他のプロジェクトの非公開メモを読み取ったり、推測して混ぜたりしないでください。過去の成果を今回の新しい成果として扱わないでください。',
      '',
      '## 判断の順序',
      '',
      '1. 最初に「今回確認できる証拠」を読みます。',
      '2. 次に「更新前の基準」と比較し、今も有効な既存情報を保持し、今回の証拠を追加し、解決済みの問題と完了済みの進行項目を除いた完全な更新後スナップショットを作ります。',
      '3. 未完了のアクション、予定、提案、一時メモ、過去履歴は完了の証拠ではありません。',
      '4. Codex、エディタ、ブラウザなどアプリ外で行った作業は、今回のメモに記録された変更ファイル、テスト結果、確認結果、明確な事実だけを証拠にしてください。',
      '5. 証拠が足りない場合、目的、目標、状態、段階、完了、問題、阻害要因、判断、制約、資産、長期情報を保持し、推測で補わないでください。',
      '6. 今回のメモに明記された成果物、版の分割、テスト結果、導入パッケージ、Skillや手順の不足は優先して整理する事実です。旧Todoに無いという理由で無視しないでください。',
      '',
      '## 対象プロジェクト',
      '',
      'メインテーマ：'+(zone?.name||'未記録'),
      'プロジェクト：'+(project?.name||'未記録'),
      '目的：'+(project?.purpose||'未記録'),
      '今回の目標：'+(session?.goal||'未記録'),
      '',
      '## 今回確認できる証拠（最優先）',
      '',
      '証拠の状態：'+evidenceStatus,
      '',
      '今回完了にしたアクション：',
      displayJa(evidence.completed),
      '',
      '今回のメモ：',
      evidence.notes||'未記録',
      '',
      '今回まだ完了していないアクション：',
      displayJa(evidence.todoRemaining),
      '',
      '今回の作業内ですでに人が確認して反映した変更（再追加しない）：',
      '現在の状態：'+(evidence.confirmedState||'未記録'),
      '完了：\n'+displayJa(evidence.confirmedCompleted),
      '次の一歩：\n'+displayJa(evidence.confirmedNext),
      '問題：\n'+displayJa(evidence.confirmedIssues),
      '',
      '## 更新前の基準（比較と保持のためだけに使用）',
      '',
      '現在の状態：'+(project?.currentState||'未記録'),
      '現在の段階：'+(project?.currentPhase||'未記録'),
      '既存の完了成果（完全な更新後スナップショットに保持する）：\n'+displayJa(project?.completed),
      '更新後も進行中となる候補：\n'+displayJa(evidence.inProgressCandidates),
      '現在の問題：\n'+displayJa(dedupe(project?.openIssues)),
      '現在の阻害要因：\n'+displayJa(blockers),
      '既存の次の一歩（今回明確に完了した項目を除外）：\n'+displayJa(evidence.baselineNext),
      '重要な判断：\n'+displayJa(project?.decisions),
      '制約：\n'+displayJa(project?.constraints),
      '関連資産：\n'+displayJa(project?.assets),
      'プロジェクト固有の長期情報：\n'+displayJa((project?.projectMemory||[]).map(item=>typeof item==='string'?item:item?.text)),
      '一時メモ：\n'+displayJa(project?.parkingLot),
      '',
      '## 出力フィールド',
      '',
      '- project_name：現在のプロジェクト名と完全一致させ、混在を防ぎます。',
      '- project_purpose、current_goal：更新後の完全な値。変更の証拠がなければ既存値を保持します。',
      '- current_state：今回の作業後に実際どこまで到達したかを1〜3文で表し、今回のメモにある重要な成果を反映します。',
      '- current_phase：IDEA、EXPLORATION、PROTOTYPE、VALIDATION、STABILIZATION、DELIVERY、PAUSED のいずれか。段階変更の証拠がなければ既存段階を保持します。',
      '- completed_milestones：既存の有効な成果と今回の証拠がある新成果を含む、更新後の完全な一覧。未完了予定は含めません。',
      '- in_progress：更新後も進行中の完全な一覧。完了した項目を除きます。',
      '- open_issues：更新後も存在する問題の完全な一覧。解決証拠がある問題は除きます。',
      '- current_blockers：現在も明確に進行を妨げるものだけ。一般的な不足は open_issues に入れます。',
      '- recommended_next_step：未完了で、すぐ着手でき、結果を確認できる一件だけ。',
      '- key_decisions、constraints、assets、important_context、parking_lot：有効な既存項目を保持し、証拠がある新項目を加えた完全な一覧。',
      '',
      'JSONコードブロックを一つだけ返し、前後の説明や追加フィールドを付けないでください。値は日本語にしてください。',
      '',
      'プロジェクト識別（必須）：project_name は必ず「'+(project?.name||'未記録')+'」と正確に記載してください。別名はアプリが拒否します。',
      PROJECT_UPDATE_JSON_SCHEMA,
      '',
      '今回の証拠が不足している場合：既存の完全なプロジェクト情報を返し、新しい完了、資産、記憶を追加せず、current_phase を上げないでください。'
    ].join('\n');
  }

  function buildStatusReviewPrompt({zone,project,session,recentSessions=[],locale="zh-CN",intent="STATUS_REVIEW"}) {
    if(intent==="WORK_SUMMARY")return locale==="ja"?buildJapaneseWorkSummaryPrompt({zone,project,session}):buildChineseWorkSummaryPrompt({zone,project,session});
    if(locale==="ja")return buildJapaneseStatusReviewPrompt({zone,project,session,recentSessions,intent});
    const blockers=dedupe((project?.blockers||[]).filter(item=>item.status==="OPEN").map(item=>item.text));
    const todos=dedupeTodos(session?.todos||[]);
    const sessionTodos=todos.map(todo=>`${todo.completed?"[已完成]":"[未完成]"} ${todo.text}`);
    const completedTodos=todos.filter(todo=>todo.completed).map(todo=>todo.text);
    const recent=recentSessions.map(item=>typeof item==="string"?item:`${item.endedAt||item.updatedAt||item.startedAt||"时间未记录"}｜${item.summary||item.goal||"未记录摘要"}`);
    const request=intent==="WORK_SUMMARY"?"请总结本次工作，并仅依据可核对的事实提出项目状态更新建议。":"你正在帮助我审查一个正在进行中的项目。";
    return `${request}

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

项目身份校验（必须遵守）：current_state_summary 必须以“${statusReviewIdentityPrefix(project?.name,"zh-CN")}”开头，随后再写当前状态。应用会拒绝不含这个准确前缀的回答，避免其他项目或旧对话内容混入。
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

  window.ProjectOSAIWorkflow={parseAIResult,buildAssistancePrompt,buildStatusReviewPrompt,statusReviewIdentityPrefix,validateStatusReviewIdentity,sectionFromText,parseJsonFromText};
})();
