---
title: 'lolPing AI：让桌面信号轮盘连接 AI 提问与快捷操作'
description: '介绍基于 lolPing 扩展的桌面工具：用信号轮盘打开 AI 提问卡片，在确认后发送截图，并在 Windows 上执行网页、程序和清屏动作。'
slug: 'lolping-ai-introduction'
publishedAt: '2026-10-28'
draft: false
example: false
featured: true
category: '项目实践'
tags: ['Electron', 'TypeScript', '桌面应用', 'AI']
relatedRepos: ['0xAlchemist-cs/lolping-ai']
references:
  - title: '项目中文说明与使用方式'
    url: 'https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/README.zh-CN.md'
  - title: '本机轮盘动作的确认会话'
    url: 'https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/wheelActionSession.ts'
  - title: 'Windows 快捷动作执行'
    url: 'https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/quickActionExecutor.ts'
  - title: 'AI 提问与图片发送入口'
    url: 'https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/explainWindow.ts'
  - title: '截图快照与有效期管理'
    url: 'https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/visionSnapshot.ts'
  - title: 'API 密钥加密存储'
    url: 'https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/aiKeyStore.ts'
  - title: '发布准备与实际验收范围'
    url: 'https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/docs/release-readiness.md'
---

如果把英雄联盟里的信号轮盘放到桌面上，除了发一个问号，它还能成为哪些操作的入口？

