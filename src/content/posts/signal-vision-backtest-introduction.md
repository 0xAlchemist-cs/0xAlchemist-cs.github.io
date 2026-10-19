---
title: 'Signal Vision Backtest：从图文交易信号到可追溯的历史回放'
description: '介绍一个基于 Python 的图文信号研究项目：用视觉模型整理频道消息，以分钟 K 线和明确的路径假设回放交易过程，并保留可核查的逐单记录。'
slug: 'signal-vision-backtest-introduction'
publishedAt: '2026-10-19'
draft: false
example: false
featured: true
category: '项目实践'
tags: ['Python', '多模态 AI', '事件驱动', '回测']
relatedRepos: ['0xAlchemist-cs/signal-vision-backtest']
references:
  - title: '项目仓库与 README'
    url: 'https://github.com/0xAlchemist-cs/signal-vision-backtest/tree/895c6a32a7126c400bd04a5a06f88672080dce36'
  - title: '图文信号解析器'
    url: 'https://github.com/0xAlchemist-cs/signal-vision-backtest/blob/895c6a32a7126c400bd04a5a06f88672080dce36/signal_parser/parser.py'
  - title: '视觉解析提示词'
    url: 'https://github.com/0xAlchemist-cs/signal-vision-backtest/blob/895c6a32a7126c400bd04a5a06f88672080dce36/prompts/signal_vision_prompt.md'
  - title: '回测引擎与报告生成'
    url: 'https://github.com/0xAlchemist-cs/signal-vision-backtest/blob/895c6a32a7126c400bd04a5a06f88672080dce36/backtest/engine.py'
  - title: '条件入场信号示例'
    url: 'https://github.com/0xAlchemist-cs/signal-vision-backtest/blob/895c6a32a7126c400bd04a5a06f88672080dce36/examples/conditional_signal.json'
---

一条交易消息可能只有几行文字，真正决定如何执行的信息却散落在不同地方：入场区间写在正文里，止损画在截图上，几小时后又追加一句“先平一半，剩下移保本”。

要研究这些信号的历史表现，需要先把分散的消息还原成一段完整、按时间发生的过程。

