---
slug: 'ielts-workspace'
repoFullName: '0xAlchemist-cs/ielts-workspace'
displayName: 'IELTS Workspace'
summary: '本地优先的英语学习工作台，把材料输入、主动回忆、写作输出与延迟复习串成可以回顾的练习闭环。'
techStack: ['Next.js', 'TypeScript', 'SQLite', 'Drizzle']
featured: true
draft: false
example: false
relatedPosts: ['ielts-workspace-introduction']
status: '公开源码'
---

## 从接触表达，到真正用出来

IELTS Workspace 的应用名称是 IELTS Active Learning。它将阅读、听力、写作与复习放进同一条学习流程，区分“见过、理解、回忆、使用、保留”，用已有练习记录帮助安排下一次任务。

学习者可以导入自己的材料，尝试闭卷回忆，再把表达用于输出。学习计划会结合到期复习、近期错误与可用时间，给出可以追溯到记录的练习依据。

## 可以从哪些实现开始读

界面使用 Next.js 与 TypeScript，学习记录通过 Drizzle 存入本地 SQLite。`src/server/services/` 中的会话计划、学习记忆与任务分配逻辑，适合用来了解这些页面如何连接起来。

项目提供离线 Mock 与可配置的 AI 接口。启用外部接口时，对应任务内容会发往所配置的服务；详细的数据边界、材料处理能力和启动步骤见下方项目介绍文章与 GitHub README。
