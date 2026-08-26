# v2.10 数据模型

## 双工作区结构

```text
IndexedDB: project-archive-cockpit
├─ workspace:normal → 正式 State
├─ workspace:demo   → 通用演示 State
└─ workspace:jpr-demo → JPR 专用演示 State
```

三套 State 使用相同结构，但实体都带 `workspaceId: "normal" | "demo" | "jpr-demo"`，按工作区独立保存和读取。

```text
State
├─ version, workspaceId
├─ zones[]
│  └─ projects[]
│     └─ sessions[]
├─ zoneLinks[]
├─ contextEvents[]
├─ inspirations[]
├─ skills[]
├─ settings
├─ createdAt
└─ updatedAt
```

核心边界：

```text
Normal Workspace ≠ Demo Workspace ≠ JPR Demo Workspace
Zone Shared Memory ≠ Project Memory ≠ Session History
Zone ≠ Project ≠ Session
Workspace Inspiration ≠ Project Parking Lot / Backlog
```

## Workspace 灵感 Inspiration

```text
Inspiration
├─ id, workspaceId, text
├─ source: dashboard | session
├─ zoneId, projectId, sessionId       ← 可选来源引用
├─ zoneName, projectName              ← 来源名称快照
├─ orbPresetId                         ← 稳定绑定的四种 AI 球预设之一
├─ aiState: idle | thinking | ready | attention | error
├─ aiSummary, aiUpdatedAt              ← 可选 AI 反馈与更新时间
└─ createdAt, updatedAt
```

`inspirations[]` 保存尚未成为任务的 Workspace 级想法。首页与 Session 都可以显式添加；项目的 `parkingLot[]`、Session 的 `parkingAdded[]` 不会自动迁移、复制或汇总到灵感库。三套 Workspace 各自保存独立的 `inspirations[]`。`orbPresetId` 是灵感的视觉身份，不随 AI 状态改变；`aiState` 控制有限的速度、光晕与形变反馈，并同步进入球卡片的可访问标签，球面不覆盖文字。旧数据缺少这些字段时会在读取阶段获得稳定的球预设和 `idle` 状态。

## 主任务 Zone

```text
Zone
├─ id, workspaceId
├─ name, purpose, motherGoal, summary
├─ status: ACTIVE | PAUSED | FROZEN | COMPLETED
├─ sharedMemory[]
├─ constraints[], projects[]
├─ paused   ← 旧版兼容
├─ color
└─ createdAt, updatedAt
```

Zone 代表长期方向，最多 7 个。`sharedMemory[]` 只保存该 Zone 下项目允许共同读取的背景。

## 次级项目 Project

```text
Project
├─ id, workspaceId, zoneId
├─ name, purpose, goal, currentState, currentPhase, currentProgressSummary
├─ status: ACTIVE | PAUSED | FROZEN | COMPLETED
├─ completed[], importedMilestones[], inProgress[], nextActions[]
├─ decisions[], constraints[], openIssues[], resolvedIssues[]
├─ blockers[], blockerReviewPending
├─ snapshotMeta
├─ assets[], backlog[], parkingLot[]
├─ projectMemory[]
├─ skillIds[], sessions[]
├─ keepWhenEmpty
├─ nonSessionUpdatedAt
├─ createdAt, updatedAt, lastWorkedAt
└─ color
```

- `keepWhenEmpty: true` 表示即使没有工作记录，也保留项目壳和用户确认的背景。
- `currentPhase` 使用 `IDEA / EXPLORATION / PROTOTYPE / VALIDATION / STABILIZATION / DELIVERY / PAUSED`；空值表示待确认。
- `importedMilestones[]` 保存从旧 AI 对话确认导入的历史成果，包含 `summary`、`source: "AI_BOOTSTRAP"`、`importedAt` 和可选 `originalDate`。它不伪装成 Session History。
- `snapshotMeta` 记录 Snapshot 的来源、导入时间和状态是 AI 明确给出还是本地保守派生。
- `blockerReviewPending: true` 表示存在 Open Issues，但没有证据可把它们直接判定为 Blocker。
- `openIssues[]` 与 `resolvedIssues[]` 分别保存未解决和已解决的问题标签；用户可勾选切换状态，也可用 `×` 物理删除单条问题。
- `nonSessionUpdatedAt` 区分用户直接保存的项目状态与 Session 派生更新时间，便于删除历史后回算。
- 同一 Zone 下的项目可以读取 Zone Shared Memory，但不能读取其他项目的私有 Memory、提示词和工作历史。

