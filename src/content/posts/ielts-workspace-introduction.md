---
title: 'IELTS Workspace：把英语学习串成可回顾的练习闭环'
description: '介绍一个本地运行的英语学习工作台：串联材料阅读、主动回忆、写作输出与延迟复习，并用学习记录解释当天的练习安排。'
slug: 'ielts-workspace-introduction'
publishedAt: '2026-10-19'
draft: false
example: false
featured: true
category: '项目实践'
tags: ['Next.js', 'TypeScript', '英语学习', '本地优先']
relatedRepos: ['0xAlchemist-cs/ielts-workspace']
references:
  - title: '项目仓库与 README'
    url: 'https://github.com/0xAlchemist-cs/ielts-workspace/tree/ca2e3b165989e14c0dfab303a3a14dabb1233c86'
  - title: '个人学习记忆与证据整理'
    url: 'https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/server/services/learning-memory.ts'
  - title: '每日练习的时间分配'
    url: 'https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/server/services/planner.ts'
  - title: '文件导入与媒体处理边界'
    url: 'https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/server/services/import-resource.ts'
  - title: 'AI 接口请求与结果校验'
    url: 'https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/lib/ai/providers/openai-compat.ts'
  - title: 'AI 配置与离线回退'
    url: 'https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/lib/ai/index.ts'
  - title: '本地数据库初始化'
    url: 'https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/db/index.ts'
---

读懂一段英语，和隔天能够自己说出来，是两种不同的体验。收藏的表达越来越多，也需要有机会被回忆、使用和重新检查。

