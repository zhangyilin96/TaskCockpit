# Project OS 彻底审计与重构记录

> 审计日期：2026-08-31
> 审计范围：仓库结构、数据模型、状态投影、Auto Sync、项目关系、工作历史、路径移动、主要交互、测试与真实浏览器流程。
> 结论：问题不是局部 UI Bug，而是“Project 聚合字段存在多个写入者”与“绝对路径被当成身份”共同造成的系统性回退。

## 现状问题 → 根因 → 修改 → 验证结果 → 仍待处理

| 现状问题 | 根因 | 修改 | 验证结果 | 仍待处理 |
| --- | --- | --- | --- | --- |
| 手工编辑、Session、AI 建议和 Auto Sync 会互相覆盖或回退 | 多个模块直接写同一组 Project 字段；重算只认识 Auto Sync 快照 | 引入 `manual_patch`、`work_log` 事件；所有关键人工变更写入同一可重放日志；删除 Session 时拒绝对应 work log 后重新投影 | 用户修正、撤销 Auto Event、补录旧日期、删除 Session 的回归测试通过；浏览器删除工作记录后状态正确回到基线，阻塞仍保留 | 仍需用真实用户旧备份做一次迁移演练 |
| 首页不能回答昨天做了什么、今天做什么、卡在哪里 | 首页围绕统计、灵感和最近三条活动组织，缺少日常决策模型 | 新增 `buildDailyBrief()` 和“昨天 / 今天 / 卡点”三列；只读 confirmed 事实；Review 数和失效路径保持可见 | 单元测试覆盖本地日期、行动、阻塞；浏览器验证暂停工作成为今日入口，明确阻塞始终显示 | 昨日分组尚未提供周/月回顾视图，本轮不扩产品范围 |
| 自动记录把同目录、相近时间的文件揉成一条“更新 N 个文件” | 相关性只依赖绝对目录和 30 分钟窗口；摘要丢失文件语义 | 使用稳定 source binding、repo fingerprint、显式 `workUnitKey` 和更短文件 burst；根目录文件不做模糊聚合；单文件摘要展示具体路径；旧泛化摘要自动升级 | 临时 Git 仓库移动后 sourceId 不变；浏览器 Review 显示“修改文件：auto-sync.js”，不再只有计数 | 大型仓库仍可能产生较多独立文件事件；历史页只展示最近 8 条并跳转完整证据线 |
| 文件移动或重命名后丢失监听、重复创建或回到旧路径 | Git / Filesystem sourceId 和 file index 都包含绝对路径；没有别名与身份恢复 | Project 增加 `sourceBindings[]`；binding ID 稳定，保存 canonicalPath、aliases、identity、状态；Git 用 remote + root commit 指纹；索引用 binding ID | 自动测试实际移动临时 Git 仓库；别名恢复与多目录索引隔离通过；浏览器两个目录均显示可用 | 非 Git 目录只能依赖 binding 与历史别名，无法像 Git 一样做内容身份确认 |
| 多目录监听保存时父目录与子目录被误合并 | 路径误用了面向自然语言待办的模糊 `dedupeList` | sourcePaths 改为精确 Set 去重，禁止语义相似度参与路径保存 | 浏览器先复现“2 条变 1 条”，修复后显示“工作目录 · 2”；回归测试锁定 | 嵌套目录会采集重叠文件，当前通过 sourceId 去重但仍建议用户避免无意义嵌套 |
| 目标偏移把“修改项目设置”误判成新方向 | Goal Drift 将 `manual_patch` 当作语义工作趋势 | 排除设置 patch；只保留明确 goal intent 或真实工作趋势；自动关闭只由非进度证据构成的旧误报 | 浏览器中旧错误 GoalSuggestion 被自动拒绝；新增专项测试通过 | Codex Activity adapter 仍 unavailable，不能使用可靠会话语义 |
| 工作历史重复、来源混乱 | 人工 Session 同时以 work_log Event 和 Session 两种卡片展示；设置变更也被标为 Auto Sync | 历史分为“自动发现且已确认”和“人工工作记录”；work_log 只在 Session 区展示；设置变更只留证据时间线；显示人工确认时长和变更原因 | 浏览器确认人工记录不再重复，自动区最多显示最近 8 条，完整记录可进入时间线 | 尚无按日期折叠和搜索，本轮不增加 |
| 跨项目/主任务关系隐藏且容易乱串 | 旧 ZoneLink 只有 scopes，无原因、确认状态或执行模式；迁移曾自动加默认关系 | 删除默认关系推断；关系必须选择范围并填写原因；固定 `REFERENCE_ONLY`，明确不写回项目状态；旧关系标记待重新确认 | 浏览器验证空原因无法保存，保存后显示原因和“只读参考” | `projectRelationshipRules[]` 只保留兼容数据结构，未实现派生事件 |
| Demo、Skills、灵感与 JPR 分叉占据主路径 | 产品范围膨胀，专项演示页面和旧测试反向约束核心体验 | 头部隐藏 Demo/Skills，首页移除灵感库，删除 JPR 专用页面、脚本、测试与截图；底层旧数据迁移仍保留 | 全量测试与公开审计通过，真实首页只保留日常驾驶舱主线 | 可在未来独立产品中复用，不再属于本 MVP 主路径 |
| 导航或渲染会制造“最近更新”假象 | `render()` 每次都调用会 touch workspace 时间的保存 | `save({touch:false})` 用于纯渲染，只有真实变更更新时间 | 静态检查和真实刷新验证通过 | 尚未引入更细粒度持久化队列指标 |
| 刷新/暂停后 Session 草稿不可靠，专注时长口径含糊 | 草稿只在内存；结束时间自动产生且未经用户确认 | 增加 workspace/session 隔离的 `SessionDraftStore`；暂停可恢复；开始/结束时间可编辑且必须勾选人工确认后才计入专注 | 浏览器暂停后恢复笔记成功；结束弹窗显示可编辑时间与确认框；测试通过 | 浏览器崩溃恢复已覆盖 localStorage 镜像，未模拟整机断电 |