## 本次工作 Session

```text
Session
├─ id, workspaceId, projectId
├─ status: RUNNING | PAUSED | ENDED
├─ startedAt, pausedAt, resumedAt, endedAt
├─ focusMinutes, timeConfirmedAt, timeEntryMode
├─ source: manual | ai | demo
├─ title
├─ originType: PROJECT_CREATED | PROJECT_IMPORT | null
├─ initialSnapshot
│  ├─ currentState, goal, completed[], nextStep
│  └─ importedAt, source
├─ bootstrapJson | null
├─ goal, todos[], notes, drafts
├─ blockerIds[]
├─ generatedPrompts[], importedResults[]
├─ formalContributions
├─ completed[], discoveries[], remainingIssues[]
├─ nextStep, parkingAdded[], summary
├─ isDemo, promotedToFormal   ← 旧版兼容
└─ createdAt, updatedAt
```

新建 Session 是否属于演示环境由 `workspaceId` 决定。`isDemo` 与 `promotedToFormal` 只用于读取和治理 v2.3 / v2.4 旧版单次演示记录。

- `PAUSED` 只表示本次工作暂时离开，不改变 Project / Zone 生命周期，也不引入暂停计时；重新进入同一 Session 时恢复为 `RUNNING`。
- 结束 Session 时，系统预填本地开始/结束时间，用户可修改并必须确认；确认后写入 `focusMinutes`、`timeConfirmedAt` 与 `timeEntryMode: "MANUAL_CONFIRMED"`。
- “本周专注”只合计本地周内结束且存在人工确认记录的 `focusMinutes`。旧 Session、运行中 Session 和未确认时长的 Session 不计入。
- 本口径不记录后台暂停区间；用户通过结束时修正开始/结束时间来确认最终分钟数。跨周 Session 当前按确认后的结束时间归入一周，不拆分重叠区间。
- `drafts` 保存未确认的求助输入、现状总结、工作总结、结束总结、项目暂存输入和灵感输入。活动 Session 同时在 `localStorage` 保存按 `workspaceId + sessionId` 隔离的恢复镜像，以覆盖页面意外退出时 IndexedDB 写入尚未完成的窗口。
- “总结工作”的 AI 返回使用完整 Project Snapshot 字段，但只作为 `PROJECT_UPDATE` 建议写入当前 Session；必须通过 `project_name` 身份校验和逐字段人工确认，不会调用 Project 创建流程。
- Session 结束、删除或 Demo Workspace 重置时，对应恢复镜像会清理。

- 手动建立 Project 时立即创建已结束的 `No.1 · 项目建立`，`originType: "PROJECT_CREATED"`。
- AI 导入 Project 时立即创建已结束的 `No.1 · 项目导入`，`originType: "PROJECT_IMPORT"`，并保存用户确认后的初始 Snapshot 与原始 `bootstrapJson`。
- Project 的建立本身就是第一条正式工作历史，后续真正开始工作时从 No.2 继续编号。

## 任务生命周期

```text
ACTIVE    → 进行中 → 可编辑、暂停、冻结、完成、删除
PAUSED    → 已暂停 → 可编辑、重新开启、冻结、删除
FROZEN    → 已冻结 → 可查看存档、重新开启、删除
COMPLETED → 已完成 → 可查看存档、重新开启、删除
```

