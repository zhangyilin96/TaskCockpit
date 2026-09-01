# 架构说明

## 为什么运行文件保留在根目录

Project OS 当前是零依赖的静态 Web 应用。`index.html` 通过相对路径加载根目录中的 CSS 和 JavaScript 文件。公开版保留这一结构，以避免为了目录外观破坏已经验证的本地启动方式。

## 运行层

- `index.html`：页面结构、对话框与主要交互入口
- `styles.css`：控制台视觉与响应式样式
- `app.js`：页面渲染、事件处理、工作区切换与状态编排
- `lifecycle.js`：任务生命周期、Session 历史与删除规则
- `planning.js`：工作计划、行动建议与基础去重
- `bootstrap.js`：旧对话导入和现状总结 JSON 解析
- `ai-workflow.js`：Prompt 生成与 AI 返回结果处理
- `auto-sync.js`：Activity Event、Evidence、稳定 SourceBinding、相关性、Router、Review、Daily Brief 与 Project State Projection
- `scripts/serve.mjs`：Windows 本地静态文件服务与受限的 localhost Auto Sync API
- `scripts/collectors.mjs`：Git / Filesystem Collector 与 Codex adapter 状态边界

## 数据层

`storage.js` 定义统一存储接口：

- `exportState()`：组装备份对象
- `serializeState()`：序列化为 JSON
- `hydrateBundle()` / `hydrateState()`：校验并恢复备份
- `importState()`：导入状态

当前启用 `IndexedDBAdapter`，schema version 3。数据库名为 `project-archive-cockpit`；正式工作区使用 `workspace:normal`，旧 Demo Workspace 只作为兼容数据保留，已退出日常入口。

v3 继续使用 IndexedDB，没有为 Auto Sync 无理由切换 SQLite。数据库升级新增 Event Log、Evidence、Sync Run 与 Rules 对象仓库；聚合 Workspace 仍是备份和恢复边界。

## Auto Sync 运行边界

浏览器不能直接读取 Git 或任意本地目录，因此采集只发生在现有本机 Node 服务中：

```text
Browser Dashboard
  └─ POST /api/auto-sync/collect (same-origin localhost)
      ├─ Git CLI Collector
      ├─ Filesystem Incremental Collector
      ├─ Codex Adapter (unavailable 时明确降级)
      └─ per-collector status
```

- API 只监听 `127.0.0.1`，拒绝非本机 Origin。
- 只有用户在项目设置中注册的目录会被扫描。
- 默认忽略 `.git`、`node_modules`、缓存与编辑器目录；单目录最多 10,000 个文件、深度 14。
- 测试内容只读取符合测试报告命名规则且不超过 1 MiB 的文本文件。
- Collector 失败互相隔离；失败来源不推进自己的 checkpoint。
- 首次数据源 checkpoint 回看 24 小时，之后只读取增量。

## Rule First / Evidence First

Project Router 的优先级：

1. Collector 项目目录提示；
2. 用户保存的路径 RoutingRule；
3. Project 稳定 `sourceBindings[]` 与当前 `sourcePaths[]`；
4. 项目名称与 `routingKeywords[]`；
5. 用户确认。

高置信度不等于静默写入。所有新 Event 先进入 `suggested`，Review 页面只把可靠归类项预选；用户确认后才变成 `confirmed` 并触发状态投影。

Git commit 只证明代码活动。只有明确的完成/修复语义与通过的测试 Evidence 相关联时，规则才会提出 `completed` effect；否则进入 `in_progress` 或只写 Timeline。

Filesystem 不再按“同目录 + 30 分钟”粗暴聚合。相关性优先使用稳定 binding / repository fingerprint、明确 work unit、实际文件重叠和较短 burst。单文件事件保留具体路径；纯文件 Timeline 不覆盖更有语义的 Git、测试或人工工作状态。

## Goal Drift Detection

`CURRENT_GOAL` 是高权限状态，不参与普通 ActivityEvent 的自动投影。检测器只使用近期 confirmed / suggested 的有效工作判断方向偏移：单个 commit、单个测试、纯文件修改和 `manual_patch` 设置变更不会触发；趋势判断至少需要 3 个语义相近事件，并占近期有效方向事件的 60% 以上。明确“当前目标改为 / 下一阶段重点”意图可以形成建议，但仍不能自动写入目标。

检测结果保存为独立 `GoalSuggestion`。只有用户在 Review 中接受或编辑后接受，系统才生成 confirmed `goal_change` Event，由现有 Project State Projection 更新 `goal` 并写入 Timeline。拒绝和稍后处理不会改变目标；接受后的目标修改可以撤销并从 Event Log 重新计算。

## 撤销与重新计算

Project State Projection 从最近的 confirmed baseline 开始，按确认顺序应用 `manual_patch`、`work_log`、自动 effect 与 `goal_change`。撤销或删除对应工作把事件标记为 `rejected` 后重新投影；不会再通过覆盖整份 Project JSON 修补错误。纯导航渲染使用 `save({touch:false})`，不制造虚假的更新时间。

`localStorage` 只用于界面偏好、旧版本地数据迁移和按 workspace/session 隔离的草稿恢复镜像，不是主数据库。

## 旧 Demo 数据兼容

演示工作区仍拥有独立 workspace ID，旧备份可以读取和导出；Demo、Skills 与灵感库已退出日常主路径，JPR 专用页面已删除。兼容数据不会更新正式项目状态、统计、长期记忆或 ZoneLink。

## 云同步预留

`CloudAdapterStub` 和 `SyncProviderStub` 是禁用的边界占位。未来可以在不改动页面业务逻辑的前提下，实现同样的存储接口并接入云端。

当前版本没有网络请求、用户账号或云同步实现。

## 备份边界

正式 JSON 导出默认排除演示 Session 和已删除记录。用户可明确选择附带独立 Demo Workspace。永久删除的数据从本地集合中物理移除，后续导出不会重新包含。
