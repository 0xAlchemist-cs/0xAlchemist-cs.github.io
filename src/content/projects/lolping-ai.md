---
slug: 'lolping-ai'
repoFullName: '0xAlchemist-cs/lolping-ai'
displayName: 'lolPing AI'
summary: '基于 lolPing 扩展的桌面信号轮盘，加入可选 AI 提问、截图确认发送，以及 Windows 网页、程序和清屏快捷动作。'
techStack: ['Electron', 'TypeScript', 'React', 'C++']
featured: true
draft: false
example: false
relatedPosts: ['lolping-ai-introduction']
status: '公开源码 · 0.6.0 发布准备中'
---

## 用桌面信号轮盘连接常用操作

lolPing AI 派生自 [darrenprx/lolPing](https://github.com/darrenprx/lolPing) v0.5.3，原应用由 Danrui Meng 开发。本仓库保留信号、表情和房间功能，在此基础上增加 AI 提问卡片与 Windows 快捷动作。

通过本机轮盘确认，可以打开已配置的 HTTPS 网页、切换或打开指定程序，或最小化桌面窗口。问号信号保留给 AI；相关能力需要在设置中主动开启。

## AI 和截图的发送边界

AI 使用用户自行配置的兼容接口，可能产生服务费用。Windows 支持本地截图预览，文字提问与图片发送分开；图片需要使用者选择并确认后才发送到所配置的服务。

应用以 Electron、TypeScript 和 React 构建，底层输入与部分 Windows 操作使用 C++ Helper。可从主进程中的动作会话、执行器和截图快照管理理解界面如何连接到实际操作。

## 当前试用范围

截至 2026-10-28，0.6.0 处于发布准备阶段，公开安装包尚未发布，当前按仓库说明从源码构建。Windows 11 x64 提供快捷动作与截图提问；macOS 与实验性的 Linux X11 版本具有不同的功能及验收范围。

代码采用 MIT 许可，原信号和表情的图像、动画、音效属于 Riot Games，项目并非官方产品。具体操作、平台限制、源码出处和实机演示见关联文章与 GitHub README。
