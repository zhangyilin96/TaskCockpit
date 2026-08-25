# 项目存档驾驶舱 / Project OS

**项目太多，脑子记不住做到哪？**

这是一个 Local First 的个人项目存档驾驶舱。它把主任务、次级项目、工作记录和项目记忆隔离保存，让你下次回来时能直接恢复“上次做到哪”。

> **当前版本仅支持 Windows 10 / Windows 11。**
>
> **macOS / Linux 暂未适配，也未完成测试。**

它现在可以帮助你：

- 保存主任务 / 次级项目状态
- 记录每次工作 Session
- 保存长期项目记忆并恢复上次进度
- 生成可交给 ChatGPT / Codex / DeepSeek 的上下文 Prompt
- 解析 AI 返回的 JSON，由用户确认后更新项目状态
- 使用独立 Demo Workspace 安全演示
- 导入、导出本地 JSON 备份

核心原则：

> **AI 负责总结，人负责定案。**

出品：**kiseki 的 AI Lab**

![首页驾驶舱](docs/screenshots/dashboard.jpg)

## 系统要求

当前支持：

- ✅ Windows 11
- ✅ Windows 10
- ✅ Node.js 20 LTS 或更高版本

暂不支持：

- ❌ macOS
- ❌ Linux

当前启动脚本与本地运行流程以 Windows 为目标设计。macOS / Linux 尚未适配和验证，请不要将当前版本视为跨平台应用。

## 安装与启动

1. 在 Windows 10 / 11 安装 [Node.js 20 LTS 或更高版本](https://nodejs.org/)。
2. Clone 本仓库，或从 GitHub 下载 ZIP 并完整解压。
3. 双击根目录中的 `启动项目存档驾驶舱.cmd`。
4. 等待浏览器自动打开 `http://127.0.0.1:4173`。

项目没有第三方运行依赖，因此无需安装额外 npm 包。也可以在项目根目录运行：

```powershell
npm start
```

然后手动打开 `http://127.0.0.1:4173`。关闭本地服务窗口即可停止运行。

## 快速体验

Demo Workspace 与正式 Workspace 完全隔离，不会读取或修改正式项目。

1. 启动后点击右上角 **演示模式**。
2. 确认进入后点击 **载入示例数据**。
3. 依次体验：主任务 → 次级项目 → 恢复项目状态 → 开始本次工作。
4. 在 Session 页面试用 **我卡住了**、**现状总结** 和 **导入 AI 返回结果**。
5. 可将 [`demo/sample-status-review.json`](demo/sample-status-review.json) 粘贴到“现状总结”的 AI 返回区，验证解析与人工确认流程。
6. 点击 **重置演示数据**，即可清空 Demo Workspace，正式数据不受影响。

[`demo/`](demo/) 目录还提供了安全、虚构的 Bootstrap JSON 和 Demo 备份样例。

## 核心工作流

```text
选择主任务
↓
进入次级项目
↓
恢复项目状态
↓
开始本次工作
↓
我卡住了 / 现状总结
↓
生成 Prompt
↓
交给 AI
↓
粘贴 JSON 返回结果
↓
人工确认更新
↓
结束 Session
↓
下次继续
```

## 已实现

- 主任务 / 次级项目两级结构与生命周期管理
- 首页驾驶舱、规则建议、最近动态及可点击统计明细
- Project Resume：目标、状态、阶段、成果、问题、阻塞与下一步
- 核心状态人工编辑；AI 建议可逐字段勾选、修改后再写入
- Session 计划、最多三项“今日只做”、笔记、暂存区与结束归档
- 工作历史单条删除、批量管理及最后一条历史的项目保留选择
- 长期项目记忆、关键决策、约束、资产、待办池与暂存区
- “我卡住了”Prompt、现状总结 Prompt、Bootstrap Prompt
- AI JSON 解析、预览、人工确认与项目回写
- 独立 Demo Workspace、演示标记、演示数据清理与正式数据隔离
- Skills 技能库与主任务 Context Link
- IndexedDB 自动保存、JSON 导入与导出
- `LocalStorageAdapter`/`IndexedDBAdapter` 与禁用的云端适配器占位

## 数据保存在哪里

正式数据和 Demo 数据默认保存在当前浏览器配置文件的 **IndexedDB** 中：

- 数据库：`project-archive-cockpit`
- 正式工作区：`workspace:normal`
- 演示工作区：`workspace:demo`
- `localStorage` 只保存界面偏好、当前工作区标记和旧版迁移入口

创建或编辑主任务、项目、Session、记忆、Skills、Context Link，以及确认 AI 导入结果时，应用都会自动保存。数据不会自动上传到网络，也不会因为 Git 提交而进入仓库。

右上角两个备份按钮分别是：

- **⇩ 导出备份**：将当前正式工作区导出为 JSON；可选附带独立 Demo Workspace。
- **⇧ 导入备份**：读取之前导出的 JSON，预览后覆盖对应的本地工作区。

导出的 JSON 是普通文件，可能包含你的项目内容。请自行保管，不要提交到公开仓库。`.gitignore` 已默认排除常见备份和本地数据库文件。

## 截图

- [首页驾驶舱](docs/screenshots/dashboard.jpg)
- [主任务页](docs/screenshots/zone.jpg)
- [次级项目 Resume](docs/screenshots/project-resume.jpg)
- [本次工作 Session](docs/screenshots/session.jpg)
- [“我卡住了”](docs/screenshots/stuck.jpg)
- [现状总结](docs/screenshots/status-review.jpg)
- [技能库](docs/screenshots/skills.jpg)
- [独立 Demo 模式](docs/screenshots/demo-mode.jpg)

全部公开截图均使用虚构 Demo 数据。

## 开发与验证

```powershell
npm install
npm run check
npm run check:public
```

`npm install` 当前不会下载运行依赖，仅用于生成/校验本地包管理元数据。`check:public` 会扫描常见本地路径、真实项目名、数据库文件和疑似密钥，但它不能替代发布前人工复核。

## 项目结构

当前产品是零依赖静态 Web 应用。为保留已经验证的启动方式，运行文件继续位于仓库根目录，没有为了目录外观强行迁移到 `src/` 或 `public/`。

```text
TaskCockpit/
├─ README.md
├─ LICENSE
├─ CHANGELOG.md
├─ PROJECT_STATUS.md
├─ package.json
├─ index.html
├─ app.js
├─ storage.js
├─ lifecycle.js
├─ planning.js
├─ bootstrap.js
├─ ai-workflow.js
├─ styles.css
├─ scripts/
├─ tests/
├─ demo/
├─ docs/
│  ├─ architecture.md
│  └─ screenshots/
└─ 启动项目存档驾驶舱.cmd
```

更多实现说明见 [`docs/architecture.md`](docs/architecture.md)。

## Roadmap（未实现）

以下内容均未实现，也不属于 v0.1.0 的支持范围：

- macOS / Linux 支持
- 云同步与多设备
- Agent API 直连
- Skills 自动发现
- 更完整的 Context Link
- 更智能的状态总结

## License

[MIT License](LICENSE)。允许使用、修改、Fork 和学习；转载或分发时请保留许可证与作者署名。
