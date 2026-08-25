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
- `scripts/serve.mjs`：Windows 本地静态文件服务

## 数据层

`storage.js` 定义统一存储接口：

- `exportState()`：组装备份对象
- `serializeState()`：序列化为 JSON
- `hydrateBundle()` / `hydrateState()`：校验并恢复备份
- `importState()`：导入状态

当前启用 `IndexedDBAdapter`。数据库名为 `project-archive-cockpit`，正式工作区与 Demo Workspace 分别使用 `workspace:normal` 和 `workspace:demo`。

`localStorage` 只用于界面偏好、当前工作区标记和旧版本地数据迁移，不是主数据库。

## Demo 隔离

演示工作区拥有独立的 workspace ID。演示 Session、Prompt、AI 返回和临时事件都保存在 Demo Workspace 中，不会更新正式项目状态、统计、长期记忆或 Context Link。只有明确执行正式写入流程时，数据才会进入正式工作区。

## 云同步预留

`CloudAdapterStub` 和 `SyncProviderStub` 是禁用的边界占位。未来可以在不改动页面业务逻辑的前提下，实现同样的存储接口并接入云端。

当前版本没有网络请求、用户账号或云同步实现。

## 备份边界

正式 JSON 导出默认排除演示 Session 和已删除记录。用户可明确选择附带独立 Demo Workspace。永久删除的数据从本地集合中物理移除，后续导出不会重新包含。
