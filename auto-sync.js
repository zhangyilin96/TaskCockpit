(function (root) {
  const EVENT_STATUS = Object.freeze({
    DETECTED: "detected",
    SUGGESTED: "suggested",
    CONFIRMED: "confirmed",
    IGNORED: "ignored",
    REJECTED: "rejected"
  });
  const GOAL_SUGGESTION_STATUS = Object.freeze({
    PENDING: "pending",
    ACCEPTED: "accepted",
    REJECTED: "rejected",
    DEFERRED: "deferred"
  });
  const ROUTE_THRESHOLDS = Object.freeze({ automatic: 0.9, review: 0.65 });
  const CORRELATION_WINDOW_MS = 30 * 60 * 1000;
  const FILE_WORK_BURST_MS = 10 * 60 * 1000;
  const FIRST_SYNC_LOOKBACK_HOURS = 24;
  const GOAL_TREND_WINDOW_DAYS = 14;
  const GOAL_TREND_MIN_EVENTS = 3;
  const GOAL_TREND_MIN_RATIO = 0.6;

  const list = value => Array.isArray(value) ? value : [];
  const clean = value => String(value || "").trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  const timestampOf = value => {
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const normalizePath = value => clean(value).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  const unique = values => [...new Set(list(values).map(clean).filter(Boolean))];
  const GOAL_STOP_WORDS = new Set([
    "add", "added", "build", "change", "changed", "chore", "code", "commit", "complete", "completed", "create", "created",
    "docs", "feat", "feature", "files", "finish", "finished", "fix", "fixed", "implement", "implemented", "improve", "improved",
    "merge", "project", "refactor", "remove", "removed", "test", "tested", "tests", "update", "updated", "work", "working"
  ]);

  function stableHash(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function semanticTokens(value) {
    const normalized = clean(value).normalize("NFKC").toLowerCase().replace(/[_/\\-]+/g, " ");
    const latin = (normalized.match(/[a-z0-9][a-z0-9.]{2,}/g) || []).filter(token => !GOAL_STOP_WORDS.has(token));
    const chinese = [];
    (normalized.match(/[\u3400-\u9fff]{2,}/g) || []).forEach(sequence => {
      for (let size = 2; size <= Math.min(4, sequence.length); size += 1) {
        for (let index = 0; index <= sequence.length - size; index += 1) chinese.push(sequence.slice(index, index + size));
      }
    });
    return unique([...latin, ...chinese]);
  }

  function semanticSimilarity(left, right) {
    const leftTokens = semanticTokens(left);
    const rightTokens = semanticTokens(right);
    if (!leftTokens.length || !rightTokens.length) return 0;
    const rightSet = new Set(rightTokens);
    const overlap = leftTokens.filter(token => rightSet.has(token)).length;
    return overlap / Math.max(1, Math.min(leftTokens.length, rightTokens.length));
  }

  function projectEntries(state) {
    return list(state?.zones).flatMap(zone => list(zone.projects).map(project => ({ zone, project })));
  }

  function findProject(state, projectId) {
    return projectEntries(state).find(entry => entry.project.id === projectId) || null;
  }

  function sourceBindingId(projectId, sourcePath, index = 0) {
    return `source-${stableHash(`${projectId}|${normalizePath(sourcePath)}|${index}`)}`;
  }

  function normalizeSourceBinding(projectId, binding = {}, index = 0) {
    const canonicalPath = clean(binding.canonicalPath || binding.path);
    const aliases = unique([canonicalPath, ...list(binding.aliases)]);
    return {
      id: clean(binding.id) || sourceBindingId(projectId, canonicalPath, index),
      projectId,
      canonicalPath,
      aliases,
      active: binding.active !== false,
      identity: binding.identity && typeof binding.identity === "object" ? clone(binding.identity) : null,
      status: clean(binding.status || "unknown"),
      statusMessage: clean(binding.statusMessage),
      lastSeenAt: binding.lastSeenAt || null,
      lastMissingAt: binding.lastMissingAt || null,
      movedAt: binding.movedAt || null,
      createdAt: binding.createdAt || new Date().toISOString(),
      updatedAt: binding.updatedAt || binding.createdAt || new Date().toISOString()
    };
  }

  function ensureProjectSourceBindings(project) {
    project.sourcePaths = unique(project.sourcePaths);
    const bindings = list(project.sourceBindings).map((binding, index) => normalizeSourceBinding(project.id, binding, index));
    project.sourcePaths.forEach((sourcePath, index) => {
      const normalized = normalizePath(sourcePath);
      const existing = bindings.find(binding => normalizePath(binding.canonicalPath) === normalized || binding.aliases.some(alias => normalizePath(alias) === normalized));
      if (existing) {
        existing.canonicalPath = sourcePath;
        existing.aliases = unique([sourcePath, ...existing.aliases]);
        existing.active = true;
      } else {
        bindings.push(normalizeSourceBinding(project.id, { canonicalPath: sourcePath, aliases: [sourcePath] }, index));
      }
    });
    project.sourceBindings = bindings;
    return bindings;
  }

  function reconcileProjectSources(project, nextPaths, changedAt = new Date().toISOString()) {
    const previousPaths = unique(project.sourcePaths);
    const bindings = ensureProjectSourceBindings(project);
    const desiredPaths = unique(nextPaths);
    const used = new Set();
    const unmatchedDesired = [];
    desiredPaths.forEach(sourcePath => {
      const normalized = normalizePath(sourcePath);
      const exact = bindings.find(binding => !used.has(binding.id) && (normalizePath(binding.canonicalPath) === normalized || binding.aliases.some(alias => normalizePath(alias) === normalized)));
      if (!exact) return unmatchedDesired.push(sourcePath);
      exact.canonicalPath = sourcePath;
      exact.aliases = unique([sourcePath, ...exact.aliases]);
      exact.active = true;
      exact.updatedAt = changedAt;
      used.add(exact.id);
    });
    const unmatchedActive = bindings.filter(binding => binding.active !== false && !used.has(binding.id) && previousPaths.some(sourcePath => normalizePath(sourcePath) === normalizePath(binding.canonicalPath)));
    const moved = [];
    if (unmatchedDesired.length === 1 && unmatchedActive.length === 1) {
      const binding = unmatchedActive[0];
      const from = binding.canonicalPath;
      binding.canonicalPath = unmatchedDesired[0];
      binding.aliases = unique([unmatchedDesired[0], from, ...binding.aliases]);
      binding.active = true;
      binding.status = "pending";
      binding.statusMessage = "目录已更新，等待下一次同步验证身份";
      binding.movedAt = changedAt;
      binding.updatedAt = changedAt;
      used.add(binding.id);
      moved.push({ bindingId: binding.id, from, to: unmatchedDesired[0] });
      unmatchedDesired.length = 0;
    }
    const added = unmatchedDesired.map((sourcePath, index) => {
      const binding = normalizeSourceBinding(project.id, { canonicalPath: sourcePath, aliases: [sourcePath], status: "pending", createdAt: changedAt, updatedAt: changedAt }, bindings.length + index);
      bindings.push(binding);
      used.add(binding.id);
      return binding.id;
    });
    const removed = [];
    bindings.forEach(binding => {
      if (used.has(binding.id)) return;
      if (binding.active !== false) removed.push(binding.id);
      binding.active = false;
      binding.updatedAt = changedAt;
    });
    project.sourcePaths = desiredPaths;
    project.sourceBindings = bindings;
    return { moved, added, removed, bindings: clone(bindings) };
  }

  function applyCollectorSourceReports(state, reports, reportedAt = new Date().toISOString()) {
    const changes = [];
    list(reports).forEach(report => {
      const found = findProject(state, report.projectId);
      if (!found) return;
      const bindings = ensureProjectSourceBindings(found.project);
      const binding = bindings.find(item => item.id === report.sourceBindingId);
      if (!binding) return;
      const previousCanonicalPath = binding.canonicalPath;
      if (clean(report.resolvedPath)) {
        binding.canonicalPath = report.resolvedPath;
        binding.aliases = unique([report.resolvedPath, report.configuredPath, ...binding.aliases]);
      }
      binding.identity = report.identity && typeof report.identity === "object" ? clone(report.identity) : binding.identity;
      binding.status = report.status === "available" ? "available" : "missing";
      binding.statusMessage = clean(report.message);
      binding.lastSeenAt = report.status === "available" ? reportedAt : binding.lastSeenAt;
      binding.lastMissingAt = report.status === "available" ? binding.lastMissingAt : reportedAt;
      binding.updatedAt = reportedAt;
      if (normalizePath(previousCanonicalPath) !== normalizePath(binding.canonicalPath)) {
        binding.movedAt = reportedAt;
        changes.push({ projectId: found.project.id, bindingId: binding.id, from: previousCanonicalPath, to: binding.canonicalPath, reason: clean(report.recoveryReason || "已通过来源身份恢复目录映射") });
      }
      found.project.sourcePaths = bindings.filter(item => item.active !== false).map(item => item.canonicalPath).filter(Boolean);
    });
    return changes;
  }

  function projectSnapshot(project) {
    return {
      name: clean(project.name),
      purpose: clean(project.purpose),
      goal: clean(project.goal),
      currentState: clean(project.currentState),
      currentPhase: clean(project.currentPhase),
      currentProgressSummary: clean(project.currentProgressSummary),
      completed: unique(project.completed),
      inProgress: unique(project.inProgress),
      nextActions: unique(project.nextActions),
      openIssues: unique(project.openIssues),
      resolvedIssues: unique(project.resolvedIssues),
      blockers: clone(list(project.blockers)),
      blockerReviewPending: Boolean(project.blockerReviewPending),
      timeline: list(project.timeline).map(item => ({ ...item })),
      updatedAt: project.updatedAt || new Date().toISOString(),
      lastWorkedAt: project.lastWorkedAt || null
    };
  }

  function evidenceRecord(input, eventId, index, detectedAt) {
    const sourceType = clean(input?.sourceType || input?.source_type || "project_os");
    const kind = clean(input?.kind || "record");
    const locator = clean(input?.locator || input?.path || input?.commit || "");
    const summary = clean(input?.summary || input?.message || kind);
    return {
      id: input?.id || `evidence-${stableHash(`${eventId}|${sourceType}|${kind}|${locator}|${index}`)}`,
      eventId,
      sourceType,
      kind,
      locator,
      summary,
      capturedAt: input?.capturedAt || input?.captured_at || detectedAt,
      metadata: input?.metadata && typeof input.metadata === "object" ? clone(input.metadata) : {}
    };
  }

  function createSnapshotEvent(project, options = {}) {
    const detectedAt = options.detectedAt || new Date().toISOString();
    const eventType = options.eventType || "project_state_snapshot";
    const sourceId = options.sourceId || `${eventType}:${project.id}:${stableHash(JSON.stringify(projectSnapshot(project)))}`;
    const eventId = `activity-${stableHash(sourceId)}`;
    const summary = options.summary || (eventType === "project_state_baseline" ? "保留升级前已确认的项目状态" : "保存人工确认后的项目状态");
    const evidence = evidenceRecord({
      sourceType: options.sourceType || "project_os",
      kind: eventType === "project_state_baseline" ? "migration_snapshot" : "confirmed_snapshot",
      locator: project.id,
      summary
    }, eventId, 0, detectedAt);
    return {
      event: {
        id: eventId,
        timestamp: options.timestamp || project.updatedAt || detectedAt,
        detectedAt,
        sourceType: options.sourceType || "project_os",
        sourceId,
        projectId: project.id,
        eventType,
        rawSummary: summary,
        normalizedSummary: summary,
        evidence: [evidence.id],
        confidence: 1,
        status: EVENT_STATUS.CONFIRMED,
        confirmedAt: detectedAt,
        metadata: {
          routeReason: "项目自身产生的已确认状态",
          facts: [summary],
          inference: "",
          effect: { type: "snapshot" },
          snapshot: projectSnapshot(project),
          sourceIds: [sourceId]
        }
      },
      evidence: [evidence]
    };
  }

  function ensureState(state, options = {}) {
    if (!state || typeof state !== "object") return state;
    state.activityEvents = list(state.activityEvents);
    state.activityEvidence = list(state.activityEvidence);
    state.syncRuns = list(state.syncRuns);
    state.goalSuggestions = list(state.goalSuggestions);
    state.routingRules = list(state.routingRules);
    state.projectRelationshipRules = list(state.projectRelationshipRules);
    state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
    state.settings.autoSync = {
      enabled: true,
      lastSyncAt: null,
      collectorCheckpoints: {},
      fileIndexes: {},
      firstSyncLookbackHours: FIRST_SYNC_LOOKBACK_HOURS,
      ...(state.settings.autoSync || {})
    };
    const upgradedSummaries = new Map();
    state.activityEvents.forEach(event => {
      const files = candidateFiles(event);
      if (/^更新\s*1\s*个文件$/.test(clean(event.normalizedSummary)) && files.length === 1) {
        const raw = clean(event.rawSummary);
        event.normalizedSummary = raw && !/^更新\s*1\s*个文件$/.test(raw) ? raw : `文件变化：${files[0]}`;
        upgradedSummaries.set(event.id, event.normalizedSummary);
      }
    });
    projectEntries(state).forEach(({ project }) => {
      ensureProjectSourceBindings(project);
      project.routingKeywords = unique(project.routingKeywords);
      project.timeline = list(project.timeline);
      project.timeline.forEach(item => { if (upgradedSummaries.has(item.eventId)) item.summary = upgradedSummaries.get(item.eventId); });
      if (options.createBaselines === false) return;
      const hasSnapshot = state.activityEvents.some(event => event.projectId === project.id && ["project_state_baseline", "project_state_snapshot"].includes(event.eventType));
      if (hasSnapshot) return;
      const baseline = createSnapshotEvent(project, {
        eventType: "project_state_baseline",
        sourceId: `project_state_baseline:${project.id}:v3`,
        detectedAt: options.detectedAt || new Date().toISOString()
      });
      state.activityEvents.push(baseline.event);
      state.activityEvidence.push(...baseline.evidence);
    });
    return state;
  }

  function recordProjectSnapshot(state, projectId, options = {}) {
    ensureState(state, { createBaselines: true, detectedAt: options.detectedAt });
    const found = findProject(state, projectId);
    if (!found) return null;
    const snapshot = createSnapshotEvent(found.project, options);
    if (state.activityEvents.some(event => event.sourceId === snapshot.event.sourceId)) return null;
    state.activityEvents.push(snapshot.event);
    state.activityEvidence.push(...snapshot.evidence);
    return snapshot.event;
  }

  function recordProjectChange(state, projectId, options = {}) {
    const changedAt = options.changedAt || options.detectedAt || new Date().toISOString();
    ensureState(state, { createBaselines: true, detectedAt: changedAt });
    const found = findProject(state, projectId);
    if (!found) return null;
    const patch = options.patch && typeof options.patch === "object" ? clone(options.patch) : {};
    if (!Object.keys(patch).length) return null;
    const sourceId = options.sourceId || `manual_change:${projectId}:${stableHash(`${changedAt}|${JSON.stringify(patch)}`)}`;
    const existing = state.activityEvents.find(event => event.sourceId === sourceId);
    if (existing) return existing;
    const eventId = `activity-${stableHash(sourceId)}`;
    const summary = clean(options.summary || "用户修正了项目状态");
    const reason = clean(options.reason || "用户主动修改");
    const evidence = evidenceRecord({
      sourceType: options.sourceType || "project_os",
      kind: options.kind || "user_correction",
      locator: projectId,
      summary: `${summary}；原因：${reason}`
    }, eventId, 0, changedAt);
    const event = {
      id: eventId,
      timestamp: changedAt,
      detectedAt: changedAt,
      sourceType: options.sourceType || "project_os",
      sourceId,
      projectId,
      eventType: options.eventType || "project_state_change",
      rawSummary: summary,
      normalizedSummary: summary,
      evidence: [evidence.id],
      confidence: 1,
      status: EVENT_STATUS.CONFIRMED,
      confirmedAt: changedAt,
      reviewedAt: changedAt,
      metadata: {
        confirmedByUser: true,
        changeReason: reason,
        ownership: "user",
        facts: [summary],
        inference: "",
        effect: { type: "manual_patch", patch }
      }
    };
    state.activityEvents.push(event);
    state.activityEvidence.push(evidence);
    recalculateProjectState(state, projectId);
    return event;
  }

  function recordWorkLog(state, projectId, workLog = {}, options = {}) {
    const changedAt = options.changedAt || workLog.endedAt || new Date().toISOString();
    ensureState(state, { createBaselines: true, detectedAt: changedAt });
    const found = findProject(state, projectId);
    if (!found) return null;
    const sourceId = options.sourceId || `work_log:${projectId}:${workLog.sessionId || stableHash(`${changedAt}|${JSON.stringify(workLog)}`)}`;
    const existing = state.activityEvents.find(event => event.sourceId === sourceId);
    if (existing) return existing;
    const eventId = `activity-${stableHash(sourceId)}`;
    const completed = unique(workLog.completed);
    const remaining = unique(workLog.remaining || workLog.inProgress);
    const nextActions = unique(workLog.nextActions || [workLog.nextAction]);
    const summary = clean(workLog.summary || completed[0] || workLog.title || "完成一条人工工作记录");
    const evidence = evidenceRecord({
      sourceType: options.sourceType || "manual",
      kind: "work_log",
      locator: workLog.sessionId || projectId,
      summary
    }, eventId, 0, changedAt);
    const event = {
      id: eventId,
      timestamp: workLog.endedAt || changedAt,
      detectedAt: changedAt,
      sourceType: options.sourceType || "manual",
      sourceId,
      projectId,
      eventType: "work_log",
      rawSummary: summary,
      normalizedSummary: summary,
      evidence: [evidence.id],
      confidence: 1,
      status: EVENT_STATUS.CONFIRMED,
      confirmedAt: changedAt,
      reviewedAt: changedAt,
      metadata: {
        confirmedByUser: true,
        changeReason: clean(options.reason || "用户结束并保存本次工作"),
        ownership: "user",
        facts: unique([summary, ...completed]),
        inference: "",
        effect: {
          type: "work_log",
          completed,
          remaining,
          nextActions,
          openIssues: unique(workLog.openIssues),
          currentState: clean(workLog.currentState),
          currentProgressSummary: clean(workLog.currentProgressSummary || summary),
          sessionId: workLog.sessionId || null
        }
      }
    };
    state.activityEvents.push(event);
    state.activityEvidence.push(evidence);
    recalculateProjectState(state, projectId);
    return event;
  }

  function candidateFiles(candidate) {
    const changed = unique(list(candidate?.metadata?.changedFiles).map(item => typeof item === "string" ? item : item?.path)).map(normalizePath).filter(Boolean);
    if (changed.length) return changed;
    return unique([candidate?.metadata?.relativePath, candidate?.metadata?.path]).map(normalizePath).filter(Boolean);
  }

  function candidateRoot(candidate) {
    return clean(candidate?.metadata?.sourceBindingId || candidate?.metadata?.repositoryIdentity?.fingerprint)
      || normalizePath(candidate?.metadata?.repoPath || candidate?.metadata?.rootPath || candidate?.metadata?.projectPath);
  }

  function candidateWorkUnit(candidate) {
    if (clean(candidate?.metadata?.workUnitKey)) return clean(candidate.metadata.workUnitKey).toLowerCase();
    if (candidate?.eventType === "project_goal_intent" || candidate?.metadata?.goalIntent) return `goal-intent:${candidate?.metadata?.relativePath || candidate?.sourceId}`;
    const relative = clean(candidate?.metadata?.relativePath || candidateFiles(candidate)[0]).replaceAll("\\", "/").replace(/^\/+/, "");
    const parts = relative.split("/").filter(Boolean);
    if (!parts.length) return "unknown";
    if (parts.length === 1) return "project-root";
    if (["src", "app", "assets", "tests", "test", "docs", "scripts", "packages"].includes(parts[0].toLowerCase())) {
      return `${parts[0].toLowerCase()}/${(parts[1] || "root").toLowerCase()}`;
    }
    return parts[0].toLowerCase();
  }

  function sourceRank(sourceType) {
    return { git: 4, codex: 3, filesystem: 2, project_os: 1, manual: 1 }[sourceType] || 0;
  }

  function canCorrelate(left, right) {
    if (!candidateRoot(left) || candidateRoot(left) !== candidateRoot(right)) return false;
    if (Math.abs(timestampOf(left.timestamp) - timestampOf(right.timestamp)) > CORRELATION_WINDOW_MS) return false;
    if (left.eventType === "project_goal_intent" || right.eventType === "project_goal_intent" || left.metadata?.goalIntent || right.metadata?.goalIntent) return false;
    if (left.sourceType === "git" && right.sourceType === "git") return false;
    if (left.eventType === "test_result" || right.eventType === "test_result") return true;
    if (left.sourceType === "filesystem" && right.sourceType === "filesystem") {
      const workUnit = candidateWorkUnit(left);
      return workUnit !== "project-root"
        && workUnit === candidateWorkUnit(right)
        && Math.abs(timestampOf(left.timestamp) - timestampOf(right.timestamp)) <= FILE_WORK_BURST_MS;
    }
    const leftFiles = candidateFiles(left);
    const rightFiles = candidateFiles(right);
    if (!leftFiles.length || !rightFiles.length) return left.sourceType === "filesystem" && right.sourceType === "filesystem";
    return leftFiles.some(leftFile => rightFiles.some(rightFile => leftFile === rightFile || leftFile.endsWith(`/${rightFile}`) || rightFile.endsWith(`/${leftFile}`)));
  }

  function cleanCommitMessage(message) {
    return clean(message).split(/\r?\n/)[0].replace(/^(feat|fix|chore|refactor|test|docs|build|ci|perf|style)(\([^)]*\))?!?:\s*/i, "");
  }

  function describeGroup(group) {
    const goalIntent = group.find(item => item.eventType === "project_goal_intent" || item.metadata?.goalIntent);
    const git = group.find(item => item.sourceType === "git");
    const test = group.find(item => item.eventType === "test_result");
    const files = unique(group.flatMap(candidateFiles));
    const message = cleanCommitMessage(git?.metadata?.commitMessage || git?.rawSummary);
    const testStatus = test?.metadata?.testStatus;
    const passed = Number(test?.metadata?.passed || 0);
    const total = Number(test?.metadata?.total || 0);
    if (goalIntent) return `目标方向证据：${clean(goalIntent.metadata?.goalIntentTarget) || clean(goalIntent.rawSummary)}`;
    if (testStatus === "failed") return `测试未通过${total ? `：${Math.max(0, total - passed)}/${total} 项失败` : ""}`;
    if (git && testStatus === "passed") return `${message || "代码变更"}；回归测试${total ? ` ${passed}/${total}` : ""} 通过`;
    if (git) return `代码提交：${message || clean(git.rawSummary) || "未填写说明"}`;
    if (testStatus === "passed") return `回归测试${total ? ` ${passed}/${total}` : ""} 通过`;
    if (files.length === 1) return clean(group[0]?.rawSummary) || `文件变化：${files[0]}`;
    if (files.length) return `更新 ${files.length} 个文件：${files.slice(0, 3).join("、")}${files.length > 3 ? " 等" : ""}`;
    return clean(group[0]?.rawSummary) || "检测到新的工作活动";
  }

  function effectFor(group, normalizedSummary) {
    if (group.some(item => item.eventType === "project_goal_intent" || item.metadata?.goalIntent)) {
      return { type: "timeline", value: normalizedSummary, fact: true };
    }
    const git = group.find(item => item.sourceType === "git");
    const test = group.find(item => item.eventType === "test_result");
    const message = cleanCommitMessage(git?.metadata?.commitMessage || git?.rawSummary);
    if (test?.metadata?.testStatus === "failed") {
      return { type: "known_issue", value: normalizedSummary, fact: true };
    }
    const hasPassedTests = test?.metadata?.testStatus === "passed";
    const explicitCompletion = /\b(complete[sd]?|finish(?:ed)?|release[sd]?|ship(?:ped)?)\b|完成|已完成|交付|发布/i.test(message);
    const explicitFix = /\bfix(?:e[sd])?\b|修复|解决/i.test(`${git?.metadata?.commitMessage || ""} ${message}`);
    if (git && hasPassedTests && (explicitCompletion || explicitFix)) {
      return { type: "completed", value: explicitFix ? `已修复：${message}` : `已完成：${message}`, fact: true };
    }
    if (git) return { type: "in_progress", value: `推进：${message || "代码变更"}`, fact: false };
    return { type: "timeline", value: normalizedSummary, fact: true };
  }

  function buildEvent(group, detectedAt) {
    const primary = [...group].sort((left, right) => sourceRank(right.sourceType) - sourceRank(left.sourceType))[0];
    const sourceIds = unique(group.map(item => item.sourceId || item.id));
    const eventId = `activity-${stableHash(sourceIds.sort().join("|"))}`;
    const evidence = group.flatMap((candidate, candidateIndex) => {
      const incoming = list(candidate.evidence).length ? candidate.evidence : [{
        sourceType: candidate.sourceType,
        kind: candidate.eventType,
        locator: candidate.sourceId,
        summary: candidate.rawSummary
      }];
      return incoming.map((item, evidenceIndex) => evidenceRecord(item, eventId, candidateIndex * 100 + evidenceIndex, detectedAt));
    });
    const normalizedSummary = describeGroup(group);
    const effect = effectFor(group, normalizedSummary);
    const facts = unique(evidence.map(item => item.summary));
    const inference = effect.fact ? "" : "检测到代码活动，只能确认工作正在推进；没有足够证据证明整体任务完成。";
    return {
      id: eventId,
      timestamp: [...group].sort((left, right) => timestampOf(right.timestamp) - timestampOf(left.timestamp))[0]?.timestamp || detectedAt,
      detectedAt,
      sourceType: primary.sourceType,
      sourceId: primary.sourceId,
      projectId: null,
      eventType: group.length > 1 ? "correlated_activity" : primary.eventType,
      rawSummary: unique(group.map(item => item.rawSummary)).join("；"),
      normalizedSummary,
      evidence: unique(evidence.map(item => item.id)),
      confidence: 0,
      status: EVENT_STATUS.DETECTED,
      metadata: {
        ...clone(primary.metadata || {}),
        rootPath: primary.metadata?.rootPath || primary.metadata?.repoPath || "",
        repoPath: primary.metadata?.repoPath || "",
        changedFiles: unique(group.flatMap(candidateFiles)),
        sourceIds,
        sourceTypes: unique(group.map(item => item.sourceType)),
        facts,
        inference,
        effect,
        projectIdHint: primary.metadata?.projectIdHint || group.find(item => item.metadata?.projectIdHint)?.metadata?.projectIdHint || null
      },
      _evidence: evidence
    };
  }

  function correlateCandidates(candidates, existingEvents = [], detectedAt = new Date().toISOString()) {
    const knownSourceIds = new Set(list(existingEvents).flatMap(event => [event.sourceId, ...list(event.metadata?.sourceIds)]).filter(Boolean));
    const incoming = list(candidates)
      .filter(candidate => candidate && !knownSourceIds.has(candidate.sourceId || candidate.id))
      .sort((left, right) => timestampOf(left.timestamp) - timestampOf(right.timestamp));
    const groups = [];
    const assigned = new Set();
    incoming.filter(candidate => ["git", "codex"].includes(candidate.sourceType)).forEach(anchor => {
      if (assigned.has(anchor)) return;
      const group = [anchor];
      assigned.add(anchor);
      incoming.forEach(candidate => {
        if (assigned.has(candidate) || !canCorrelate(anchor, candidate)) return;
        group.push(candidate);
        assigned.add(candidate);
      });
      groups.push(group);
    });
    incoming.forEach(candidate => {
      if (assigned.has(candidate)) return;
      const group = groups.find(items => {
        const anchor = items[0];
        return !["git", "codex"].includes(anchor.sourceType)
          && candidateWorkUnit(anchor) === candidateWorkUnit(candidate)
          && items.every(item => canCorrelate(item, candidate));
      });
      if (group) group.push(candidate);
      else groups.push([candidate]);
      assigned.add(candidate);
    });
    const events = groups.map(group => buildEvent(group, detectedAt));
    return {
      events,
      evidence: events.flatMap(event => event._evidence),
      deduplicatedCount: Math.max(0, incoming.length - events.length),
      skippedKnownCount: list(candidates).length - incoming.length
    };
  }

  function routeByRule(event, state) {
    const eventPath = normalizePath(event.metadata?.repoPath || event.metadata?.rootPath);
    const activeRules = list(state.routingRules).filter(rule => rule.active !== false);
    for (const rule of activeRules) {
      if (rule.matchType === "path_prefix" && eventPath && eventPath.startsWith(normalizePath(rule.pattern))) {
        return { projectId: rule.projectId, confidence: Number(rule.confidence || 0.99), reason: `匹配已保存路径规则：${rule.pattern}` };
      }
    }
    return null;
  }

  function routeEvent(event, state) {
    const hint = event.metadata?.projectIdHint;
    if (hint && findProject(state, hint)) return { projectId: hint, confidence: 0.99, reason: "来自该项目已注册目录" };
    const ruleMatch = routeByRule(event, state);
    if (ruleMatch && findProject(state, ruleMatch.projectId)) return ruleMatch;
    const eventPath = normalizePath(event.metadata?.repoPath || event.metadata?.rootPath);
    const direct = projectEntries(state).find(({ project }) => list(project.sourcePaths).some(sourcePath => eventPath && (eventPath === normalizePath(sourcePath) || eventPath.startsWith(`${normalizePath(sourcePath)}/`))));
    if (direct) return { projectId: direct.project.id, confidence: 0.98, reason: "匹配项目已注册目录" };
    const haystack = `${event.rawSummary} ${event.normalizedSummary} ${list(event.metadata?.changedFiles).join(" ")}`.toLowerCase();
    const keywordMatches = projectEntries(state).map(({ project }) => {
      const keywords = unique([project.name, ...list(project.routingKeywords)]).filter(keyword => clean(keyword).length >= 2);
      const matched = keywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
      return { project, matched };
    }).filter(item => item.matched.length).sort((left, right) => right.matched.length - left.matched.length);
    if (keywordMatches.length && (!keywordMatches[1] || keywordMatches[0].matched.length > keywordMatches[1].matched.length)) {
      return { projectId: keywordMatches[0].project.id, confidence: 0.72, reason: `匹配项目关键词：${keywordMatches[0].matched.join("、")}` };
    }
    return { projectId: null, confidence: 0, reason: "没有可靠的目录或规则匹配" };
  }

  function normalizeCollectedActivities(candidates, state, options = {}) {
    ensureState(state, { createBaselines: true, detectedAt: options.detectedAt });
    const correlated = correlateCandidates(candidates, state.activityEvents, options.detectedAt || new Date().toISOString());
    const events = correlated.events.map(event => {
      const route = routeEvent(event, state);
      delete event._evidence;
      return {
        ...event,
        projectId: route.projectId,
        confidence: route.confidence,
        status: EVENT_STATUS.SUGGESTED,
        metadata: { ...event.metadata, routeReason: route.reason }
      };
    });
    const evidenceIds = new Set(events.flatMap(event => event.evidence));
    return { ...correlated, events, evidence: correlated.evidence.filter(item => evidenceIds.has(item.id)) };
  }

  function goalDirectionText(event) {
    return clean(event?.normalizedSummary || event?.rawSummary)
      .replace(/^(?:代码提交|推进|已完成|已修复|最近确认|工作记录)[：:]\s*/i, "")
      .replace(/^(?:feat|fix|chore|refactor|test|docs|build|ci|perf|style)(?:\([^)]*\))?!?[：:]\s*/i, "")
      .replace(/[；;]\s*回归测试.*$/i, "")
      .replace(/^(?:新增|增加|实现|完成|修复|解决|更新|调整|优化|测试|验证|重构)\s*/, "")
      .trim();
  }

  function explicitGoalTarget(event) {
    const haystack = unique([
      event?.rawSummary,
      event?.normalizedSummary,
      ...list(event?.metadata?.facts),
      ...list(event?._evidence).map(item => item.summary)
    ]).join("；");
    const patterns = [
      /(?:当前目标|项目目标|目标)\s*(?:改为|调整为|变更为|切换为|转为)\s*[：:]?\s*[“"']?([^。；;\n”"']{3,160})/i,
      /(?:下一阶段(?:做|目标是|重点是)|接下来(?:重点是|主要做|目标是|集中做))\s*[：:]?\s*[“"']?([^。；;\n”"']{3,160})/i,
      /(?:current\s+goal|next\s+phase|next\s+focus)\s*(?:is|to|becomes?|changes?\s+to|[:：])\s*[“"']?([^.;\n”"']{3,160})/i
    ];
    for (const pattern of patterns) {
      const match = haystack.match(pattern);
      if (match?.[1]) return clean(match[1]).replace(/[。.!！?？]+$/, "");
    }
    return "";
  }

  function eventSourceTypes(event) {
    return unique([event?.sourceType, ...list(event?.metadata?.sourceTypes)]);
  }

  function isGoalEvidenceEvent(event, anchorTimestamp) {
    if (!event?.projectId || ![EVENT_STATUS.CONFIRMED, EVENT_STATUS.SUGGESTED].includes(event.status)) return false;
    if (["project_state_baseline", "project_state_snapshot", "goal_change", "goal_change_undo"].includes(event.eventType)) return false;
    if (event.metadata?.effect?.type === "manual_patch") return false;
    if (timestampOf(event.timestamp || event.detectedAt) < anchorTimestamp - GOAL_TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000) return false;
    const sources = eventSourceTypes(event);
    if (sources.length && sources.every(source => source === "filesystem" || source === "configuration") && !event.metadata?.goalIntent) return false;
    return semanticTokens(goalDirectionText(event)).length > 0;
  }

  function clusterGoalEvents(events) {
    const clusters = [];
    events.forEach(event => {
      const direction = goalDirectionText(event);
      let best = null;
      let bestScore = 0;
      clusters.forEach(cluster => {
        const score = Math.max(...cluster.events.map(existing => semanticSimilarity(direction, goalDirectionText(existing))));
        if (score > bestScore) {
          best = cluster;
          bestScore = score;
        }
      });
      if (best && bestScore >= 0.42) best.events.push(event);
      else clusters.push({ events: [event] });
    });
    return clusters.sort((left, right) => right.events.length - left.events.length);
  }

  function representativeGoalDirection(events) {
    return events.map(event => ({
      text: goalDirectionText(event),
      score: events.reduce((total, other) => total + semanticSimilarity(goalDirectionText(event), goalDirectionText(other)), 0)
    })).sort((left, right) => right.score - left.score || left.text.length - right.text.length)[0]?.text || "";
  }

  function goalSuggestionKey(projectId, oldGoal, suggestedGoal) {
    const direction = semanticTokens(suggestedGoal).sort().join("|") || clean(suggestedGoal).toLowerCase();
    return stableHash(`${projectId}|${clean(oldGoal).toLowerCase()}|${direction}`);
  }

  function saveGoalSuggestion(state, input) {
    const evidenceEventIds = unique(input.evidenceEventIds).sort();
    const directionKey = goalSuggestionKey(input.projectId, input.oldGoal, input.suggestedGoal);
    const evidenceKey = stableHash(evidenceEventIds.join("|"));
    const duplicate = state.goalSuggestions.find(item => item.directionKey === directionKey && item.evidenceKey === evidenceKey);
    if (duplicate) return null;
    const pending = state.goalSuggestions.find(item => item.directionKey === directionKey && item.status === GOAL_SUGGESTION_STATUS.PENDING);
    if (pending) {
      pending.evidenceEventIds = unique([...list(pending.evidenceEventIds), ...evidenceEventIds]);
      pending.evidenceKey = stableHash([...pending.evidenceEventIds].sort().join("|"));
      pending.confidence = Math.max(Number(pending.confidence || 0), Number(input.confidence || 0));
      pending.recentTrendSummary = input.recentTrendSummary || pending.recentTrendSummary;
      pending.reason = input.reason || pending.reason;
      pending.updatedAt = input.createdAt;
      return null;
    }
    const suggestion = {
      id: `goal-suggestion-${stableHash(`${directionKey}|${evidenceKey}`)}`,
      projectId: input.projectId,
      oldGoal: clean(input.oldGoal),
      suggestedGoal: clean(input.suggestedGoal),
      evidenceEventIds,
      confidence: Math.max(0, Math.min(1, Number(input.confidence || 0))),
      status: GOAL_SUGGESTION_STATUS.PENDING,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      recentTrendSummary: clean(input.recentTrendSummary),
      reason: clean(input.reason),
      directionKey,
      evidenceKey
    };
    state.goalSuggestions.push(suggestion);
    return suggestion;
  }

  function detectGoalDriftSuggestions(state, options = {}) {
    ensureState(state, { createBaselines: true, detectedAt: options.createdAt });
    const createdAt = options.createdAt || new Date().toISOString();
    const anchorTimestamp = timestampOf(createdAt);
    list(state.goalSuggestions).filter(item => item.status === GOAL_SUGGESTION_STATUS.PENDING).forEach(item => {
      const evidenceEvents = list(item.evidenceEventIds).map(id => state.activityEvents.find(event => event.id === id)).filter(Boolean);
      if (evidenceEvents.length && evidenceEvents.every(event => !isGoalEvidenceEvent(event, anchorTimestamp))) {
        item.status = GOAL_SUGGESTION_STATUS.REJECTED;
        item.reviewedAt = createdAt;
        item.rejectionReason = "证据仅来自项目设置或其他非进度变更，不再作为目标偏移依据";
        item.updatedAt = createdAt;
      }
    });
    const created = [];
    projectEntries(state).forEach(({ project }) => {
      const currentGoal = clean(project.goal);
      if (!currentGoal) return;
      const events = list(state.activityEvents)
        .filter(event => event.projectId === project.id && isGoalEvidenceEvent(event, anchorTimestamp))
        .sort((left, right) => timestampOf(left.timestamp || left.detectedAt) - timestampOf(right.timestamp || right.detectedAt));
      if (!events.length) return;

      const explicit = [...events].reverse().find(event => {
        const sources = eventSourceTypes(event);
        return (event.metadata?.goalIntent || sources.some(source => ["manual", "project_os", "codex"].includes(source))) && explicitGoalTarget(event);
      });
      if (explicit) {
        const suggestedGoal = explicitGoalTarget(explicit);
        if (suggestedGoal && semanticSimilarity(currentGoal, suggestedGoal) < 0.55) {
          const suggestion = saveGoalSuggestion(state, {
            projectId: project.id,
            oldGoal: currentGoal,
            suggestedGoal,
            evidenceEventIds: [explicit.id],
            confidence: 0.97,
            createdAt,
            recentTrendSummary: goalDirectionText(explicit),
            reason: "检测到明确的用户目标意图表达；仍需确认后才会更新当前目标。"
          });
          if (suggestion) created.push(suggestion);
        }
        return;
      }

      const cluster = clusterGoalEvents(events)[0];
      if (!cluster || cluster.events.length < GOAL_TREND_MIN_EVENTS) return;
      const ratio = cluster.events.length / events.length;
      if (ratio < GOAL_TREND_MIN_RATIO) return;
      const direction = representativeGoalDirection(cluster.events);
      if (!direction || semanticSimilarity(currentGoal, direction) >= 0.55) return;
      const directions = unique(cluster.events.map(goalDirectionText));
      const suggestion = saveGoalSuggestion(state, {
        projectId: project.id,
        oldGoal: currentGoal,
        suggestedGoal: `集中推进：${direction}`,
        evidenceEventIds: cluster.events.map(event => event.id),
        confidence: Math.min(0.94, 0.72 + cluster.events.length * 0.04 + ratio * 0.08),
        createdAt,
        recentTrendSummary: `${directions.slice(0, 3).join("；")}${directions.length > 3 ? "；等" : ""}`,
        reason: `最近 ${cluster.events.length}/${events.length} 项有效工作持续指向同一新方向，且与当前目标语义明显不同。`
      });
      if (suggestion) created.push(suggestion);
    });
    return created;
  }

  function applySnapshot(project, snapshot) {
    ["name", "purpose", "goal", "currentState", "currentPhase", "currentProgressSummary", "blockerReviewPending", "updatedAt", "lastWorkedAt"].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(snapshot, field)) project[field] = snapshot[field];
    });
    ["completed", "inProgress", "nextActions", "openIssues", "resolvedIssues", "blockers", "timeline"].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(snapshot, field)) project[field] = clone(snapshot[field]);
    });
  }

  function applyProjectPatch(project, patch = {}) {
    Object.entries(patch).forEach(([field, value]) => {
      if (["id", "workspaceId", "zoneId", "createdAt"].includes(field)) return;
      project[field] = value && typeof value === "object" ? clone(value) : value;
    });
  }

  function recalculateProjectState(state, projectId) {
    const found = findProject(state, projectId);
    if (!found) return null;
    const { zone, project } = found;
    const confirmed = list(state.activityEvents)
      .filter(event => event.projectId === projectId && event.status === EVENT_STATUS.CONFIRMED)
      .sort((left, right) => timestampOf(left.confirmedAt || left.detectedAt) - timestampOf(right.confirmedAt || right.detectedAt));
    const snapshotIndex = confirmed.reduce((latest, event, index) => event.metadata?.effect?.type === "snapshot" ? index : latest, -1);
    if (snapshotIndex >= 0) applySnapshot(project, confirmed[snapshotIndex].metadata.snapshot || {});
    const projectedEvents = confirmed.slice(snapshotIndex + 1).filter(event => event.metadata?.effect?.type !== "snapshot");
    projectedEvents.forEach(event => {
      const effect = event.metadata?.effect || { type: "timeline", value: event.normalizedSummary };
      if (effect.type === "goal_change") {
        project.goal = clean(effect.newGoal || effect.value);
      } else if (effect.type === "manual_patch") {
        applyProjectPatch(project, effect.patch);
      } else if (effect.type === "work_log") {
        project.completed = unique([...list(project.completed), ...list(effect.completed)]);
        project.inProgress = unique(effect.remaining);
        if (list(effect.nextActions).length) project.nextActions = unique([...list(effect.nextActions), ...list(project.nextActions)]).slice(0, 12);
        if (list(effect.openIssues).length) project.openIssues = unique([...list(effect.openIssues), ...list(project.openIssues)]);
        if (clean(effect.currentState)) project.currentState = clean(effect.currentState);
        if (clean(effect.currentProgressSummary)) project.currentProgressSummary = clean(effect.currentProgressSummary);
      } else if (effect.type === "completed") {
        project.completed = unique([...list(project.completed), effect.value]);
        project.inProgress = list(project.inProgress).filter(item => !item.includes(cleanCommitMessage(effect.value)));
      } else if (effect.type === "in_progress") {
        project.inProgress = unique([...list(project.inProgress), effect.value]).slice(-12);
      } else if (effect.type === "known_issue") {
        project.openIssues = unique([effect.value, ...list(project.openIssues)]);
      }
      project.timeline = [...list(project.timeline).filter(item => item.eventId !== event.id), {
        eventId: event.id,
        timestamp: event.timestamp,
        summary: event.normalizedSummary,
        sourceType: event.sourceType,
        confidence: event.confidence,
        effectType: effect.type
      }].sort((left, right) => timestampOf(right.timestamp) - timestampOf(left.timestamp)).slice(0, 200);
      project.updatedAt = event.confirmedAt || event.detectedAt || project.updatedAt;
    });
    const progressEvents = projectedEvents.filter(event => ["completed", "in_progress", "known_issue", "work_log"].includes(event.metadata?.effect?.type));
    if (progressEvents.length) {
      const priorityOf = event => {
        const type = event.metadata?.effect?.type || "timeline";
        if (type === "completed") return 4;
        if (type === "known_issue") return 3;
        if (type === "in_progress") return 2;
        const sourceIds = list(event.metadata?.sourceIds);
        const deletionOnly = sourceIds.length > 0 && sourceIds.every(sourceId => clean(sourceId).startsWith("fs-delete:"));
        return deletionOnly ? 0 : 1;
      };
      const latestConfirmation = Math.max(...progressEvents.map(event => timestampOf(event.confirmedAt || event.detectedAt)));
      const latestBatch = progressEvents.filter(event => timestampOf(event.confirmedAt || event.detectedAt) === latestConfirmation);
      const representative = latestBatch.reduce((best, event) => {
        if (!best) return event;
        const priorityDifference = priorityOf(event) - priorityOf(best);
        if (priorityDifference !== 0) return priorityDifference > 0 ? event : best;
        return timestampOf(event.timestamp || event.detectedAt) >= timestampOf(best.timestamp || best.detectedAt) ? event : best;
      }, null);
      if (representative.metadata?.effect?.type !== "work_log") {
        project.currentProgressSummary = representative.normalizedSummary;
        project.currentState = `最近确认：${representative.normalizedSummary}`;
      }
      project.lastWorkedAt = representative.timestamp || representative.confirmedAt;
      zone.summary = project.currentState;
      zone.updatedAt = representative.confirmedAt || representative.detectedAt || zone.updatedAt;
    } else if (projectedEvents.length) {
      zone.updatedAt = projectedEvents.at(-1).confirmedAt || projectedEvents.at(-1).detectedAt || zone.updatedAt;
    }
    return project;
  }

  function learnRoutingRule(state, event, projectId, nowValue) {
    const pathValue = clean(event.metadata?.repoPath || event.metadata?.rootPath);
    if (!pathValue || !projectId) return null;
    const existing = state.routingRules.find(rule => rule.matchType === "path_prefix" && normalizePath(rule.pattern) === normalizePath(pathValue));
    if (existing) {
      existing.projectId = projectId;
      existing.updatedAt = nowValue;
      existing.correctionCount = Number(existing.correctionCount || 0) + 1;
      existing.active = true;
      return existing;
    }
    const rule = {
      id: `routing-rule-${stableHash(`${pathValue}|${projectId}`)}`,
      matchType: "path_prefix",
      pattern: pathValue,
      projectId,
      confidence: 0.99,
      source: "user_confirmation",
      correctionCount: 1,
      active: true,
      createdAt: nowValue,
      updatedAt: nowValue
    };
    state.routingRules.push(rule);
    return rule;
  }

  function goalSuggestionEvidence(state, suggestion) {
    const events = list(state.activityEvents).filter(event => list(suggestion.evidenceEventIds).includes(event.id));
    return unique(events.flatMap(event => event.evidence));
  }

  function setGoalSuggestionStatus(state, suggestionId, status, options = {}) {
    ensureState(state, { createBaselines: true });
    if (![GOAL_SUGGESTION_STATUS.REJECTED, GOAL_SUGGESTION_STATUS.DEFERRED].includes(status)) return null;
    const suggestion = state.goalSuggestions.find(item => item.id === suggestionId);
    if (!suggestion || ![GOAL_SUGGESTION_STATUS.PENDING, GOAL_SUGGESTION_STATUS.DEFERRED].includes(suggestion.status)) return null;
    const timestamp = options.reviewedAt || new Date().toISOString();
    suggestion.status = status;
    suggestion.updatedAt = timestamp;
    suggestion.reviewedAt = timestamp;
    if (status === GOAL_SUGGESTION_STATUS.REJECTED) suggestion.rejectedAt = timestamp;
    if (status === GOAL_SUGGESTION_STATUS.DEFERRED) suggestion.deferredAt = timestamp;
    return suggestion;
  }

  function acceptGoalSuggestion(state, suggestionId, options = {}) {
    ensureState(state, { createBaselines: true });
    const suggestion = state.goalSuggestions.find(item => item.id === suggestionId);
    if (!suggestion || ![GOAL_SUGGESTION_STATUS.PENDING, GOAL_SUGGESTION_STATUS.DEFERRED].includes(suggestion.status)) return null;
    const found = findProject(state, suggestion.projectId);
    if (!found) return null;
    const acceptedAt = options.acceptedAt || new Date().toISOString();
    const newGoal = clean(options.goal || suggestion.suggestedGoal);
    const oldGoal = clean(found.project.goal);
    if (!newGoal || newGoal === oldGoal) return null;
    const eventId = `activity-${stableHash(`goal_change|${suggestion.id}|${acceptedAt}`)}`;
    const acceptanceEvidence = evidenceRecord({
      sourceType: "project_os",
      kind: "goal_change_confirmation",
      locator: suggestion.id,
      summary: options.edited ? "用户编辑后接受目标变更建议" : "用户接受目标变更建议"
    }, eventId, 0, acceptedAt);
    const evidenceIds = unique([...goalSuggestionEvidence(state, suggestion), acceptanceEvidence.id]);
    const summary = `项目目标由「${oldGoal}」更新为「${newGoal}」`;
    const event = {
      id: eventId,
      timestamp: acceptedAt,
      detectedAt: acceptedAt,
      sourceType: "project_os",
      sourceId: `goal_suggestion:${suggestion.id}:accepted`,
      projectId: suggestion.projectId,
      eventType: "goal_change",
      rawSummary: summary,
      normalizedSummary: summary,
      evidence: evidenceIds,
      confidence: suggestion.confidence,
      status: EVENT_STATUS.CONFIRMED,
      confirmedAt: acceptedAt,
      reviewedAt: acceptedAt,
      metadata: {
        confirmedByUser: true,
        goalSuggestionId: suggestion.id,
        sourceEventIds: clone(suggestion.evidenceEventIds),
        facts: [summary],
        inference: "",
        effect: { type: "goal_change", oldGoal, newGoal }
      }
    };
    state.activityEvents.push(event);
    state.activityEvidence.push(acceptanceEvidence);
    suggestion.status = GOAL_SUGGESTION_STATUS.ACCEPTED;
    suggestion.acceptedAt = acceptedAt;
    suggestion.acceptedGoal = newGoal;
    suggestion.goalChangeEventId = event.id;
    suggestion.updatedAt = acceptedAt;
    recalculateProjectState(state, suggestion.projectId);
    return event;
  }

  function undoGoalSuggestion(state, suggestionId, options = {}) {
    ensureState(state, { createBaselines: true });
    const suggestion = state.goalSuggestions.find(item => item.id === suggestionId);
    if (!suggestion || suggestion.status !== GOAL_SUGGESTION_STATUS.ACCEPTED) return null;
    const found = findProject(state, suggestion.projectId);
    if (!found) return null;
    const original = state.activityEvents.find(event => event.id === suggestion.goalChangeEventId);
    if (!original || original.status !== EVENT_STATUS.CONFIRMED) return null;
    const undoneAt = options.undoneAt || new Date().toISOString();
    original.status = EVENT_STATUS.REJECTED;
    original.rejectedAt = undoneAt;
    original.metadata = { ...original.metadata, rejectionReason: "用户撤销目标修改" };
    const restoredGoal = clean(original.metadata?.effect?.oldGoal || suggestion.oldGoal);
    const currentGoal = clean(found.project.goal);
    const eventId = `activity-${stableHash(`goal_change_undo|${suggestion.id}|${undoneAt}`)}`;
    const undoEvidence = evidenceRecord({
      sourceType: "project_os",
      kind: "goal_change_undo",
      locator: suggestion.id,
      summary: "用户撤销目标修改"
    }, eventId, 0, undoneAt);
    const summary = `撤销目标变更：项目目标由「${currentGoal}」恢复为「${restoredGoal}」`;
    const undoEvent = {
      id: eventId,
      timestamp: undoneAt,
      detectedAt: undoneAt,
      sourceType: "project_os",
      sourceId: `goal_suggestion:${suggestion.id}:undo:${undoneAt}`,
      projectId: suggestion.projectId,
      eventType: "goal_change_undo",
      rawSummary: summary,
      normalizedSummary: summary,
      evidence: unique([...goalSuggestionEvidence(state, suggestion), undoEvidence.id]),
      confidence: 1,
      status: EVENT_STATUS.CONFIRMED,
      confirmedAt: undoneAt,
      reviewedAt: undoneAt,
      metadata: {
        confirmedByUser: true,
        goalSuggestionId: suggestion.id,
        undoOfEventId: original.id,
        facts: [summary],
        inference: "",
        nonReversible: true,
        effect: { type: "goal_change", oldGoal: currentGoal, newGoal: restoredGoal }
      }
    };
    state.activityEvents.push(undoEvent);
    state.activityEvidence.push(undoEvidence);
    suggestion.status = GOAL_SUGGESTION_STATUS.REJECTED;
    suggestion.rejectedAt = undoneAt;
    suggestion.undoneAt = undoneAt;
    suggestion.undoEventId = undoEvent.id;
    suggestion.updatedAt = undoneAt;
    recalculateProjectState(state, suggestion.projectId);
    return undoEvent;
  }

  function applyReviewDecisions(state, decisions, options = {}) {
    ensureState(state, { createBaselines: true });
    const confirmedAt = options.confirmedAt || new Date().toISOString();
    const affected = new Set();
    const counts = { confirmed: 0, ignored: 0, pending: 0 };
    list(decisions).forEach(decision => {
      const event = state.activityEvents.find(item => item.id === decision.eventId);
      if (!event || event.status !== EVENT_STATUS.SUGGESTED) return;
      if (decision.action === "ignore") {
        event.status = EVENT_STATUS.IGNORED;
        event.reviewedAt = confirmedAt;
        counts.ignored += 1;
        return;
      }
      const projectId = decision.projectId || event.projectId;
      if (!projectId || !findProject(state, projectId)) {
        counts.pending += 1;
        return;
      }
      const changedRoute = event.projectId !== projectId || event.confidence < ROUTE_THRESHOLDS.automatic;
      event.projectId = projectId;
      event.status = EVENT_STATUS.CONFIRMED;
      event.confirmedAt = confirmedAt;
      event.reviewedAt = confirmedAt;
      event.metadata = { ...event.metadata, confirmedByUser: true };
      if (changedRoute) learnRoutingRule(state, event, projectId, confirmedAt);
      affected.add(projectId);
      counts.confirmed += 1;
    });
    affected.forEach(projectId => recalculateProjectState(state, projectId));
    return counts;
  }

  function rejectEvent(state, eventId, options = {}) {
    const event = list(state.activityEvents).find(item => item.id === eventId);
    if (!event || event.eventType === "project_state_baseline" || event.metadata?.nonReversible) return false;
    if (event.eventType === "goal_change" && event.metadata?.goalSuggestionId) {
      return Boolean(undoGoalSuggestion(state, event.metadata.goalSuggestionId, { undoneAt: options.rejectedAt }));
    }
    const projectId = event.projectId;
    event.status = EVENT_STATUS.REJECTED;
    event.rejectedAt = options.rejectedAt || new Date().toISOString();
    event.metadata = { ...event.metadata, rejectionReason: clean(options.reason || "用户撤销") };
    if (projectId) recalculateProjectState(state, projectId);
    return true;
  }

  function reopenEventForReview(state, eventId, options = {}) {
    const event = list(state.activityEvents).find(item => item.id === eventId);
    if (!event || event.status !== EVENT_STATUS.CONFIRMED || ["project_state_baseline", "goal_change", "goal_change_undo"].includes(event.eventType)) return false;
    const projectId = event.projectId;
    event.status = EVENT_STATUS.SUGGESTED;
    event.reopenedAt = options.reopenedAt || new Date().toISOString();
    event.metadata = { ...event.metadata, previousProjectId: projectId };
    if (projectId) recalculateProjectState(state, projectId);
    return true;
  }

  function createSyncRun(state, options = {}) {
    ensureState(state, { createBaselines: true });
    const startedAt = options.startedAt || new Date().toISOString();
    const run = {
      id: options.id || `sync-${stableHash(`${startedAt}|${Math.random()}`)}`,
      workspaceId: state.workspaceId || "normal",
      status: "running",
      syncStartedAt: startedAt,
      syncFinishedAt: null,
      since: options.since || null,
      until: options.until || startedAt,
      collectorStatuses: [],
      discoveredCount: 0,
      deduplicatedCount: 0,
      confirmedCount: 0,
      ignoredCount: 0,
      pendingCount: 0,
      errorCount: 0
    };
    state.syncRuns.push(run);
    return run;
  }

  function finishSyncRun(state, runId, result, options = {}) {
    ensureState(state, { createBaselines: true });
    const run = state.syncRuns.find(item => item.id === runId);
    if (!run) return null;
    const finishedAt = options.finishedAt || new Date().toISOString();
    run.status = "completed";
    run.syncFinishedAt = finishedAt;
    run.collectorStatuses = clone(result.collectorStatuses || []);
    run.discoveredCount = Number(result.discoveredCount || result.candidates?.length || 0);
    run.deduplicatedCount = Number(result.deduplicatedCount || 0);
    run.pendingCount = Number(result.pendingCount || 0);
    run.errorCount = run.collectorStatuses.filter(item => item.status === "failed").length;
    state.settings.autoSync.lastSyncAt = run.until || finishedAt;
    run.collectorStatuses.forEach(status => {
      if (status.status === "success" && status.configured !== false) state.settings.autoSync.collectorCheckpoints[status.sourceType] = run.until || finishedAt;
    });
    if (result.fileIndexes && typeof result.fileIndexes === "object") state.settings.autoSync.fileIndexes = result.fileIndexes;
    return run;
  }

  function syncWindow(state, nowValue = new Date().toISOString()) {
    ensureState(state, { createBaselines: true });
    const configured = state.settings.autoSync;
    const hours = Math.max(1, Number(configured.firstSyncLookbackHours || FIRST_SYNC_LOOKBACK_HOURS));
    const fallback = new Date(timestampOf(nowValue) - hours * 60 * 60 * 1000).toISOString();
    return { since: configured.lastSyncAt || fallback, until: nowValue };
  }

  function collectorRequest(state, options = {}) {
    const windowRange = syncWindow(state, options.until || new Date().toISOString());
    const configuredCheckpoints = clone(state.settings.autoSync.collectorCheckpoints || {});
    const hours = Math.max(1, Number(state.settings.autoSync.firstSyncLookbackHours || FIRST_SYNC_LOOKBACK_HOURS));
    const firstSourceCheckpoint = new Date(timestampOf(windowRange.until) - hours * 60 * 60 * 1000).toISOString();
    const sourceCheckpoints = {
      ...configuredCheckpoints,
      git: configuredCheckpoints.git || firstSourceCheckpoint,
      filesystem: configuredCheckpoints.filesystem || firstSourceCheckpoint
    };
    return {
      since: windowRange.since,
      until: windowRange.until,
      sourceCheckpoints,
      fileIndexes: clone(state.settings.autoSync.fileIndexes || {}),
      projects: projectEntries(state).map(({ zone, project }) => {
        const sourceBindings = ensureProjectSourceBindings(project).filter(binding => binding.active !== false);
        return {
          id: project.id,
          zoneId: zone.id,
          name: project.name,
          sourcePaths: unique(project.sourcePaths),
          sources: sourceBindings.map(binding => ({
            id: binding.id,
            path: binding.canonicalPath,
            aliases: clone(binding.aliases),
            identity: binding.identity ? clone(binding.identity) : null
          })),
          routingKeywords: unique(project.routingKeywords)
        };
      })
    };
  }

  function localDayKey(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function buildDailyBrief(state, nowValue = new Date().toISOString()) {
    ensureState(state, { createBaselines: true });
    const nowDate = new Date(nowValue);
    const yesterdayDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1, 12);
    const yesterdayKey = localDayKey(yesterdayDate);
    const events = list(state.activityEvents)
      .filter(event => event.status === EVENT_STATUS.CONFIRMED && event.metadata?.effect?.type !== "snapshot")
      .map(event => ({ event, found: findProject(state, event.projectId) }))
      .filter(entry => entry.found);
    const yesterday = events
      .filter(({ event }) => localDayKey(event.timestamp || event.confirmedAt) === yesterdayKey)
      .sort((left, right) => timestampOf(right.event.timestamp) - timestampOf(left.event.timestamp))
      .map(({ event, found }) => ({
        eventId: event.id,
        projectId: found.project.id,
        projectName: found.project.name,
        zoneId: found.zone.id,
        zoneName: found.zone.name,
        summary: event.normalizedSummary,
        timestamp: event.timestamp,
        sourceType: event.sourceType,
        reason: clean(event.metadata?.changeReason || event.metadata?.routeReason)
      }));
    const todayActions = projectEntries(state)
      .filter(({ zone, project }) => zone.status !== "COMPLETED" && project.status !== "COMPLETED" && project.status !== "FROZEN")
      .map(({ zone, project }) => {
        const running = list(project.sessions).find(session => !session.endedAt && session.status !== "PAUSED");
        const paused = list(project.sessions).find(session => !session.endedAt && session.status === "PAUSED");
        const action = clean(running?.todos?.find(todo => !todo.completed)?.text || project.nextActions?.[0] || project.inProgress?.[0] || paused?.todos?.find(todo => !todo.completed)?.text || project.goal);
        return action ? {
          projectId: project.id,
          projectName: project.name,
          zoneId: zone.id,
          zoneName: zone.name,
          action,
          reason: running ? "继续未结束的工作" : project.nextActions?.length ? "项目已确认的下一步" : project.inProgress?.length ? "继续当前进行中事项" : paused ? "可恢复暂停中的工作" : "当前项目目标",
          priority: running ? 4 : list(project.blockers).some(blocker => blocker.status === "OPEN" && blocker.priority === "HIGH") ? 1 : project.nextActions?.length ? 3 : 2,
          updatedAt: project.updatedAt
        } : null;
      })
      .filter(Boolean)
      .sort((left, right) => right.priority - left.priority || timestampOf(left.updatedAt) - timestampOf(right.updatedAt));
    const blocked = projectEntries(state).flatMap(({ zone, project }) => list(project.blockers)
      .filter(blocker => blocker.status === "OPEN")
      .map(blocker => ({
        blockerId: blocker.id,
        projectId: project.id,
        projectName: project.name,
        zoneId: zone.id,
        zoneName: zone.name,
        text: blocker.text,
        priority: blocker.priority || "NORMAL",
        updatedAt: blocker.updatedAt || blocker.createdAt
      })))
      .sort((left, right) => (left.priority === "HIGH" ? -1 : 1) - (right.priority === "HIGH" ? -1 : 1) || timestampOf(right.updatedAt) - timestampOf(left.updatedAt));
    const pathIssues = projectEntries(state).flatMap(({ zone, project }) => ensureProjectSourceBindings(project)
      .filter(binding => binding.active !== false && binding.status === "missing")
      .map(binding => ({ zoneId: zone.id, zoneName: zone.name, projectId: project.id, projectName: project.name, bindingId: binding.id, path: binding.canonicalPath, message: binding.statusMessage || "目录暂时不可用" })));
    return {
      generatedAt: nowValue,
      yesterday,
      todayActions,
      blocked,
      pathIssues,
      reviewCount: list(state.activityEvents).filter(event => event.status === EVENT_STATUS.SUGGESTED).length
        + list(state.goalSuggestions).filter(item => item.status === GOAL_SUGGESTION_STATUS.PENDING).length
    };
  }

  root.ProjectOSAutoSync = {
    EVENT_STATUS,
    GOAL_SUGGESTION_STATUS,
    ROUTE_THRESHOLDS,
    FIRST_SYNC_LOOKBACK_HOURS,
    GOAL_TREND_WINDOW_DAYS,
    GOAL_TREND_MIN_EVENTS,
    stableHash,
    ensureState,
    projectSnapshot,
    createSnapshotEvent,
    recordProjectSnapshot,
    recordProjectChange,
    recordWorkLog,
    ensureProjectSourceBindings,
    reconcileProjectSources,
    applyCollectorSourceReports,
    correlateCandidates,
    routeEvent,
    normalizeCollectedActivities,
    detectGoalDriftSuggestions,
    acceptGoalSuggestion,
    setGoalSuggestionStatus,
    undoGoalSuggestion,
    recalculateProjectState,
    applyReviewDecisions,
    rejectEvent,
    reopenEventForReview,
    createSyncRun,
    finishSyncRun,
    syncWindow,
    collectorRequest,
    buildDailyBrief
  };
})(typeof window !== "undefined" ? window : globalThis);
