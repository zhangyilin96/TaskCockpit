# 项目求助 Prompt 模板

驾驶舱点击“我卡住了”时，会由 `ai-workflow.js` 自动填充以下字段。Prompt 只包含当前 Zone、当前 Project 和当前 Session，不读取同一主任务下其他项目的私有记忆。

```text
你正在协助一个严格限定范围的次级项目。不要读取、推断或混入同一主任务下其他项目的私有记忆。

## 1. 项目背景

主任务：{zoneName}
次级项目：{projectName}
项目目的：{projectPurpose}
主任务共享背景：
{zoneSharedMemory}

## 2. 当前目标

{currentGoal}

## 3. 当前状态

{currentState}

## 4. 已完成

{completed}

## 5. 当前进行中

{inProgress}

## 6. 已知问题

{openIssues}

## 7. 关键决策

{decisions}

## 8. 约束

{constraints}

## 9. 最近一次工作

{recentSessionSummary}

## 10. 本次 Session

本次目标：{sessionGoal}
本次行动：
{sessionTodos}

## 11. 用户当前卡点

{userProblem}

验收标准：{acceptanceCriteria}

## 12. 本次请求

请先帮助我解决当前卡点，不要重复已经完成的工作。
如果需要修改方案，请明确说明：
- 修改什么
- 为什么
- 如何验证

完成本次分析或执行后，请务必在回答末尾附加以下固定结构：

## CURRENT_PROGRESS_SUMMARY

用 3～8 条简洁总结：当前项目已经做到什么程度、本次解决了什么、目前还剩什么问题。

## RECOMMENDED_NEXT_STEP

只给 1 个最推荐的下一步。必须足够具体、可以直接开始并带有可核对结果；不要写“继续优化”一类空话。

## OPTIONAL_NEXT_STEPS

如有必要，最多给 2 个备选动作；没有则写“无”。

## MEMORY_UPDATE

列出本轮值得写入长期项目记忆的新事实或决策；没有则写“无”。
```

## 导入支持

AI 可以使用上述 Markdown 标题返回，也可以使用 JSON：

```json
{
  "CURRENT_PROGRESS_SUMMARY": [
    "当前项目已完成什么",
    "本次解决了什么",
    "目前还剩什么问题"
  ],
  "RECOMMENDED_NEXT_STEP": "一个具体、可以直接执行并核对结果的下一步",
  "OPTIONAL_NEXT_STEPS": [
    "最多两个备选动作"
  ],
  "MEMORY_UPDATE": [
    "值得写入长期项目记忆的新事实或决策"
  ]
}
```

旧字段 `COMPLETED`、`CHANGES`、`VERIFICATION`、`DISCOVERIES`、`NEW_DECISIONS` 和 `REMAINING_ISSUES` 继续兼容。
