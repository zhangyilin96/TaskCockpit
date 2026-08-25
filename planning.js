(function () {
  const ACTION_VERBS = ["选择","固定","启动","运行","记录","验证","检查","执行","完成","测试","复现","整理","对比","核对","收集","确认","修改","导出","导入","发布","复盘","测量","排查","关闭","建立","创建","拆分","连接","尝试"];

  const clean = value => String(value || "").replace(/^\s*(?:解决|处理|完成|继续|下一步)\s*[：:]\s*/i, "").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
  const bigrams = value => {
    const source=clean(value);
    if(source.length<2)return source?[source]:[];
    return Array.from({length:source.length-1},(_,index)=>source.slice(index,index+2));
  };

  function similarity(left,right) {
    const a=clean(left);const b=clean(right);
    if(!a||!b)return 0;
    if(a===b)return 1;
    if((a.includes(b)||b.includes(a))&&Math.min(a.length,b.length)/Math.max(a.length,b.length)>=0.62)return .92;
    const aSet=new Set(bigrams(a));const bSet=new Set(bigrams(b));
    const union=new Set([...aSet,...bSet]);
    const overlap=[...aSet].filter(item=>bSet.has(item)).length;
    return union.size?overlap/union.size:0;
  }

  function isHighlySimilar(left,right) { return similarity(left,right)>=0.62; }
  function startsWithActionVerb(value) { const source=String(value||"").trim();return ACTION_VERBS.some(verb=>source.startsWith(verb)); }

  function contextualAction(goal,projectName="") {
    const context=`${projectName} ${goal}`;
    if(/角色一致性|姿态|视觉实验|图像生成|单变量/i.test(context))return "选择一个单变量测试对象，固定输入、参考条件和输出尺寸，连续运行 3～5 次并记录结果差异。";
    if(/实时翻译|文字识别|ocr|屏幕识别|实时文字/i.test(context))return "启动目标场景验证并连续运行 20 分钟，记录误触发、处理延迟和至少 3 个失败样本。";
    if(/移动端|业务流程|表单流程|交互流程|流程原型/i.test(context))return "在目标设备完成一次从创建到确认的完整流程，并逐步核对状态同步。";
    const target=String(goal||"当前目标").trim();
    return `选择一个与“${target}”直接相关的验证对象，执行一次完整检查并记录可核对结果。`;
  }

  function blockerAction(blocker) {
    const issue=typeof blocker==="string"?blocker:blocker?.text;
    return `复现并验证“${String(issue||"当前阻塞").trim()}”，记录触发条件、实际结果和是否解除阻塞。`;
  }

  function ensureAction(value,{goal="",projectName=""}={}) {
    const source=String(value||"").trim();
    if(source&&startsWithActionVerb(source)&&!isHighlySimilar(source,goal))return source;
    if(source&&!isHighlySimilar(source,goal))return `执行“${source}”，并记录完成条件与可核对结果。`;
    return contextualAction(goal,projectName);
  }

  function uniqueActions(goal,values) {
    const result=[];
    values.map(value=>String(value||"").trim()).filter(Boolean).forEach(value=>{
      if(isHighlySimilar(value,goal))return;
      if(result.some(existing=>isHighlySimilar(existing,value)))return;
      result.push(value);
    });
    return result;
  }

  function dedupeItems(values=[]) {
    const result=[];
    values.map(value=>String(value||"").trim()).filter(Boolean).forEach(value=>{
      if(result.some(existing=>isHighlySimilar(existing,value)))return;
      result.push(value);
    });
    return result;
  }

  function dedupeTodos(todos=[]) {
    const result=[];
    todos.filter(Boolean).forEach(todo=>{
      const text=String(typeof todo==="string"?todo:todo.text||"").trim();
      if(!text)return;
      const existing=result.find(item=>isHighlySimilar(item.text,text));
      if(existing){
        if(typeof todo==="object"&&todo.completed)existing.completed=true;
        return;
      }
      result.push(typeof todo==="string"?{text,completed:false}:{...todo,text});
    });
    return result;
  }

  function buildSessionPlan(project={}) {
    const goal=String(project.goal||"推进当前项目并得到一个可验证结果").trim();
    const openBlockers=(project.blockers||[]).filter(item=>item.status==="OPEN");
    const priorityBlocker=openBlockers.find(item=>item.priority==="HIGH");
    const raw=[...(project.nextActions||[]),...(project.inProgress||[])];
    const primary=priorityBlocker?blockerAction(priorityBlocker):ensureAction(raw[0],{goal,projectName:project.name});
    const optional=uniqueActions(goal,raw.slice(priorityBlocker?0:1))
      .map(value=>ensureAction(value,{goal,projectName:project.name}))
      .filter(value=>!isHighlySimilar(value,primary));
    return {goal,primary,optional:uniqueActions(goal,optional).slice(0,2)};
  }

  function cleanTodoValues({goal,primary,optional=[],projectName=""}) {
    const originalPrimary=String(primary||"").trim();
    const finalPrimary=ensureAction(originalPrimary,{goal,projectName});
    const cleaned=uniqueActions(goal,optional)
      .map(value=>ensureAction(value,{goal,projectName}))
      .filter(value=>!isHighlySimilar(value,finalPrimary));
    const finalOptional=uniqueActions(goal,cleaned).slice(0,2);
    return {primary:finalPrimary,optional:finalOptional,primaryChanged:finalPrimary!==originalPrimary,removedCount:optional.filter(value=>String(value||"").trim()).length-finalOptional.length};
  }

  window.ProjectOSPlanning={ACTION_VERBS,similarity,isHighlySimilar,startsWithActionVerb,contextualAction,blockerAction,ensureAction,uniqueActions,dedupeItems,dedupeTodos,buildSessionPlan,cleanTodoValues};
})();
