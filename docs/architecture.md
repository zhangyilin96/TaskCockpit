# 架构说明

## 为什么运行文件保留在根目录

Project OS 当前是零依赖的静态 Web 应用。`index.html` 是正式版与通用 Demo 入口；`jpr-demo.html` 是独立 JPR 入口，它读取同一份页面外壳和脚本，因此保持完整本番组件而不复制第二套产品逻辑。公开版保留根目录相对路径加载方式，以避免破坏已经验证的本地启动流程。

## 运行层

- `index.html`：页面结构、对话框与主要交互入口
- `styles.css`：控制台视觉与响应式样式
- `app.js`：页面渲染、事件处理、工作区切换与状态编排
- `lifecycle.js`：任务生命周期、Session 历史与删除规则
- `planning.js`：工作计划、行动建议与基础去重
- `bootstrap.js`：旧对话导入和现状总结 JSON 解析
- `ai-workflow.js`：Prompt 生成与 AI 返回结果处理
- `scripts/serve.mjs`：Windows 本地静态文件服务

## 数据层

`storage.js` 定义统一存储接口：

- `exportState()`：组装备份对象
- `serializeState()`：序列化为 JSON
- `hydrateBundle()` / `hydrateState()`：校验并恢复备份
- `importState()`：导入状态

当前启用 `IndexedDBAdapter`。数据库名为 `project-archive-cockpit`，正式工作区、通用 Demo 与 JPR 专用 Demo 分别使用 `workspace:normal`、`workspace:demo` 和 `workspace:jpr-demo`。

`localStorage` 用于标准页/JPR 页各自的界面偏好、标准页当前工作区标记、旧版本地数据迁移，以及活动 Session 的同步草稿恢复镜像。主状态仍以 IndexedDB 为准；草稿镜像按 Workspace 和 Session 隔离，用于覆盖用户输入后立即关闭页面、IndexedDB 异步写入尚未完成的短窗口。JPR 页面固定使用 `workspace:jpr-demo`，不会覆盖标准页的工作区选择。

Session 的暂停是状态与导航能力，不是计时器：暂停时保留同一个 Session、Todo、笔记和对话框草稿并返回驾驶舱；继续时恢复原 Session，不创建新历史。

Session 内的工作总结和现状总结属于中途状态写回：人工确认后只关闭确认弹窗并重绘当前 Session，不改变 `ui.view`。只有结束 Session 的统一出口 `finishEndedSession()` 才切换到 Project Resume，并默认打开工作历史。

“总结工作”与轻量“现状总结”使用不同结构。工作总结把已勾选完成行动、Session 笔记和本 Session 内已人工确认的变化作为本次证据，并要求 AI 返回与项目导入一致的完整项目快照字段；应用以 `project_name` 核对当前项目后，在同一个人工确认页逐字段更新现有项目，不创建重复项目。弹窗中的“本次实际完成了什么”会同步到 Session 笔记并即时重建 Prompt，用于补录外部 Codex、编辑器或浏览器中发生的交付、测试和发现。证据为空时必须保留原项目快照，不得新增完成、资产、记忆或提高阶段。正式版、通用 Demo 与 JPR Demo 共用该规则，JPR 只切换为日文文案和独立工作区。

严格 JSON 只解决结构问题，不能证明回答属于当前 Project。轻量状态审查 Prompt 要求 `current_state_summary` 以当前项目名组成的身份前缀开头；完整工作总结则要求 `project_name` 与当前项目名称完全一致。解析后 `ai-workflow.js` 会在显示人工确认页前精确核对，不匹配则停留在粘贴页。核对成功后草稿保存已核对的项目名；切换项目或旧版未核对草稿不能直接确认写回。

结束 Session 时采用人工确认口径：页面以本地时间预填 `startedAt` 与 `endedAt`，允许用户修改，确认后计算整数 `focusMinutes`，并记录 `timeConfirmedAt` 与 `timeEntryMode: "MANUAL_CONFIRMED"`。“本周专注”只合计本地周内结束且有人工确认记录的 Session；不运行后台计时器，也不推导暂停区间。跨周 Session 当前按确认结束时间归属，不做按周切分。

Project Resume 的显示顺序以恢复行动为中心：项目简介后立即显示 `nextActions[0]`，当前状态、阶段和最新进度使用独立状态面板。`openIssues[]` 与 `resolvedIssues[]` 形成可勾选的问题标签；Blocker 继续保留结构化状态和来源，问题与 Blocker 都允许用户直接物理删除单条记录。

首页“总结今天”是只读的本地派生视图，不新增持久化实体。它按用户本地日期选择当天创建、更新或结束的 Session，按时间顺序生成连续编号，不限制条数，也不读取 `focusMinutes`。相关 Project 的私有记忆放在独立 `<details>` 横向滚动区，只有用户展开时才作为辅助背景查看，不参与任务总结文本。

首页“灵感库”读取独立的 Workspace `inspirations[]`，与 `Project.parkingLot[]`、`Session.parkingAdded[]` 和 Backlog 保持语义及存储边界分离。用户只能从首页或 Session 显式加入灵感；Session 来源会保存 Zone / Project / Session 引用与名称快照。每条灵感持久化 `orbPresetId`、`aiState` 和可选 AI 摘要：四个编辑器导出共享同一份 WGSL、一个 WebGPU device 与一条渲染管线，只为屏幕附近的 Canvas 提交帧；收起、离屏、隐藏页面和低动态模式会停止或冻结动画。球面保持纯视觉，原始灵感标题显示在球下方，AI 状态进入卡片可访问标签；WebGPU 不可用或初始化失败时继续显示 CSS 静态球与原始灵感标题。点击 AI 球只展开来源详情或手动换球，不会自动创建任务或修改项目状态。顶部“今日建议”球仍是独立的全局状态视觉。三套 Workspace 各自保存灵感，互不读取。

## Demo 隔离

演示工作区拥有独立的 workspace ID。JPR 专用 Demo 进一步使用第三个命名空间，Session、Prompt、AI 返回和确认后的项目状态只在 `workspace:jpr-demo` 中读写，不会更新正式项目、通用 Demo、正式统计、长期记忆或 Context Link。JPR 页面不读取当前 Workspace 切换标记，UI 偏好也使用独立键；重置时把该命名空间替换为空白起点，再由用户明确载入架空预设。

## 云同步预留

`CloudAdapterStub` 和 `SyncProviderStub` 是禁用的边界占位。未来可以在不改动页面业务逻辑的前提下，实现同样的存储接口并接入云端。

当前版本没有网络请求、用户账号或云同步实现。

## 备份边界

正式 JSON 导出默认排除演示 Session 和已删除记录。用户可明确选择附带独立 Demo Workspace。永久删除的数据从本地集合中物理移除，后续导出不会重新包含。
