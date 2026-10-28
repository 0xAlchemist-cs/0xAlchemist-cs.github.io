---
title: 'OpenSpeedy：一款让游戏节奏可调的开源变速工具'
description: '介绍 OpenSpeedy 的进程选择、倍率调节、快捷键与时间函数 Hook 原理，最后记录我为上游修正三语 README 安装命令的文档贡献。'
slug: 'openspeedy-introduction'
publishedAt: '2026-10-28'
draft: false
example: false
featured: true
category: '项目实践'
tags: ['开源', 'Windows', 'Tauri', '文档贡献']
relatedRepos: ['game1024/OpenSpeedy', '0xAlchemist-cs/OpenSpeedy']
references:
  - title: 'OpenSpeedy 中文说明与适用范围'
    url: 'https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/README.zh-CN.md'
  - title: '倍率面板与快捷键实现'
    url: 'https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/src/hooks/useShortcut.ts'
  - title: '应用配置与前端技术栈'
    url: 'https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/package.json'
  - title: 'Tauri 主程序与桥接进程调度'
    url: 'https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/src-tauri/src/lib.rs'
  - title: '时间函数与等待函数的 Hook 实现'
    url: 'https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/src-bridge/speedpatch/speedpatch.cpp'
  - title: 'OpenSpeedy 3.3.17 发布说明'
    url: 'https://github.com/game1024/OpenSpeedy/releases/tag/3.3.17'
  - title: '安装命令存在同名包歧义的 Issue #294'
    url: 'https://github.com/game1024/OpenSpeedy/issues/294'
  - title: '我的文档修正 PR #300（已合并）'
    url: 'https://github.com/game1024/OpenSpeedy/pull/300'
  - title: 'Microsoft：Winget 安装命令与匹配消歧义'
    url: 'https://learn.microsoft.com/en-us/windows/package-manager/winget/install#disambiguate-results'
---

游戏里的节奏，有时也值得交给玩家选择。重复的等待希望快一点，需要观察的过程希望慢一点，而切换回来时，最好只用按一下快捷键。

