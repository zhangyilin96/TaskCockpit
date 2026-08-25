# 旧项目导入 Prompt 模板

> 用途：让旧 ChatGPT / Codex / DeepSeek 对话只总结当前次级项目，并返回可直接解析的项目记忆与项目现状。

AI 必须只返回一个合法 JSON 对象，不要 Markdown、代码块或前后说明：

```json
{
  "project_name": "",
  "project_purpose": "",
  "current_goal": "",
  "current_state": "",
  "current_phase": "",
  "completed_milestones": [],
  "in_progress": [],
  "open_issues": [],
  "current_blockers": [],
  "recommended_next_step": "",
  "key_decisions": [],
  "constraints": [],
  "assets": [],
  "important_context": [],
  "parking_lot": []
}
```

规则：

- 只总结当前次级项目，不混入同一主任务下其他项目。
- `current_phase` 只能使用 `IDEA / EXPLORATION / PROTOTYPE / VALIDATION / STABILIZATION / DELIVERY / PAUSED`，无法判断时为空。
- 只有上下文中有明确完成、验证、通过或交付证据的事项，才能进入 `completed_milestones`。
- 无法确认完成状态的事项必须放入 `in_progress` 或 `open_issues`，不得推测完成。
- `current_blockers` 只包含明确阻碍推进的问题；一般问题放入 `open_issues`。
- 列表去重，`X` 与 `解决：X` 只保留一条。
- 信息不足使用空字符串或空数组，不得虚构进度。

运行时完整提示词由 [app.js](./app.js) 中的 `PROJECT_BOOTSTRAP_PROMPT` 提供，解析和保守派生规则位于 [bootstrap.js](./bootstrap.js)。

解析后先显示“AI 识别出的项目现状”。除项目名称外，所有建议字段都可以编辑并逐项勾选是否写入；`completed_milestones` 默认不勾选。确认后会创建 `工作历史 No.1 · 项目导入`，保存初始 Snapshot 与原始 Bootstrap JSON。
