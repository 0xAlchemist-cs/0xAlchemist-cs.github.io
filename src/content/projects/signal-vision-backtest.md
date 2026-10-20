---
slug: 'signal-vision-backtest'
repoFullName: '0xAlchemist-cs/signal-vision-backtest'
displayName: 'Signal Vision Backtest'
summary: '把频道中的文字和图表整理为结构化交易信号，再用明确的行情路径假设进行事件驱动回放，留下可核查的逐单记录。'
techStack: ['Python', '多模态 AI', '事件驱动', '回测']
featured: true
draft: false
example: false
relatedPosts: ['signal-vision-backtest-introduction']
status: '公开源码'
---

## 把分散的消息还原为完整过程

交易频道里的入场条件、图上止损和后续管理指令，往往散落在不同消息中。Signal Vision Backtest 将图文解析、行情准备、执行回放和报告生成拆开，让结果能够追溯到输入与规则。

解析器通过兼容的视觉模型接口提取结构化信号，引擎再按时间处理入场、部分出场、止损与后续管理事件。读者可以分别检查“消息是否理解正确”和“执行假设是否合理”。

## 理解数据与回放的边界

`signal_parser/` 负责消息语义，`backtest/engine.py` 负责行情与回放。引擎使用一分钟 OHLC，并将其展开为合成价格事件；这属于分钟内路径假设，不能当作采集到的真实逐笔行情。

项目适合研究多模态提取和事件驱动系统。逐单记录、成本设置及路径差异需要结合输入核查，回放结果不代表实盘收益。下方介绍文章提供了阅读源码的路径与运行说明。
