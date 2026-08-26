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
- JPR 专用 Demo 使用第三个独立命名空间与全虚构日文预设

## 当前产品闭环

1. 可先在首页使用“总结今天”回看当天任务进展，或展开“灵感库”记录/回看尚未成为任务的想法，再选择主任务。
2. 进入次级项目并恢复当前状态。
3. 建立本次工作计划并开始 Session。
4. 使用“我卡住了”“现状总结”或“总结工作”生成 Prompt；工作总结把本次完成勾选、工作笔记和本次已确认变化作为证据，返回更新后的完整项目结构并逐字段确认写回。
5. 将 AI JSON 粘贴回应用；应用先核对回答中的当前项目身份，不匹配时不允许进入预览。
6. 人工编辑、选择需要写入的字段并确认；状态更新后留在当前 Session 继续工作。
7. 可暂停 Session 返回首页并继续；只有结束 Session 时才返回 Project Resume，并保存工作历史、下一步与专注分钟数。
8. 下次进入项目时恢复进度。

## 本地数据与备份

- IndexedDB 数据库名：`project-archive-cockpit`
- 正式工作区记录：`workspace:normal`
- 演示工作区记录：`workspace:demo`
- JPR 专用演示记录：`workspace:jpr-demo`
- 活动 Session 草稿：IndexedDB 主状态 + `localStorage` 同步恢复镜像；按 Workspace 与 Session 隔离
- JSON 导出：从 IndexedDB 读取，经 `exportState()` 与 `serializeState()` 生成下载文件
- JSON 导入：经 `hydrateBundle()` / `hydrateState()` 校验，预览确认后写回 IndexedDB
- 云端预留：`storage.js` 中的 `CloudAdapterStub` 与 `SyncProviderStub`，当前禁用

## 公开发布检查

- 仓库内不携带浏览器 IndexedDB、正式 Workspace 或私人 Memory
- Demo 与截图只使用虚构示例
- 不依赖本机用户名或绝对路径
- `.gitignore` 排除本地备份、数据库、日志和环境文件
- `npm run check:public` 提供额外扫描

## 当前验证结果

- 77 项自动化测试通过（包含四种灵感 AI 球参数完整性、共享 WebGPU 渲染、JPR Demo 隔离、中日文完整项目更新、无证据防臆测、`project_name` 跨项目拦截、状态写回后停留 Session、暂停续接、草稿恢复、首页灵感库、液态状态球渐进增强、人工确认专注时长及实际合计、问题标签、Resume 层级、今日任务总结、导出边界、日文 Prompt 与 UI 检查）
- Windows 启动脚本 `--check` 通过
- 本地服务首页返回 HTTP 200
- 全新浏览器工作区可进入 Demo、载入示例、创建并刷新恢复 Session
- “我卡住了”、现状总结与工作总结 JSON 解析、项目身份校验、草稿恢复及人工确认流程通过；工作总结现返回完整项目结构，并可在弹窗补录本次真实成果；证据不足时禁止新增完成、资产、记忆或阶段提升；不同 `project_name` 会在预览前被拒绝
- Session 暂停回首页、Resume 暂停标记、重新进入与笔记恢复已在浏览器验证
- Project Resume 的行动指示顺序、独立状态面板、问题解决/恢复样式，以及结束时间未确认拦截和分钟数重算已在 JPR Demo 浏览器验证
- JPR 首页“今日をまとめる”已在浏览器验证：当天 Session 连续编号、暂停状态与未完成任务显示正常；相关项目记忆可展开横向查看，面板不展示专注分钟数
- JPR 工作总结已在浏览器验证：确认状态写回后仍停留在当前 Session；只有结束工作并确认时间后才返回 Project Resume，控制台无错误或警告
- JPR 首页“アイデアライブラリ”已在浏览器验证：项目暂存不进入灵感库；首页和 Session 可分别添加独立灵感，AI 球可选中查看来源、收起/展开，刷新后仍保存，并可从 Session 来源返回对应 Project Resume
- 首页灵感 AI 球已在 WebGPU 浏览器验证：四份导出通过同源着色器桥接正常渲染，四个 Canvas 共享渲染器并全部进入 ready 状态，备用球显示数为 0；球体不覆盖文字，原始灵感标题位于球下方，顶部“今日建议”球继续正常运行
- 首页“今日建议”液态状态球已在浏览器验证：WebGPU 正常渲染、高清画布尺寸正确、回退层在成功后隐藏、控制台无错误，且不拦截统计卡交互
- JSON 导出提示、导入文件解析与覆盖前预览通过
- 浏览器控制台未发现错误或警告
- 8 张公开截图已复核，只包含虚构 Demo 数据
- JPR 三分钟路径已在浏览器中完整验证，并生成 5 张全虚构安全截图

## JPR Demo 范围

- 独立入口：`jpr-demo.html`；正式版与通用 Demo 保留在 `index.html`，不再把两种 Demo 放进同一入口
- 重置：清空 JPR 专用状态并回到 `デモを最初から始める`，由 `JPRデモを開始` 重新载入预设
- 案例：`業務改善` → `問い合わせ対応の標準化`
- 页面结构：复用正式版驾驶舱、生命周期标签、任务菜单、追加项目、完整 Resume、项目资料侧栏和 Session 组件，不再使用简化 JPR 渲染分支
- 日文化：驾驶舱、主任务、追加项目弹窗、Resume、Session、AI 相談、现状整理、工作总结、暂停续接、人工确认和结束 Session 的核心路径
- AI 回答：不连接真实 API；提供可一键填入的全虚构日文 JSON，继续使用现有人工编辑、逐字段勾选和确认写回机制
- “本周专注”：JPR 首页继续隐藏；正式版只统计结束时由用户人工确认的分钟数
- 隔离：JPR 页面初始化时只读写 `workspace:jpr-demo`，不初始化或切换正式 Workspace；刷新可恢复，重置只作用于该命名空间

## 尚未支持

- macOS
- Linux
- 云同步
- 多设备
- Agent API 直连
- Skills 自动发现

这些项目均为未实现方向，不属于 v0.1.0 的功能承诺。