[Signal Vision Backtest](https://github.com/0xAlchemist-cs/signal-vision-backtest) 就是一套围绕这个问题组织的 Python 工具链。它把图文消息转换为结构化信号，再结合行情、后续管理指令和执行规则进行回放，输出能够继续核查的逐单记录。

## 先把一条消息理解完整

频道消息很少遵守统一的表单格式。同一句话可能同时包含方向、入场、补仓和出场要求；图中的数字还可能与文字存在冲突。

项目的视觉解析器把正文和图表一起提交给支持图像输入的 OpenAI 兼容模型，提取标的、方向、入场价、止损和止盈等字段。解析规则优先采用文字中的明确数字，再利用图表补充缺失信息或核对异常值。[解析器实现](https://github.com/0xAlchemist-cs/signal-vision-backtest/blob/895c6a32a7126c400bd04a5a06f88672080dce36/signal_parser/parser.py)

此外，解析结果还需要表达消息的意图。例如，新的开仓指令、已经结束的交易战报、行情分析和普通聊天，应当进入不同的处理分支。否则，“刚刚止盈了”也可能被错误地当成一笔新交易。

本地预筛会先检查纯文字消息里的动作词和价格，减少明显无关内容的模型调用；带图消息则保留送入视觉解析的入口，避免因简短配文而漏掉图中的信息。

## 从消息到报告，分成几步处理

仓库把主要职责拆成了几个目录：

| 环节     | 对应模块                           | 主要工作                                 |
| -------- | ---------------------------------- | ---------------------------------------- |
| 整理输入 | `fetch/`                           | 获取频道历史与图表附件                   |
| 理解消息 | `signal_parser/`、`prompts/`       | 提取结构化信号，区分消息意图             |
| 准备行情 | `backtest/engine.py` 中的 `Market` | 解析交易标的、获取与缓存分钟 K 线        |
| 回放过程 | `backtest/engine.py` 中的 `Sim`    | 按时间处理入场、止损、止盈和后续管理事件 |
| 检查结果 | 报告生成逻辑                       | 汇总逐单记录、统计信息和数据质量提示     |

这种拆分方便分别检查解析错误和执行错误：一条消息即使被正确识别，也可能由于缺少止损、条件未触发或行情缺失而无法成交。报告需要把这些原因保留下来。

## 让执行条件成为明确的数据

“跌破某个价位”与“等四小时收盘确认后再执行”，对应不同的触发条件。入场的收盘确认和止损的收盘确认，也需要分别记录。

项目为这些语义设置了独立字段。下面是字段关系的示意，仅用于说明数据结构：

```json
{
  "conditional": true,
  "entry_trigger_type": "close_based",
  "entry_timeframe": "4H",
  "stop_trigger_type": "intrabar"
}
```

这里表达的是：入场需要四小时收盘确认，建仓后的止损按盘中触价处理。引擎还会根据订单类型、价格和其他字段完成判断；这段示意本身并不是一条完整的可执行信号。

将这些条件显式保存下来，后续就能核对：偏差来自原始消息、模型理解，还是执行层采用了不同口径。[回测引擎实现](https://github.com/0xAlchemist-cs/signal-vision-backtest/blob/895c6a32a7126c400bd04a5a06f88672080dce36/backtest/engine.py)

## 回放建立在怎样的行情假设上

这个项目使用一分钟 OHLC 数据，也就是每分钟的开盘、最高、最低和收盘价。每根 K 线被展开成四个合成价格事件，时间位置为该分钟的 0 秒、20 秒、40 秒和 59.999 秒。

消息按原始时间戳加入事件序列，执行逻辑再依据可用价格事件推进。这样可以比只按整根 K 线判断更细致地处理消息与行情的先后关系。

但这仍然是**分钟 K 线上的路径模拟**：最高价和最低价在真实市场中何时出现、先后顺序如何，并不能从 OHLC 中完整恢复。合成事件的时间位置也不代表采集到了真实秒级或逐笔行情。

因此，引擎提供不同的高低价先后路径。对同一分钟同时触及止盈与止损的情况，改变路径可能改变结果；报告中的相关冲突记录可以帮助定位这种不确定性。阅读结果时，需要把路径假设与统计数字放在一起看。

## 用同一批信号比较不同出场规则

引擎提供两种出场规则：

- `r_ladder`：默认在达到 +1R 时平掉初始仓位的 40% 并移至保本，达到 +2R 时再平掉 40%，其余仓位继续由后续管理事件、止损等规则处理。
- `tp_ladder`：按照信号给出的止盈价位分档执行，每档平掉初始仓位的相应份额。

R 表示以初始风险为单位的收益尺度，便于对比不同价格和仓位的交易。以上比例是项目的默认配置，可以调整，不能据此推导某种规则对所有信号都更有效。

回放还包含手续费、可配置滑点和资金费处理。逐单结果与汇总报告会记录相应成本及部分数据质量信息，帮助研究者检查统计口径。

## 如何开始阅读和运行

建议先看 `examples/` 中的信号结构，再读解析器和引擎。对希望理解整体实现的读者，这条路径可以先建立输入与输出的对应关系。

仓库要求 Python 3.10 或更新版本。安装依赖后，在工作目录准备好 `signals.json` 和 `manages.json`，可以使用以下命令运行回放与报告生成：

```bash
export SVB_WORK="./work"
python backtest/engine.py sim
python backtest/engine.py report
```

这些是 Bash 环境下的命令，前提配置与依赖安装见仓库 README。图文解析需要另行配置视觉模型接口，可能产生服务费用；阅读源码和整理结构化输入并不要求先调用模型。

处理频道数据时应确认访问与使用权限。仓库附带的数据获取脚本也需要结合平台规则选择使用方式。

## 这份项目可以提供什么参考

这个项目适合用来研究多模态信息提取、交易消息语义建模，以及事件驱动回放的工程实现。它把输入、触发条件、执行假设和结果记录连接起来，让一个汇总数字能够继续追溯到具体过程。

实际使用中仍需核查解析结果、输入数据和市场路径假设。这里介绍的是研究工具及其技术实现，不是经过本文独立验证的收益结论，也不构成投资建议。

本文依据公开仓库 `895c6a3` 版本撰写。后续功能和配置变化以仓库更新为准。
