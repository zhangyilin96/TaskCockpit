# Project OS v0.3.0 项目状态

> 更新日期：2026-08-31
> 当前阶段：Windows 本地可运行 MVP
> 本轮目标：把产品收口为每天可用的“工作进度驾驶舱”，不继续扩功能面。

## 已完成

### 日常主线

- 首页以“昨天做了什么 / 今天该做什么 / 项目卡在哪里”为第一屏主线。
- 昨日只显示 confirmed Event；待 Review 项不混入正式进度。
- 今日行动优先恢复未结束 Session，其次读取已确认 next action / in progress / goal。
- OPEN Blocker 始终可见，直到明确解决、推迟或删除。
- 失效目录与待 Review 数直接显示，不再藏在设置深处。

### 状态与历史

- 旧 Project 创建一次 `project_state_baseline`。
- 自动事件、人工修正、AI 确认和 Session 结束统一记录为可重放 Event。
- 新增 `manual_patch` 与 `work_log` effect，人工事实不再依赖整份 Project snapshot。
- 删除 Session 会拒绝对应 work log 并重新投影，避免已删除工作重新污染状态。
- 历史区分“自动发现且已确认”和“人工工作记录”；设置变更只出现在证据时间线。
- 证据时间线显示时间、来源、置信度、归属、摘要、Evidence 和变更原因，可撤销或改归属。

### Auto Sync 与路径恢复

- 保留 Git、Filesystem、测试报告、分来源 checkpoint、首次 24 小时回看和失败隔离。
- Project 使用 `sourceBindings[]` 保存稳定 binding ID、canonical path、aliases、identity 与健康状态。
- Git 身份由安全 remote + root commit 指纹组成；目录移动后同一 commit 的 sourceId 不变。
- Filesystem index 改用 `projectId:sourceBindingId`，移动路径不重新建立整套索引。
- 配置路径不可用时按历史别名恢复；恢复或缺失状态回写 Project 并在首页可见。
- 多目录输入使用精确去重，不再把父目录和子目录误合并。
- 文件相关性基于稳定来源、明确 work unit、文件重叠与较短 burst；不再用“同目录 + 30 分钟”一把抓。
- 单文件活动显示具体文件；旧“更新 1 个文件”摘要在读取时自动升级。

### 项目关系与交互

- 取消迁移时自动创建默认关系。
- ZoneLink 必须填写原因并选择 scope，固定为 `REFERENCE_ONLY`，不会跨项目写回状态。
- 旧关系标记为“待重新确认”。
- Session 支持暂停与恢复；草稿按 workspace + session 镜像到 localStorage。
- 结束时间可编辑，必须人工勾选确认才计入专注分钟数。
- Demo、Skills、灵感库退出日常主路径；JPR 专用分叉已删除。

## 验证状态

| 检查 | 当前结果 |
| --- | --- |
| 语法与全量单元/集成测试 | 105 / 105 通过 |
| 真实 Git + Test E2E | 3 raw activities → 1 event → 3 evidence；82 / 82 test evidence；completed 投影成功 |
| Git 仓库移动 | 临时真实仓库移动前后 fingerprint 与 sourceId 相同 |
| 路径别名恢复 | canonical path 失效后从 alias 恢复，source report 为 available |
| 多目录隔离 | 两个 source binding 分别维护 index；真实 UI 显示 2 个目录 |
| 浏览器主流程 | 建 Zone/Project、配置目录、同步、Review、确认、暂停、恢复、结束、删除均通过 |
| Goal Drift | 设置修改不再触发；旧非进度误报自动拒绝 |
| Session 删除重放 | 删除后 currentState 回到基线，独立 Blocker 保留 |
| 关系边界 | 空原因不能保存；保存后显示只读模式、原因和 scope |
| 公开发布审计 | 仅扫描 Git 将纳入发布的文件，检查通过 |

## 未完成

- 尚未用真实用户旧备份执行迁移演练；这是进入连续日用前唯一的高价值验证。
- Codex Activity 没有可靠公开接口，adapter 继续明确显示 unavailable。
- 非 Git 目录没有内容级稳定身份，只能依赖 binding ID 与历史别名恢复。
- 嵌套 source path 可能重复扫描，虽会按 sourceId 去重，但设置页尚未主动提示重叠目录。
- 大目录仍受 10,000 文件、深度 14 的安全上限约束。
- 没有按周/月回顾、历史搜索、多设备同步或云端账号；这些都不属于当前 MVP 收口范围。
- macOS / Linux 未适配、未测试。

## 当前状态

**本地可运行 MVP，适合进入真实数据迁移与连续 7 天日用验证。**

下一步只做两件事：

1. 先导出当前正式备份，再拿一份真实旧备份做恢复/迁移演练。
2. 连续 7 天记录“昨天 / 今天 / 卡点”，只修阻断日用的问题，不新增产品模块。
