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
- 在首页按连续编号整理当天任务进展，并按需横向查看相关项目记忆
- 在首页可收起的“灵感库”保存尚未成为任务的想法，并为每条灵感绑定一个可互动的 AI 球
- 生成可交给 ChatGPT / Codex / DeepSeek 的上下文 Prompt
- 解析 AI 返回的 JSON，由用户确认后更新项目状态
- 使用独立 Demo Workspace 与 JPR 专用演示预设安全演示
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
4. 在 Session 页面试用 **我卡住了**、**现状总结**、**总结工作** 和 **暂停本次工作**。
5. 可将 [`demo/sample-status-review.json`](demo/sample-status-review.json) 粘贴到“总结工作”的 AI 返回区，验证 JSON 解析、逐字段编辑与人工确认流程。
6. 点击 **重置演示数据**，即可清空 Demo Workspace，正式数据不受影响。

JPR 演示不再混入上述通用 Demo 入口，而是使用独立页面 [`jpr-demo.html`](jpr-demo.html)。打开后点击 **JPRデモを開始**，即可载入全虚构日文案例。该页面复用正式版的完整驾驶舱、任务标签、追加项目、Resume、Session 与人工确认组件；三分钟路线见 [`docs/JPR_DEMO_SCRIPT.md`](docs/JPR_DEMO_SCRIPT.md)。

两个本地入口：

- `index.html`：正式 Workspace 与原有通用 Demo，保持上一版页面结构。
- `jpr-demo.html`：只进入 JPR 专用 Demo；重置后返回 JPR 的从零开始页面。

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
我卡住了 / 现状总结 / 总结工作
↓
生成 Prompt
↓
交给 AI
↓
粘贴 JSON 返回结果
↓
人工确认更新
↓
返回当前 Session 继续工作
↓
暂停后继续，或结束 Session 后返回 Project Resume
↓
下次继续
```

## 已实现

- 主任务 / 次级项目两级结构与生命周期管理
- 首页驾驶舱、规则建议、最近动态及可点击统计明细
- 首页“总结今天”按本地日期列出当天创建、更新或结束的全部 Session，不限制条数且不包含分钟统计
- 首页“灵感库”使用独立 Workspace 数据：可收起、从首页添加；新灵感会均衡绑定四种液态 AI 球，球体保持纯净、原始灵感标题显示在球下方，点击可查看来源、手动换球并返回关联项目
- 首页“今日建议”卡片使用独立 WebGPU 液态玻璃状态球作为渐进增强视觉，并保留非 WebGPU 静态回退和低动态模式
- Project Resume：目标、状态、阶段、成果、问题、阻塞与下一步
- 核心状态人工编辑；AI 建议可逐字段勾选、修改后再写入
- Session 计划、最多三项“今日只做”、笔记、项目私有暂存、独立灵感捕捉、暂停续接与结束归档
- 结束 Session 时人工确认可编辑的开始/结束时间，并以确认分钟数计入“本周专注”
- Project Resume 将行动指示前置，项目状态独立展示；问题支持标签式解决、恢复与直接删除
- 工作历史单条删除、批量管理及最后一条历史的项目保留选择
- 长期项目记忆、关键决策、约束、资产、待办池与暂存区
- “我卡住了”Prompt、现状总结 Prompt、工作总结 Prompt、Bootstrap Prompt
- “总结工作”根据本次 Session 的完成勾选、工作笔记和已确认变化，生成更新后的完整项目结构；可在弹窗直接补录外部 Codex、编辑器或浏览器中的真实成果
- 完整项目 JSON 解析、`project_name` 身份校验、逐字段预览与人工确认写回；更新现有项目而不创建重复项目，其他项目或旧对话的 JSON 会在预览前被拒绝
- 独立 Demo Workspace、演示标记、演示数据清理与正式数据隔离
- Skills 技能库与主任务 Context Link
- IndexedDB 自动保存、JSON 导入与导出
- `LocalStorageAdapter`/`IndexedDBAdapter` 与禁用的云端适配器占位

## 灵感 AI 球状态接口

四种灵感球通过同源桥接读取编辑器导出的着色器，共享一个 WebGPU device 与渲染管线，只渲染当前展开且位于屏幕附近的球；顶部“今日建议”AI 球保持独立。现有灵感首次读取时会获得稳定的 `orbPresetId`，新灵感优先分配当前使用次数最少的球，用户也可以在灵感详情中手动更换。

未来接入 AI 后，可以使用页面提供的接口更新单条灵感的可读状态与摘要：

```js
window.ProjectOSInspirationAI.setState(inspirationId, "thinking");
window.ProjectOSInspirationAI.setState(inspirationId, "ready", {
  summary: "AI 已找到三条可关联的项目线索。"
});
```

支持 `idle`、`thinking`、`ready`、`attention`、`error`。为保持球面纯净，状态文字写入球卡片的可访问标签，AI 摘要在选中详情中显示；颜色、光效和速度只作为辅助反馈。不支持 WebGPU 或启用低动态模式时，仍保留静态球、原始灵感标题与可访问状态。

## 主任务之间如何关联

当前版本关联的是“主任务 ↔ 主任务”，不是“次级项目 ↔ 次级项目”。进入任一主任务，在页面底部找到 **关联主任务**，点击 **管理关联**，选择另一个主任务和允许共享的范围后保存即可。

可选范围包括项目里程碑与总体进度、发布内容、内容表现数据和主任务共享记忆。项目私有记忆、完整 Session、源代码和内部提示词始终不会因为关联而自动共享。若需要两个次级项目直接联动，当前没有可开启的设置，需要以后新增独立的 ProjectLink 能力。

## 数据保存在哪里

正式数据和 Demo 数据默认保存在当前浏览器配置文件的 **IndexedDB** 中：

- 数据库：`project-archive-cockpit`
- 正式工作区：`workspace:normal`
- 演示工作区：`workspace:demo`
- JPR 专用演示工作区：`workspace:jpr-demo`
- `localStorage` 保存标准页/JPR 页各自的界面偏好、标准页当前工作区标记、旧版迁移入口，以及活动 Session 的同步草稿恢复镜像；JPR 页面固定使用 `workspace:jpr-demo`

创建或编辑主任务、项目、Session、记忆、Skills、Context Link，以及确认 AI 导入结果时，应用都会自动保存。Session 笔记、AI 回复、求助内容、结束总结和暂存输入会同步写入本地草稿镜像；关闭弹窗或刷新后重新打开仍可恢复。数据不会自动上传到网络，也不会因为 Git 提交而进入仓库。

“本周专注”不再使用 `endedAt - startedAt` 的未确认墙钟差值。用户结束 Session 时确认开始和结束时间，系统记录计算后的整数分钟；只有人工确认过、且确认结束时间落在本地本周内的 Session 才进入统计。暂停按钮继续只负责保存并离开当前工作，不增加后台计时器或暂停区间。

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
- [JPR Demo 首页](docs/screenshots/jpr-demo-dashboard.jpg)
- [JPR Demo 主任务与追加项目](docs/screenshots/jpr-demo-zone.jpg)
- [JPR Demo Project Resume](docs/screenshots/jpr-demo-resume.jpg)
- [JPR Demo Session](docs/screenshots/jpr-demo-session.jpg)
- [JPR Demo AI 人工确认](docs/screenshots/jpr-demo-ai-review.jpg)

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