## 保留 / 删除 / 重做

### 保留

- IndexedDB、本地 JSON 备份、Windows localhost 服务。
- Git / Filesystem Collector、分来源 checkpoint、测试报告证据。
- `sourcePaths` 多目录能力、Review Before Merge、Evidence、Undo。
- Zone → Project → Session 的日常组织层级。

### 删除或退出主路径

- JPR 专用页面、脚本、测试和截图。
- 自动建立的默认跨主任务关联。
- 首页灵感库、Skills 和 Demo 入口。
- “同目录 + 30 分钟 = 同一工作”的粗暴聚合规则。

### 重做

- Project 状态写入统一为 baseline + confirmed events 的确定性投影。
- 自动来源身份与路径恢复。
- 每日驾驶舱、工作历史来源分层、Session 草稿与人工时长。
- ZoneLink 改为显式原因 + 白名单 scope + 只读参考。

## 当前闭环

```text
打开驾驶舱
→ 看昨天已确认事实 / 今天明确行动 / 当前阻塞
→ 进入一个 Project，恢复或开始 Session
→ Auto Sync 按稳定来源增量采集
→ 以可读工作单元进入 Review
→ 用户确认、改归属或忽略
→ confirmed Event 与人工 work_log 统一重放 Project 状态
→ 可在证据时间线查看来源、原因、归属并撤销
```

## 验收结论

- 自动化：`node scripts/check.mjs` 共 105 项，105 / 105 通过。
- 真实 Git + Test E2E：3 个 raw activities → 1 correlated event → 3 evidence，82 / 82 测试证据通过并投影为 completed。
- 采集器：真实临时 Git 仓库移动、别名恢复、稳定索引、多目录隔离通过。
- 浏览器：建主任务/项目、两目录保存、Auto Sync、Review、具体文件摘要、暂停恢复、人工结束时间、阻塞首页可见、Session 删除重放、显式关系规则均通过。
- 公开审计：只扫描 Git 会纳入发布的文件；已忽略的用户备份不误报，敏感路径与疑似密钥检查通过。
- 当前阶段：Windows 本地可运行 MVP，可进入真实旧备份迁移和连续 7 天日用验证。
