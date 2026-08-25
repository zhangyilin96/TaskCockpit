# 现状总结 Prompt 模板

> 用途：审查一个正在进行中的次级项目，不解决某一个具体卡点，也不读取同一主任务下其他项目的私有记忆。

````text
你正在帮助我审查一个正在进行中的项目。

请不要直接重新规划整个项目，也不要读取、推断或混入同一主任务下其他项目的私有记忆。

请基于以下真实项目状态，判断：

1. 当前项目已经做到什么程度
2. 目前最重要的进展是什么
3. 当前还剩哪些明确问题
4. 有没有明显重复、偏航或不再值得继续的工作
5. 下一步最值得做什么

---

## 主任务
{zoneName}

## 次级项目
{projectName}

## 项目目的
{purpose}

## 当前目标
{currentGoal}

## 当前状态
{currentState}

## 已完成
{completed}

## 正在进行
{inProgress}

## 当前阻塞
{openBlockersOnly}

## 已知问题
{openIssues}

## 关键决策
{decisions}

## 约束
{constraints}

## 最近工作历史
{recentSessions}

## 当前 Session
本次目标：{currentSessionGoal}
本次行动：{currentSessionTodos}
本次已完成 Todo：{completedTodos}

## 本次工作笔记
{notes}

## 暂存区
{parkingLot}

## 下一步行动
{nextActions}

## 相关资产
{assets}

## 主任务允许共享的背景
{zoneSharedMemoryOnly}

---

只返回一个 JSON 代码块，不要正文解释，不要在代码块前后写任何内容，也不要额外增加字段。严格使用以下结构：

```json
{
  "current_state_summary": "",
  "completed_milestones": [],
  "in_progress": [],
  "active_problems": [],
  "current_blockers": [],
  "progress_judgement": {
    "phase": "",
    "reason": ""
  },
  "recommended_next_step": "",
  "optional_next_steps": [],
  "should_stop_or_defer": [],
  "memory_update": []
}
```

规则：
- current_state_summary 用简洁自然语言说明项目现在究竟处于什么阶段。
- 只有上下文中有明确完成、验证、通过或交付证据的事项，才能进入 completed_milestones；无法确认时放入 in_progress 或 active_problems，不得推测完成。
- in_progress 只列已经开始但尚未有明确完成证据的事项。
- active_problems 只列仍然真实存在的问题，不要重复已经解决的问题。
- current_blockers 只列有明确证据正在阻碍推进的问题；不能确认时返回空数组。
- progress_judgement.phase 只能写 IDEA、EXPLORATION、PROTOTYPE、VALIDATION、STABILIZATION、DELIVERY 或 PAUSED；信息不足时写空字符串。
- recommended_next_step 只给 1 个具体、可执行、可验证的动作。
- optional_next_steps 最多 2 项。
- 没有的列表返回空数组，信息不足返回空字符串，不得虚构进度。
````

实际运行时由 `ai-workflow.js` 注入当前 Project 数据。`Zone.projects`、其他 Project Memory、其他 Project Session 不会进入模板。弹窗使用 `bootstrap.js` 的严格解析器：接受纯 JSON 或单独一个 JSON 代码块；普通自由文本、代码块前后说明不会进入预览和回写。解析后的字段均可编辑并逐项勾选，`completed_milestones` 默认不勾选。
