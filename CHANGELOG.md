# Changelog

本文件记录公开版本的主要变化。

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
