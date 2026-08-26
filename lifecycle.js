(function () {
  const TASK_STATUS = Object.freeze({ ACTIVE:"ACTIVE", PAUSED:"PAUSED", FROZEN:"FROZEN", COMPLETED:"COMPLETED" });
  const TASK_STATUS_LABELS = Object.freeze({ ACTIVE:"进行中", PAUSED:"已暂停", FROZEN:"已冻结", COMPLETED:"已完成" });
  const VALID_TASK_STATUSES = new Set(Object.values(TASK_STATUS));
  const PLACEHOLDER_STATES = new Set(["", "尚未记录", "等待推进", "等待继续", "刚刚建立，等待推进。", "刚刚建立，等待推进", "刚刚建立，尚未开始第一轮工作。", "刚刚建立，尚未开始第一轮工作", "暂停中"]);
  const AUTO_MEMORY_SOURCES = new Set(["init", "bootstrap-auto", "system", "migration-placeholder"]);
  const list = value => Array.isArray(value) ? value : [];
  const formalSessions = project => list(project.sessions).filter(session => !session.isDemo || session.promotedToFormal);
  const activeSessions = project => list(project.sessions).filter(session => !session.endedAt);

  function localDayKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toDateString() : "";
  }

  function sessionsForLocalDay(sessions, referenceDate = new Date()) {
    const dayKey = localDayKey(referenceDate);
    if (!dayKey) return [];
    return list(sessions).filter(session => [session?.startedAt,session?.endedAt,session?.updatedAt,session?.createdAt]
      .some(value => value && localDayKey(value) === dayKey));
  }

  function confirmedFocusSessions(sessions, weekStart, weekEnd = Infinity) {
    const start = Number(weekStart) || 0;
    const end = Number.isFinite(Number(weekEnd)) ? Number(weekEnd) : Infinity;
    return list(sessions).filter(session => {
      const endedAt = new Date(session?.endedAt).getTime();
      return Boolean(session?.timeConfirmedAt)
        && Number.isFinite(Number(session?.focusMinutes))
        && Number.isFinite(endedAt)
        && endedAt >= start
        && endedAt < end;
    });
  }

  function confirmedFocusMinutes(sessions, weekStart, weekEnd = Infinity) {
    return confirmedFocusSessions(sessions, weekStart, weekEnd).reduce((total, session) => total + Math.max(0, Number(session.focusMinutes) || 0), 0);
  }

  function normalizeTaskStatus(status, legacyPaused = false) {
    if (VALID_TASK_STATUSES.has(status)) return status;
    return legacyPaused ? TASK_STATUS.PAUSED : TASK_STATUS.ACTIVE;
  }

  function taskStatusLabel(status) {
    return TASK_STATUS_LABELS[normalizeTaskStatus(status)] || TASK_STATUS_LABELS.ACTIVE;
  }

  function isRecommendable(task) {
    return normalizeTaskStatus(task?.status, task?.paused) === TASK_STATUS.ACTIVE;
  }

  function isArchived(task) {
    return normalizeTaskStatus(task?.status, task?.paused) !== TASK_STATUS.ACTIVE;
  }

  function taskMenuActions(task) {
    const status = normalizeTaskStatus(task?.status, task?.paused);
    if (status === TASK_STATUS.ACTIVE) return ["EDIT","PAUSE","FREEZE","COMPLETE","DELETE"];
    if (status === TASK_STATUS.PAUSED) return ["EDIT","REOPEN","FREEZE","DELETE"];
    return ["VIEW","REOPEN","DELETE"];
  }

  function hasImportantMemory(project) {
    return list(project.projectMemory).some(memory => {
      const source = typeof memory === "object" ? memory.source : "";
      const value = typeof memory === "string" ? memory : memory?.text;
      return Boolean(String(value || "").trim()) && !AUTO_MEMORY_SOURCES.has(source);
    });
  }

  function hasMeaningfulState(project) {
    const currentState = String(project.currentState || "").trim();
    const currentProgressSummary = String(project.currentProgressSummary || "").trim();
    return !PLACEHOLDER_STATES.has(currentState)
      || Boolean(currentProgressSummary)
      || list(project.blockers).length > 0
      || list(project.inProgress).length > 0
      || list(project.nextActions).length > 0;
  }

  function isOrphanProject(project) {
    if (!project || project.keepWhenEmpty) return false;
    if (normalizeTaskStatus(project.status, project.paused) !== TASK_STATUS.ACTIVE) return false;
    return formalSessions(project).length === 0
      && activeSessions(project).length === 0
      && !hasImportantMemory(project)
      && list(project.assets).length === 0
      && list(project.completed).length === 0
      && list(project.backlog).length === 0
      && list(project.parkingLot).length === 0
      && list(project.openIssues).length === 0
      && list(project.decisions).length === 0
      && list(project.constraints).length === 0
      && !hasMeaningfulState(project);
  }

  function isDeletingLastFormalHistory(project, sessionIds = []) {
    const ids=new Set(sessionIds);
    const formal=formalSessions(project);
    return formal.some(session=>ids.has(session.id)) && formal.every(session=>ids.has(session.id));
  }

  function buildProjectOriginSession({id,project,workspaceId="normal",kind="manual",timestamp=new Date().toISOString(),bootstrapJson=""}={}) {
    const imported=kind==="ai";
    const completed=list(project?.completed).map(String);
    const openIssues=list(project?.openIssues).map(String);
    const nextStep=list(project?.nextActions)[0]||"";
    const currentState=String(project?.currentState||"");
    const goal=String(project?.goal||"");
    return {
      id,projectId:project?.id,workspaceId,status:"ENDED",title:imported?"项目导入":"项目建立",originType:imported?"PROJECT_IMPORT":"PROJECT_CREATED",
      source:imported?"ai":"manual",isDemo:false,promotedToFormal:false,startedAt:timestamp,endedAt:timestamp,goal,todos:[],notes:"",generatedPrompts:[],importedResults:[],
      completed,discoveries:[],remainingIssues:openIssues,nextStep,parkingAdded:[],bootstrapJson:imported?String(bootstrapJson||""):"",
      initialSnapshot:{source:imported?"AI_BOOTSTRAP":"MANUAL_CREATE",capturedAt:timestamp,currentState,goal,completed,nextStep},
      summary:`${imported?"项目导入":"项目建立"} · 初始状态：${currentState||"尚未开始"}`,
      formalContributions:{completed:[...completed],nextActions:nextStep?[nextStep]:[],openIssues:[...openIssues],currentStateBefore:"",currentStateAfter:currentState,progressSummaryBefore:"",progressSummaryAfter:""},
      createdAt:timestamp,updatedAt:timestamp
    };
  }

  function resetProjectAfterLastHistory(project,timestamp=new Date().toISOString()) {
    return {
      ...project,keepWhenEmpty:true,goal:"",currentState:"尚未开始 / 无工作记录",currentPhase:"",currentProgressSummary:"",completed:[],importedMilestones:[],inProgress:[],nextActions:[],openIssues:[],resolvedIssues:[],blockers:[],blockerReviewPending:false,lastWorkedAt:null,updatedAt:timestamp,nonSessionUpdatedAt:timestamp
    };
  }

  function reconcileContextEvents(events, project) {
    const retained = [];
    list(events).forEach(event => {
      if (event.sourceProjectId !== project.id) return retained.push(event);
      const confirmed = Boolean(event.confirmedAt || event.savedAt || event.confirmed || event.status === "confirmed");
      if (confirmed) retained.push({ ...event, sourceRemoved: true, sourceProjectName: event.sourceProjectName || project.name, sourceStatus: "来源项目已移除", sourceProjectId: null });
    });
    return retained;
  }

  function reconcileDeletedTaskEvents(events, { projectIds = [], zoneId = null, zoneName = "" } = {}) {
    const ids = new Set(projectIds);
    const retained = [];
    list(events).forEach(event => {
      const matchesProject = ids.has(event.sourceProjectId);
      const matchesZone = Boolean(zoneId && event.sourceZoneId === zoneId);
      if (!matchesProject && !matchesZone) return retained.push(event);
      const confirmed = Boolean(event.confirmedAt || event.savedAt || event.confirmed || event.status === "confirmed");
      if (!confirmed) return;
      retained.push({
        ...event,
        sourceRemoved:true,
        sourceProjectName:event.sourceProjectName || "已删除项目",
        sourceZoneName:event.sourceZoneName || zoneName,
        sourceStatus:"来源任务已删除",
        sourceProjectId:matchesProject ? null : event.sourceProjectId,
        sourceZoneId:matchesZone ? null : event.sourceZoneId
      });
    });
    return retained;
  }

  window.ProjectOSLifecycle = {
    TASK_STATUS, TASK_STATUS_LABELS, normalizeTaskStatus, taskStatusLabel, isRecommendable, isArchived, taskMenuActions,
    isOrphanProject, hasImportantMemory, hasMeaningfulState, isDeletingLastFormalHistory, buildProjectOriginSession, resetProjectAfterLastHistory, reconcileContextEvents, reconcileDeletedTaskEvents, formalSessions, sessionsForLocalDay, confirmedFocusSessions, confirmedFocusMinutes
  };
})();