[IELTS Workspace](https://github.com/0xAlchemist-cs/ielts-workspace) 是一个本地运行的英语学习工作台，仓库中的产品名称是 **IELTS Active Learning**。它围绕材料输入、主动回忆、实际输出和后续复习组织练习，并把学习过程留下的记录用于安排下一步任务。

这篇文章主要介绍它的学习流程，以及支撑这些流程的工程设计。

## 把不同程度的“会了”分开记录

项目使用一组学习阶段来区分不同的证据：

| 阶段               | 要检查的问题                         |
| ------------------ | ------------------------------------ |
| 见过（Exposed）    | 是否接触过这个表达？                 |
| 理解（Understood） | 是否理解它在当前语境中的意思？       |
| 回忆（Retrieved）  | 离开原文和提示，还能想起来吗？       |
| 使用（Used）       | 能否在自己的表达中用出来？           |
| 保留（Retained）   | 间隔一段时间后，是否仍能回忆和使用？ |

这些区分贯穿项目的进度记录和练习安排。阅读、回忆、写作等活动会留下不同类型的记录，便于后续检查一个表达目前停留在哪个环节。

这里的记录反映应用内发生的练习，解释和评价也受练习形式及评分方式影响，不能直接等同于正式考试成绩。

## 一次练习怎样连接起来

工作台的主要流程可以概括为：学习材料 → 主动回忆 → 尝试使用 → 延迟复习。

以一个示意场景为例：学习者在文章中遇到某个有用表达，先结合原句理解并保存；之后根据提示尝试回忆，再把它用于自己的句子或写作；隔一段时间后，通过新的练习检查是否仍然记得。

各个页面承担不同的环节：

- 阅读工作台提供文章、表达与句子分析的入口。
- 听力工作台围绕音频片段、听辨和跟读组织练习。
- 写作工作台连接构思、写作、反馈、重写和迁移练习。
- 复习页面让学习者先尝试回忆，再检查答案和反馈。

当天的活动由统一的会话计划串联，首页和练习会话读取同一份计划信息。这样，学习者可以沿着待完成的步骤继续，而不必每次从多个模块中重新挑选入口。[会话计划实现](https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/server/services/session-plan.ts)

## 让安排有可以查看的依据

项目中的 Personal Learning Memory 会读取已有的复习历史、表达使用记录和错误记录，整理反复出现的问题、近期变化与尚不稳定的内容。

例如，某类错误重复出现，或者某些表达能够认出却多次无法自主产出，都可以成为继续练习的依据。对应的提示附带记录和解释；证据不足时，相关内容可以保持为空。[学习记忆实现](https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/server/services/learning-memory.ts)

每日计划还会结合可用时间、到期复习数量、近期失败情况和距离上次学习的间隔，调整新学习与复习的比例。积压较多或中断一段时间后，计划会偏向先恢复已有内容。

从实现上看，这部分由明确的规则和已有记录驱动，可以继续追溯到时间分配与调度逻辑。它的价值在于让“今天为什么练这个”有一条可查看的解释路径。[每日计划实现](https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/server/services/planner.ts)

## 把自己的材料带进来

工作台支持导入 PDF、DOCX、纯文本、Markdown、字幕、图片和音视频等材料。文本提取、格式识别及图片 OCR 等处理在本地进程中完成，导入流程还会检查文件类型、大小和重复内容。

不同格式的处理能力需要分别看待：有文本层的 PDF 可以提取正文，单张图片可以进行 OCR；当前实现遇到缺少文本层的扫描 PDF，会提示需要进一步处理。音视频可以保存为学习资源，但自动转写尚未在本地导入流程中提供，会保留“待转写”状态。

这些状态帮助学习者判断材料接下来还能做什么，也为后续扩展转写和文档处理能力保留了位置。[导入流程实现](https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/server/services/import-resource.ts)

## 本地数据与可选的 AI 能力

项目使用 Next.js、React、TypeScript 和 Tailwind CSS 构建界面，通过 Drizzle 访问本地 SQLite 数据库。学习记录保存在本机的 `data/app.db`，默认启动命令将服务绑定在 `127.0.0.1`。

AI 层提供两种运行方式：未配置接口时使用确定性的 Mock 实现；配置兼容接口后，可以进行词语、句子、写作等任务的分析。返回结果经过结构校验，调用失败或结果不符合要求时，相关接口可以回退到 Mock 输出。

Mock 反馈属于模板式结果，阅读时需要区分它与真实模型分析。真实模型提供的反馈同样是练习辅助，需要结合原文和具体任务判断。

“本地优先”在这里主要体现为应用运行和记录存储方式。**启用外部 AI 服务后，对应任务内容会发送到所配置的接口**；这部分的数据处理方式和费用取决于服务提供方。若使用本地模型端点，则由实际配置决定请求去向。[AI 请求实现](https://github.com/0xAlchemist-cs/ielts-workspace/blob/ca2e3b165989e14c0dfab303a3a14dabb1233c86/src/lib/ai/providers/openai-compat.ts)

## 练习也可以发生在工作台之外

项目保留了外部练习入口，例如阅读练习网站，以及口语、听力 AI 教练。工作台承担学习材料和过程记录的整理工作，再把相关练习反馈接回后续安排。

这也决定了它的使用边界：学习者需要结合具体模块使用本地功能和外部服务，不能默认所有考试、对话和评价环节都已在应用内独立完成。内置练习指标、AI 反馈与官方成绩之间也需要保持清楚的区分。

## 如何开始使用和阅读源码

基础启动顺序如下，详细环境要求、扩展字典和材料准备请以仓库说明为准：

```bash
git clone https://github.com/0xAlchemist-cs/ielts-workspace.git
cd ielts-workspace
npm ci
npm run db:push
npm run db:seed
npm run build
npm run start
```

完成基础初始化后，再通过设置页选择是否配置 AI 服务。生产启动读取已构建的应用，修改源码后需要重新构建。SQLite 驱动包含原生依赖，不同系统的安装过程也可能需要额外的环境准备。

字典、完整音频语料和个人学习记录不应被视为全都随源码附带；第三方材料还需要按其授权范围准备和使用。

如果想理解项目设计，可以从 `src/server/services/session-plan.ts` 看练习如何串联，再阅读 `learning-memory.ts`、`planner.ts` 和 `src/lib/ai/`。这几部分分别对应用户看到的流程、学习记录的解释、任务分配，以及可替换的模型能力。

这个项目提供了一个值得继续探索的方向：让一次练习产生的记录参与下一次练习，让保存下来的表达有机会被反复回忆和使用。学习效果仍需通过持续使用与独立评价来检验，本文不据此作提分承诺。

本文依据公开仓库 `ca2e3b1` 版本撰写。后续功能和配置变化以仓库更新为准。