[OpenSpeedy](https://github.com/game1024/OpenSpeedy) 就是一款围绕游戏速度调节设计的 Windows 开源工具。它由 `game1024` 维护，把目标进程选择、倍率控制和快捷键放在同一个桌面界面中，支持对 32 位和 64 位目标进程进行变速操作。

这篇文章先介绍它能做什么、背后的实现思路，以及使用时需要了解的范围。最后再记录我参与的一项文档修正：把安装问题的解决办法写回三种语言的 README，并通过 PR 合并到上游。

## 从选择进程到调整倍率

OpenSpeedy 的基本操作很直接：启动工具和目标游戏，在界面中勾选游戏进程，再调整速度倍率。相较于只提供一个倍率输入框，它还把常用操作整理成了便于切换的控制方式：

| 操作                 | 适合的使用方式                              |
| -------------------- | ------------------------------------------- |
| 拖动滑块或输入倍率   | 按需要调整快慢，查看当前倍率                |
| 切换预设档位         | 在常用倍率之间切换，最多配置五档快捷键      |
| 增加、降低、重置倍率 | 用快捷键调整，或恢复到 1 倍速               |
| 按住变速             | 按下快捷键进入指定倍率，松开后恢复到 1 倍速 |

其中，“按住变速”是一个容易理解的交互：只在需要时临时改变节奏，手指松开就结束。档位切换则适合反复使用同一组倍率。两种方式对应不同的操作习惯，也让速度控制能够跟上游戏过程。[倍率面板](https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/src/components/SpeedPanel.tsx)、[快捷键实现](https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/src/hooks/useShortcut.ts)

这些功能能否在某款游戏中达到预期效果，仍取决于游戏采用的计时方式和运行环境。理解它怎样实现变速，也有助于理解这种差异。

## 它怎样改变目标程序感受到的时间

OpenSpeedy 的核心思路是：在目标进程的用户态对时间与等待相关的 Windows API 进行 Hook，让部分计时结果和等待行为按照设定倍率变化。

例如，源码对 `GetTickCount`、`GetTickCount64` 和 `QueryPerformanceCounter` 等计时接口作了处理。可以把其中一种计算方式粗略理解为：以一个基准时间为起点，将之后实际经过的时间差乘以倍率，再返回调整后的结果。源码也处理了部分休眠、定时器和等待接口。[时间处理源码](https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/src-bridge/speedpatch/speedpatch.cpp)

这样，依赖这些接口推进的程序逻辑，就可能以不同节奏运行。它的作用点是目标程序使用的时间和等待机制，实际兼容性需要结合具体游戏判断。

从工程组织上看，项目把交互界面和底层能力分成了几部分：

| 部分                            | 主要职责                                                               |
| ------------------------------- | ---------------------------------------------------------------------- |
| React、TypeScript 与 MUI        | 展示进程列表、倍率面板和设置界面                                       |
| Tauri 与 Rust 主程序            | 提供桌面应用能力，获取进程信息，调度桥接程序                           |
| 32 位、64 位桥接程序与 C++ 补丁 | 面向对应架构的目标进程执行操作，处理时间函数 Hook；Hook 库使用 MinHook |

这也是它值得开发者阅读的地方：从一个倍率滑块出发，可以沿着界面调用、Rust 命令和原生补丁，看到一次桌面操作怎样传到目标进程。[前端依赖](https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/package.json)、[主程序入口](https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/src-tauri/src/lib.rs)

## 获取方式与适用范围

上游文档面向 Windows 10 及以上系统，说明了对 x86、x64 目标进程的支持。截至 **2026-10-28**，核对到的最新正式版本为 **3.3.17**，发布页提供 x64 MSI 安装包和便携 ZIP。具体版本与文件应以上游 [Releases](https://github.com/game1024/OpenSpeedy/releases) 为准。

如果已经具备 Winget 环境，可以使用上游修正后的命令：

```powershell
winget install --id Game1024.OpenSpeedy --exact --source winget
```

安装后，按项目说明启动 OpenSpeedy、运行目标游戏，再选择进程并调整倍率即可。需要构建源码时，仓库另有 Node.js、Rust、CMake 和 Visual Studio C++ 工具链的说明，可以从 [README](https://github.com/game1024/OpenSpeedy/blob/52407c6c4dab046eb551422e17451e636523e9e1/README.zh-CN.md) 继续阅读。

项目将自身定位为学习与研究工具。对于允许这类工具的离线环境，可以结合具体游戏逐步尝试；上游明确提醒，联网竞技游戏的反作弊机制可能导致封禁，过高倍率也可能造成物理异常或崩溃。用户态 Hook 描述的是实现层级，使用范围仍应遵守游戏规则。代码采用 GPL v3 许可，相关源码与许可文件均在上游仓库公开。

本文依据公开说明和源码介绍项目，没有执行安装或游戏兼容性测试。

## 我的贡献：把安装问题的解决办法写回文档

我参与 OpenSpeedy 的切入点，是用户安装时遇到的一个具体问题。

[Issue #294](https://github.com/game1024/OpenSpeedy/issues/294) 报告：按照 README 中原来的命令安装时，Winget 会匹配到多个同名结果，无法直接确定要安装哪一个包。原命令是：

```powershell
winget install openspeedy
```

当 `winget` 源与 Microsoft Store 源同时存在同名条目时，只写软件名称会留下歧义。问题讨论中已经给出了指定软件包 ID 的方向，我将这条解决办法整理进了项目的安装文档。

我提交的 [PR #300](https://github.com/game1024/OpenSpeedy/pull/300) 同步修改了英文、简体中文和繁体中文三份 README，把安装命令改为前文展示的完整写法，并补充了避免同名包冲突的注释。三个参数分别承担明确的作用：

- `--id Game1024.OpenSpeedy`：按软件包 ID 查找。
- `--exact`：要求精确匹配。
- `--source winget`：限定使用 `winget` 软件源。

这种写法也对应 [Microsoft 官方文档的匹配消歧义建议](https://learn.microsoft.com/en-us/windows/package-manager/winget/install#disambiguate-results)。PR 已于 **2026-10-21** 被上游维护者合并，修改可以在[合并提交](https://github.com/game1024/OpenSpeedy/commit/52407c6c4dab046eb551422e17451e636523e9e1)中核对。

这次贡献集中在安装文档：将已有问题的解决方案写成可直接复制的命令，保持三种语言的指引一致，并留下可追溯的讨论和修改记录。PR 中也注明了核对范围，没有将文档检查写成实际安装测试。

我觉得这类改动的价值，在于认真对待用户迈出的第一步。读者还没看到倍率面板，就先要复制安装命令；这条命令是否准确，本身就是项目使用体验的一部分。

对我来说，参与开源也可以从这里开始：找到一个明确的问题，把解决办法整理清楚，再通过公开协作，让这份改进留在项目里。
