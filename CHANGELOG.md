# Changelog

本文件记录公开版本的主要变化。

## v0.3.0 - 2026-08-31

日常驾驶舱收口与状态投影重构。

### Added

- 首页“昨天做了什么 / 今天该做什么 / 项目卡在哪里”日常主线
- `manual_patch`、`work_log` 事件与确定性 Project 重放
- 稳定 `sourceBindings[]`、Git repository fingerprint、路径别名恢复与健康状态
- Session 草稿恢复、暂停/继续、可编辑并人工确认的专注时间
- ZoneLink 原因、共享白名单、`REFERENCE_ONLY` 和旧关系待确认状态
- 文件摘要迁移、Goal Drift 设置误报过滤、历史来源分层

### Changed

- 文件活动按稳定来源和明确工作单元相关联，不再使用同目录 30 分钟粗聚合
- 多目录输入只做精确去重；Filesystem index 使用 source binding ID
- 人工修改、AI 确认和 Session 结束不再通过整份 Project snapshot 覆盖状态
- 工作历史自动区最多显示最近 8 条，完整证据进入时间线
- 公开审计扫描 Git 将纳入发布的文件，不误判 `.gitignore` 中的用户备份

### Removed from primary flow

- JPR 专用页面、脚本、测试和截图
- 首页 Demo、Skills 与灵感库入口
- 迁移时隐式建立的默认跨主任务关系

### Verified

- 自动化语法、单元与集成测试全绿
- 临时真实 Git 仓库移动前后来源身份稳定
- 真实浏览器完成建项目、多目录同步、Review、暂停恢复、人工结束、删除重放和关系边界流程

## v0.2.0 - 2026-08-29

Auto Sync 架构升级。

### Added

- 启动后按 checkpoint 增量执行 Git、Filesystem 与 Project OS Activity 采集
- `ActivityEvent`、`ActivityEvidence`、`SyncRun`、`RoutingRule`、`ProjectRelationshipRule`
- Git commit、branch、changed files 与测试报告 Evidence
- 同目录时间窗聚合、跨 Git / 文件 / 测试证据关联和重复检测
- Rule-first Project Router 与轻量 Review Before Merge
- Confirmed Event Log 驱动的 Project State Projection、证据时间线和撤销重算
- 新目录首次 24 小时补齐、Collector 独立 checkpoint 与失败隔离
- 可重复的临时真实 Git 仓库端到端验证脚本

### Changed

- Dashboard 先打开，Auto Sync 后台运行，不因 Collector 或 AI 阻塞启动
- 手动 AI 对话导入降级为“手动补充记录” fallback
- IndexedDB 新增 Auto Sync 专用 stores，JSON 备份 schema 升级为 v3

### Known limitations

- Codex Activity 当前只有 adapter 边界；没有可靠接口时明确显示 unavailable
- RelationshipRule 数据结构已预留，语义派生事件尚未进入本版 UI
- 文件删除只有在至少完成一次文件索引后才能可靠检测

## v0.1.0 - 2026-08-25

首个公开 MVP。

### Added

- Windows 10 / Windows 11 本地启动流程
- Local First 的主任务、次级项目与 Session 工作流
- Project Resume、长期记忆、待办池、暂存区、决策、约束与资产
- “我卡住了”、现状总结与旧对话 Bootstrap Prompt
- AI JSON 解析、人工编辑、逐字段确认和项目回写
- 独立 Demo Workspace、演示数据隔离与重置
- 工作历史管理、永久删除与最后一条历史的项目保留选择
- Skills 技能库与 Context Link
- IndexedDB 自动保存与 JSON 导入 / 导出
- Windows 启动脚本、公开发布检查和自动化测试

### Security

- 公开仓库只包含虚构 Demo 数据
- 常见本地数据库、备份、日志和环境文件已加入 `.gitignore`
- 增加本地路径、真实项目名和疑似密钥扫描

### Known limitations

- 仅支持 Windows 10 / Windows 11
- macOS / Linux 未适配、未测试
- 云同步、多设备和 Agent API 直连未实现
