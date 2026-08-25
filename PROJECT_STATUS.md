# Project OS 公开版状态

## 当前版本

- 版本：v0.1.0
- 阶段：Windows 本地可运行 MVP
- 产品名：项目存档驾驶舱 / Project OS
- 出品：kiseki 的 AI Lab
- 许可证：MIT

## 支持范围

- 支持：Windows 10、Windows 11
- 运行环境：Node.js 20 LTS 或更高版本
- 数据策略：Local First；浏览器 IndexedDB 自动保存
- 正式工作区与 Demo Workspace 使用独立存储命名空间

## 当前产品闭环

1. 选择主任务。
2. 进入次级项目并恢复当前状态。
3. 建立本次工作计划并开始 Session。
4. 使用“我卡住了”或“现状总结”生成 Prompt。
5. 将 AI JSON 粘贴回应用。
6. 人工编辑、选择需要写入的字段并确认。
7. 结束 Session，保存工作历史与下一步。
8. 下次进入项目时恢复进度。

## 本地数据与备份

- IndexedDB 数据库名：`project-archive-cockpit`
- 正式工作区记录：`workspace:normal`
- 演示工作区记录：`workspace:demo`
- JSON 导出：从 IndexedDB 读取，经 `exportState()` 与 `serializeState()` 生成下载文件
- JSON 导入：经 `hydrateBundle()` / `hydrateState()` 校验，预览确认后写回 IndexedDB
- 云端预留：`storage.js` 中的 `CloudAdapterStub` 与 `SyncProviderStub`，当前禁用

## 公开发布检查

- 仓库内不携带浏览器 IndexedDB、正式 Workspace 或私人 Memory
- Demo 与截图只使用虚构示例
- 不依赖本机用户名或绝对路径
- `.gitignore` 排除本地备份、数据库、日志和环境文件
- `npm run check:public` 提供额外扫描

## v0.1.0 验证结果

- 42 项自动化测试通过
- Windows 启动脚本 `--check` 通过
- 本地服务首页返回 HTTP 200
- 全新浏览器工作区可进入 Demo、载入示例、创建并刷新恢复 Session
- “我卡住了”、现状总结 JSON 解析与人工确认流程通过
- JSON 导出提示、导入文件解析与覆盖前预览通过
- 浏览器控制台未发现错误或警告
- 8 张公开截图已复核，只包含虚构 Demo 数据

## 尚未支持

- macOS
- Linux
- 云同步
- 多设备
- Agent API 直连
- Skills 自动发现

这些项目均为未实现方向，不属于 v0.1.0 的功能承诺。