- PAUSED、FROZEN 和 COMPLETED 完整保留任务数据，但不参与今日建议、最近活跃和活跃项目统计。
- 重新开启只把原实体切回 ACTIVE 并更新 `updatedAt`，不会创建新 Zone / Project。
- Project / Zone 生命周期和 Session 的 RUNNING / PAUSED / ENDED 相互独立。
- 旧 `paused: true` 在读取时迁移为 PAUSED；后续以 `status` 为权威字段。

`formalContributions` 记录该 Session 直接贡献到 Project 的 Completed、Next Action、Open Issues、可回滚 Current State 和 Current Progress Summary。删除 Session 时据此移除临时派生；正式写入 Project Memory、Decisions 或 Assets 的内容默认保留。

## 当前阻塞 Blocker

```text
Blocker
├─ id, workspaceId, projectId
├─ text
├─ status: OPEN | RESOLVED | DEFERRED
├─ priority: HIGH | NORMAL
├─ source: manual | session-plan | ai
├─ sourceSessionId | null
├─ createdAt, updatedAt
├─ resolvedAt | null
└─ deferredAt | null
```

- 计划弹窗选择“没有”时保存 `blockers: []`，不生成“无阻塞”文字。
- 计划中新增的真实问题使用 `source: "session-plan"`、`priority: "HIGH"`，并写入新 Session 的 `blockerIds[]`。
- Project Resume 允许 OPEN → RESOLVED / DEFERRED，以及重新打开；关闭只改变状态，不物理删除历史。
- 现状总结只把 `status === "OPEN"` 的条目放入“当前阻塞”。
- 状态审查的 `active_problems` 写入 `openIssues[]`。只有用户明确记录或 Bootstrap 明确提供 `current_blockers` 时才建立 Blocker。

### AI Result

```text
ImportedResult
├─ resultType: HELP | STATUS_REVIEW
├─ completed[], changes[], verification[]
├─ discoveries[], decisions[], remainingIssues[], inProgress[]
├─ activeProblems[]           ← ACTIVE_PROBLEMS
├─ currentBlockers[]          ← CURRENT_BLOCKERS
├─ currentStateSummary[]      ← CURRENT_STATE_SUMMARY
├─ progressSummary[]          ← CURRENT_PROGRESS_SUMMARY 或 CURRENT_STATE_SUMMARY
├─ progressJudgement          ← PROGRESS_JUDGEMENT
├─ progressPhase              ← progress_judgement.phase
├─ recommendedNextStep        ← RECOMMENDED_NEXT_STEP
├─ optionalNextSteps[]        ← OPTIONAL_NEXT_STEPS
├─ shouldStopOrDefer[]        ← SHOULD_STOP_OR_DEFER
├─ memoryUpdates[]            ← MEMORY_UPDATE
├─ appliedSelections
│  ├─ state, completed, inProgress, problems, blockers
│  ├─ phase, reason, next
│  └─ optional, defer, memory
├─ confirmedDraft             ← 用户修改后的 AI 建议快照
└─ raw, source, importedAt, createdAt, updatedAt
```

只有用户在更新预览中勾选并确认的字段才写入对应 Project 区域。`completed` 默认不勾选；没有明确完成证据时不会改变 `Project.completed[]`。推荐下一步通过前置写入 `nextActions[0]` 成为 Project Resume 的核心动作。

正式删除采用物理删除：Session 会从 `project.sessions`、聚合 Workspace 和 IndexedDB `sessions` store 中移除；不保存 `deletedAt` 墓碑、回收站或隐藏副本。

## 最后一条工作历史删除

是否进入最后历史确认只看当前 Project 的正式 `sessions[]` 数量，不再被 Memory、Assets、Decisions、Backlog 或当前状态阻止。

```text
删除最后一条有效 Session
├─ 不勾选“单独保留这个项目”
│  ├─ 物理删除 Session
│  ├─ 物理删除 Project 及其嵌套资料
│  └─ 从 Zone.projects[] 同步移除
└─ 勾选“单独保留这个项目”
   ├─ 物理删除 Session
   ├─ 保留 Project 名称、目的和长期资料
   └─ 清空 Goal / Completed / InProgress / Issues / Blockers / NextActions，状态改为“尚未开始 / 无工作记录”
```