[lolPing AI](https://github.com/0xAlchemist-cs/lolping-ai) 在桌面信号和表情的基础上，增加了可选的 AI 提问卡片、截图提问，以及 Windows 网页、程序和清屏快捷动作。它保留原来的信号图标、动画和声音，让同一个轮盘同时承担表达与操作的用途。

这个项目派生自 [darrenprx/lolPing](https://github.com/darrenprx/lolPing) v0.5.3，原应用由 Danrui Meng 开发。本文介绍的是 `0xAlchemist-cs/lolping-ai` 中扩展的能力；托盘和设置里的应用名称仍然是 **lolPing**。

想先看交互，可以打开仓库里的[约 50 秒 Windows 实机演示](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/docs/media/lolping-ai-demo.mp4)。视频带中文字幕，并剪去了部分等待时间，适合了解操作流程。

## 先用轮盘，再选择要启用的功能

在 Windows 上，默认操作是按住 **Alt**，按下鼠标左键，拖向某个扇区，再松开鼠标。表情轮盘默认使用 Ctrl；在轮盘中心松开、右键或按 Esc 可以取消。

基础信号不需要 API 密钥。AI 解释和 Windows 快捷动作都是可选功能，默认关闭，也没有预设的快捷动作。可以先使用信号与表情，再按自己的需要配置。

Windows 快捷动作在设置中与普通信号绑定，支持三类操作：

| 动作     | 具体行为                                                                       |
| -------- | ------------------------------------------------------------------------------ |
| 打开网页 | 将配置好的 HTTPS 地址交给默认浏览器打开                                        |
| 打开软件 | 按本地 `.exe` 的完整路径寻找合适窗口，优先还原并请求切换；没有合适窗口时再启动 |
| 一键清屏 | 请求最小化桌面窗口，重复触发仍然是最小化，不会反向恢复窗口                     |

例如，可以把一个普通信号设为常用网页入口，把另一个设为编辑器入口。动作跟随信号本身，调整轮盘顺序不会把原来的绑定留在旧方向。

程序切换仍受 Windows 的前台激活规则影响。系统拒绝切换时，应用会停止这次动作，不会为了切换失败再启动一个实例；托盘程序和启动器也可能有不同的窗口行为。当前动作不支持自由参数、脚本、普通文件或文件夹。[执行逻辑](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/quickActionExecutor.ts)

## 问号成为一个 AI 提问入口

标准的“敌人消失”问号保留给 AI，关闭 AI 后也不会改作普通快捷动作。启用并配置 AI 解释后，用轮盘打出问号，会出现可输入问题的卡片，回答以流式方式逐步显示。

Windows 上还需要开启快捷动作总开关。关闭这个开关会阻止新提问卡片、关闭已有卡片并取消进行中的请求，同时保留已保存的 AI 配置和动作绑定。

这里的 AI 由用户自行配置：填写兼容 chat completions 的服务地址、模型名称和 API 密钥。调用会把相应问题内容发送到所配置的服务，费用取决于该服务。正式安装包接受 HTTPS 远程接口，拒绝环回、私有和本地地址，因此不能将它描述为开箱即用的本地离线 AI。

密钥通过 Electron `safeStorage` 加密后单独保存在 `ai-key.bin`，不会作为明文写入 `settings.json`；加密能力不可用时会拒绝保存。[密钥存储实现](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/aiKeyStore.ts)

## 截图先预览，发送由使用者确认

Windows 版本在点击本地预览时截取当前屏幕，以原始问号的位置定位局部区域，并展示显示器上下文。预览发生在本机，原来的“提问”按钮仍然只发送文字。

需要识图时，流程是：

1. 打开本地截图预览，检查画面里包含了什么。
2. 选择要发送的图片。默认只选局部图，完整显示器截图需要主动勾选。
3. 核对卡片显示的接收域名与模型，再点击“发送所选截图并提问”。

选中的 JPEG 会发送到所配置的第三方 AI 服务，因此需要使用支持图片输入的模型，也需要在发送前检查截图内容。关闭预览或快照过期后，临时上传快照会失效；图片重试需要重新预览和确认。

这部分把“已经截到图”和“同意把图发给服务”分成两个阶段，主进程会检查确认标记、会话和快照状态。[提问入口](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/explainWindow.ts)、[快照管理](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/visionSnapshot.ts)

## 桌面操作怎样与轮盘和房间消息区分

项目使用 Electron 和 TypeScript 组织桌面应用，设置界面使用 React，底层输入与部分 Windows 能力交给 C++ Helper。

| 部分            | 主要职责                                            |
| --------------- | --------------------------------------------------- |
| 渲染界面        | 展示轮盘、设置和提问卡片，接收用户输入              |
| Electron 主进程 | 管理配置、校验操作来源，调度 AI 请求和快捷动作      |
| 原生 Helper     | 处理底层输入，以及 Windows 窗口激活、清屏等固定能力 |

日常快捷动作由本机轮盘会话确认：主进程记录本次轮盘状态与松开位置，再消费对应的确认。设置页另有显式测试入口，可以测试已保存且启用的普通动作绑定，即使总开关关闭也可测试。设置预览、普通触发键加单击，以及房间成员发来的 Ping，都不会直接触发这些本机动作。[轮盘动作会话](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/wheelActionSession.ts)、[设置页测试入口](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/src/main/quickActionsIpc.ts)

原有的房间、表情和文字交流仍然保留。房间可以通过局域网和可选的公共 Nostr 中继连接，普通快捷动作的目标网址、动作名称和程序路径保留在本机，不随房间消息发送。房间连接、AI 请求与更新检查各有自己的网络用途，具体说明见 [README 的隐私与网络部分](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/README.zh-CN.md#隐私与网络)。

## 目前怎样试用，哪些范围还在验证

截至本文核对的 **2026-10-28**，仓库版本为 **0.6.0**，公开 Releases 尚未提供安装包。当前可从本仓库源码构建，使用前应查看最新[发布页面](https://github.com/0xAlchemist-cs/lolping-ai/releases)和 [README](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/README.zh-CN.md)。上游 lolPing 的安装包不包含这里全部的扩展功能。

平台范围需要分别看：

- **Windows 11 x64**：实现了快捷动作和截图提问，源码构建需要 Node.js 22.12+、C++20 工具链，以及 Visual Studio 的 C++ 桌面开发组件。
- **macOS**：面向 Apple 芯片、macOS 13+，需要辅助功能权限；没有这里的 Windows 快捷动作。
- **Linux**：实验性的 x64 X11 版本，需要相应输入扩展和合成器，不支持 Wayland，包括 Wayland 环境中的 XWayland。

仓库的验收记录记载了 Windows 安装升级，以及单屏 100%、150%、200% 缩放等已完成的检查；混合 DPI、多显示器、实际登录启动、长时间稳定性等仍有待完成。三平台 CI 构建通过与真实桌面环境验收是不同的证据，本文没有重新执行这些桌面测试。[发布就绪记录](https://github.com/0xAlchemist-cs/lolping-ai/blob/30157cea0cc0b17b27e2d06b0fb991799fbcb620/docs/release-readiness.md)

代码采用 MIT 许可证，信号与表情的图标、动画和音效版权归 Riot Games，不包含在代码许可中。项目并非 Riot Games 官方产品。

lolPing AI 适合对桌面轮盘交互、Electron 与原生能力协作、AI 提问入口感兴趣的使用者和开发者。可以从信号轮盘开始试用，也可以沿着主进程、原生 Helper 和截图确认流程阅读源码，了解这些功能怎样连接起来。
