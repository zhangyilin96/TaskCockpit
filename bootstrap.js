(function () {
  const EMPTY_VALUES=new Set(["","无","无。","没有","暂无","未记录","none","n/a","null"]);
  const PHASE_LABELS=Object.freeze({
    IDEA:"构想阶段",EXPLORATION:"探索阶段",PROTOTYPE:"原型阶段",VALIDATION:"验证阶段",
    STABILIZATION:"稳定化阶段",DELIVERY:"可交付阶段",PAUSED:"暂停 / 待重新评估"
  });
  const PHASE_ALIASES=Object.freeze({
    "构想":"IDEA","构想阶段":"IDEA","idea":"IDEA",
    "探索":"EXPLORATION","探索阶段":"EXPLORATION","exploration":"EXPLORATION",
    "原型":"PROTOTYPE","原型阶段":"PROTOTYPE","prototype":"PROTOTYPE",
    "验证":"VALIDATION","验证阶段":"VALIDATION","validation":"VALIDATION",
    "稳定化":"STABILIZATION","稳定化阶段":"STABILIZATION","stabilization":"STABILIZATION",
    "可交付":"DELIVERY","可交付阶段":"DELIVERY","delivery":"DELIVERY",
    "暂停":"PAUSED","暂停 / 待重新评估":"PAUSED","暂停/待重新评估":"PAUSED","paused":"PAUSED"
  });

  const cleanText=value=>String(value??"").trim();
  function asList(value) {
    const source=Array.isArray(value)?value:value==null?[]:String(value).split(/\r?\n|；|;|•/);
    return source.map(item=>{
      if(typeof item==="string")return item.replace(/^[-*\d.、\s]+/,"").trim();
      return cleanText(item?.summary||item?.text||item?.name||"");
    }).filter(item=>item&&!EMPTY_VALUES.has(item.toLowerCase()));
  }
  function dedupeList(values=[]) {
    const planning=window.ProjectOSPlanning;
    if(planning?.dedupeItems)return planning.dedupeItems(asList(values));
    const seen=[];
    return asList(values).filter(value=>{
      const key=value.replace(/^\s*(?:解决|处理|完成|继续|下一步)\s*[：:]\s*/i,"").replace(/[\s\p{P}\p{S}]+/gu,"").toLowerCase();
      if(!key||seen.some(item=>item===key||item.includes(key)||key.includes(item)))return false;
      seen.push(key);return true;
    });
  }
  function dedupeTodos(todos=[]) {
    return window.ProjectOSPlanning?.dedupeTodos?window.ProjectOSPlanning.dedupeTodos(todos):dedupeList(todos.map(todo=>typeof todo==="string"?todo:todo?.text)).map(text=>({text,completed:false}));
  }
  function strictJson(raw) {
    const source=cleanText(raw);
    if(!source)return{ok:false,error:"请先粘贴 AI 返回的 JSON。"};
    const fenced=source.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i);
    const jsonSource=fenced?fenced[1].trim():source;
    try{
      const value=JSON.parse(jsonSource);
      if(!value||Array.isArray(value)||typeof value!=="object")return{ok:false,error:"AI 返回结果必须是一个 JSON 对象。"};
      return{ok:true,value};
    }catch{
      return{ok:false,error:"无法解析：请粘贴纯 JSON 或单独一个 JSON 代码块，不要包含前后说明。"};
    }
  }
  function pick(source,...keys){for(const key of keys)if(source[key]!=null)return source[key];return undefined}
  function normalizePhase(value) {
    const source=cleanText(value);
    if(!source)return"";
    const upper=source.toUpperCase();
    if(PHASE_LABELS[upper])return upper;
    return PHASE_ALIASES[source]||PHASE_ALIASES[source.toLowerCase()]||"";
  }
  function inferPhase({currentState="",completed=[],inProgress=[],recommendedNextStep=""}={}) {
    const source=`${currentState} ${completed.join(" ")} ${inProgress.join(" ")} ${recommendedNextStep}`;
    if(/暂停|搁置|重新评估/.test(source))return"PAUSED";
    if(/交付|上线|发布|安装包|正式版本/.test(source))return"DELIVERY";
    if(/稳定|兼容|回归|性能|可靠/.test(source))return"STABILIZATION";
    if(/验证|测试|复盘|数据|真实场景/.test(source))return"VALIDATION";
    if(/原型|demo|第一版|跑通|可运行/i.test(source))return"PROTOTYPE";
    if(/调研|探索|尝试|方案/.test(source))return"EXPLORATION";
    if(/构想|想法|待启动/.test(source))return"IDEA";
    return"";
  }
  function deriveState({currentState,completed,inProgress,openIssues,recommendedNextStep}) {
    if(cleanText(currentState))return{value:cleanText(currentState),source:"explicit"};
    const parts=[];
    if(completed.length)parts.push(`已导入 ${completed.length} 项历史成果，最近确认：${completed.at(-1)}。`);
    if(inProgress.length)parts.push(`当前正在推进：${inProgress.slice(0,2).join("；")}。`);
    if(openIssues.length)parts.push(`仍有 ${openIssues.length} 个当前问题待处理或确认。`);
    if(recommendedNextStep)parts.push(`已记录下一步候选：${recommendedNextStep}。`);
    return{value:parts.join("")||"现有信息不足，需要确认项目状态",source:parts.length?"derived":"insufficient"};
  }
  function makeImportedMilestones(values,importedAt=new Date().toISOString(),original=[]) {
    const originalByText=new Map((Array.isArray(original)?original:[]).map(item=>[cleanText(item?.summary||item?.text),item]));
    return dedupeList(values).map((summary,index)=>{
      const prior=originalByText.get(summary)||{};
      return{...prior,id:prior.id||`imported-${importedAt.replace(/\D/g,"")}-${index+1}`,summary,source:"AI_BOOTSTRAP",importedAt:prior.importedAt||importedAt,originalDate:prior.originalDate||null};
    });
  }
  function parseProjectBootstrap(raw,importedAt=new Date().toISOString()) {
    const parsed=strictJson(raw);if(!parsed.ok)return parsed;
    const json=parsed.value;
    const completed=dedupeList(pick(json,"completed_milestones","COMPLETED_MILESTONES","completed","COMPLETED"));
    const inProgress=dedupeList(pick(json,"in_progress","IN_PROGRESS"));
    const openIssues=dedupeList(pick(json,"open_issues","OPEN_ISSUES","known_issues","KNOWN_ISSUES"));
    const currentBlockers=dedupeList(pick(json,"current_blockers","CURRENT_BLOCKERS"));
    const recommendedNextStep=cleanText(pick(json,"recommended_next_step","RECOMMENDED_NEXT_STEP"))||dedupeList(pick(json,"next_actions","NEXT_ACTIONS"))[0]||"";
    const state=deriveState({currentState:pick(json,"current_state","CURRENT_STATE","currentState"),completed,inProgress,openIssues,recommendedNextStep});
    const currentPhase=normalizePhase(pick(json,"current_phase","CURRENT_PHASE"))||inferPhase({currentState:state.value,completed,inProgress,recommendedNextStep});
    const currentGoal=cleanText(pick(json,"current_goal","CURRENT_GOAL","goal"))||"现有信息不足，需要确认当前目标";
    const nextActions=dedupeList([recommendedNextStep,...asList(pick(json,"next_actions","NEXT_ACTIONS"))]);
    const importantContext=dedupeList(pick(json,"important_context","IMPORTANT_CONTEXT","project_memory","PROJECT_MEMORY"));
    const snapshot={
      kind:"project",parsed:true,name:cleanText(pick(json,"project_name","PROJECT_NAME","name")),purpose:cleanText(pick(json,"project_purpose","PROJECT_PURPOSE","purpose")),
      goal:currentGoal,currentState:state.value,currentPhase,completed,importedMilestones:makeImportedMilestones(completed,importedAt),inProgress,openIssues,
      currentBlockers,recommendedNextStep,nextActions,decisions:dedupeList(pick(json,"key_decisions","KEY_DECISIONS")),constraints:dedupeList(pick(json,"constraints","CONSTRAINTS")),
      assets:dedupeList(pick(json,"assets","ASSETS")),importantContext,projectMemory:importantContext,parkingLot:dedupeList(pick(json,"parking_lot","PARKING_LOT")),
      blockerReviewPending:openIssues.length>0&&currentBlockers.length===0,
      snapshotMeta:{source:"AI_BOOTSTRAP",importedAt,stateSource:state.source},bootstrapJson:JSON.stringify(json,null,2)
    };
    return{ok:true,value:snapshot};
  }
  function parseStatusReviewJson(raw) {
    const parsed=strictJson(raw);if(!parsed.ok)return parsed;
    const json=parsed.value;
    const judgement=pick(json,"progress_judgement","PROGRESS_JUDGEMENT")||{};
    const phase=normalizePhase(typeof judgement==="object"?judgement.phase:"");
    const reason=cleanText(typeof judgement==="object"?judgement.reason:judgement);
    const currentStateSummary=cleanText(pick(json,"current_state_summary","CURRENT_STATE_SUMMARY"));
    const recommendedNextStep=cleanText(pick(json,"recommended_next_step","RECOMMENDED_NEXT_STEP"));
    const knownKeys=["current_state_summary","completed_milestones","in_progress","active_problems","current_blockers","progress_judgement","recommended_next_step","optional_next_steps","should_stop_or_defer","memory_update"];
    if(!knownKeys.some(key=>Object.prototype.hasOwnProperty.call(json,key)))return{ok:false,error:"JSON 中没有识别到现状总结字段，请使用状态审查提示词要求的结构。"};
    return{ok:true,value:{
      raw:cleanText(raw),resultType:"STATUS_REVIEW",currentStateSummary:currentStateSummary?[currentStateSummary]:[],progressSummary:currentStateSummary?[currentStateSummary]:[],
      completed:dedupeList(pick(json,"completed_milestones","COMPLETED_MILESTONES")),inProgress:dedupeList(pick(json,"in_progress","IN_PROGRESS")),activeProblems:dedupeList(pick(json,"active_problems","ACTIVE_PROBLEMS")),currentBlockers:dedupeList(pick(json,"current_blockers","CURRENT_BLOCKERS")),remainingIssues:[],
      progressJudgement:[phase?PHASE_LABELS[phase]:"",reason].filter(Boolean).join("："),progressPhase:phase,recommendedNextStep,nextStep:recommendedNextStep,
      optionalNextSteps:dedupeList(pick(json,"optional_next_steps","OPTIONAL_NEXT_STEPS")),shouldStopOrDefer:dedupeList(pick(json,"should_stop_or_defer","SHOULD_STOP_OR_DEFER")),
      memoryUpdates:dedupeList(pick(json,"memory_update","MEMORY_UPDATE")),changes:[],verification:[],discoveries:[],decisions:[]
    }};
  }
  function phaseLabel(value){return PHASE_LABELS[normalizePhase(value)]||"待确认阶段"}
  window.ProjectOSBootstrap={PHASE_LABELS,asList,dedupeList,dedupeTodos,strictJson,normalizePhase,inferPhase,phaseLabel,makeImportedMilestones,parseProjectBootstrap,parseStatusReviewJson};
})();