正式删除仍不保存 `deletedAt` 墓碑；已删除 Session 与 Project 不进入 AI 上下文或 JSON 导出。

## Context Event

```text
ContextEvent
├─ id, workspaceId
├─ sourceProjectId, sourceProjectName
├─ sourceStatus
├─ type, payload
├─ status / confirmedAt
└─ createdAt, updatedAt
```

移除 Project 时：

- 已确认、已保存或带 `confirmedAt` 的事件保留，`sourceProjectId` 清空，并标记 `sourceStatus: "来源项目已移除"`；
- 仅用于实时引用的未确认事件会物理删除；
- Demo Context Event 永远只存在于 `workspace:demo`，不会通过正式 ZoneLink 同步。

通过任务操作菜单永久删除时使用更强规则：Project 物理删除其全部嵌套数据；Zone 级联物理删除全部 Project，并移除涉及该 Zone 的实时 ZoneLink。已经确认的 Context Event 保留，但清空已删除来源 ID，并标记 `sourceStatus: "来源任务已删除"`。

## 主任务关联 ZoneLink

```text
ZoneLink
├─ id, workspaceId
├─ sourceZoneId, targetZoneId
├─ scopes[]
└─ createdAt, updatedAt
```

支持进度、内容、指标和 Zone Shared Memory 白名单。Project Memory、完整 Session、技术调试、源代码和内部提示词不因关联自动传播。

当前没有 `ProjectLink` 实体或“次级项目 ↔ 次级项目”直接关联设置；两个次级项目需要先通过各自所属的主任务建立 ZoneLink。首页的今日总结只读取当前 Workspace 内当天 Session 与其所属 Project，不会跨 ZoneLink 合并另一工作区或另一项目的私有记忆。

## 技能 Skill

```text
Skill
├─ id, workspaceId
├─ name, type
├─ description, source
├─ path, repository, version
├─ tags[], status
└─ createdAt, updatedAt
```

`type` 支持 `installed`（第三方）、`self`（自建）和 `external`（外部工具）。Demo 初始化时复制一份能力目录到演示工作区，后续关联和修改与正式工作区隔离。

## IndexedDB 实体镜像

- 数据库：`project-archive-cockpit`。
- 对象仓库：`workspace`、`zones`、`projects`、`sessions`、`memories`、`contextLinks`、`skills`、`settings`。
- 聚合键：`workspace:normal`、`workspace:demo`、`workspace:jpr-demo`。
- 拆分实体使用工作区前缀的存储键，并保留原 `entityId` 与 `workspaceId`，因此保存 Demo 时不会清空 Normal，反之亦然。
- 旧 `primary-workspace` 只作为迁移读取来源。
- localStorage 分别保存标准页与 JPR 页的界面偏好、活动 Session 草稿恢复镜像；只有标准页保存当前工作区模式。JPR 页面固定进入 `workspace:jpr-demo`，并继续读取必要的旧版迁移键。

## 备份结构

```text
正式默认：{ schemaVersion, exportedAt, workspace }
正式 + Demo：{ schemaVersion, exportedAt, workspace, demoWorkspace }
演示单独：{ schemaVersion, exportedAt, workspaceMode: "demo", workspace }
```

默认正式导出会过滤旧版 `isDemo: true` 与任何旧 `deletedAt` Session；已经物理删除的数据不存在于源状态，因此永远不会导出。

## 存储适配层

```text
StorageAdapter
├─ exportState(normalState, options)
├─ exportDemoState(demoState)
├─ importState(payload)
├─ serializeState(payload)
├─ hydrateBundle(payload)
└─ hydrateState(payload)

IndexedDBAdapter       ← 当前启用
MemoryStorageAdapter   ← IndexedDB 不可用时回退
CloudAdapterStub       ← 未来云端占位，当前禁用
```

本版不访问网络、不扫描本机技能目录，也不启用云同步。
