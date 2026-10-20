# 部署与回滚

## 上线前提

账号：`0xAlchemist-cs`。公开仓库：`0xAlchemist-cs.github.io`。目标地址：<https://0xalchemist-cs.github.io/>。本地构建成功不代表已上线。

已核对公开及登录账号下的仓库列表，并创建专用公开仓库。后续连接已有远端时仍需先检查内容，在分支整合，不覆盖历史。

必须满足：至少一篇真实非草稿、非示例文章；作者本地确认视觉与公开内容；可用的 GitHub 登录、仓库及 Pages 设置权限；质量检查与 `release:check` 通过。项目可以暂时为空。

首批真实文章为 Signal Vision Backtest 与 IELTS Workspace 的项目介绍，已按作者确认取消草稿标记。布局示例仍保持示例标记，由生产构建排除。是否真正上线，以仓库、发布工作流和线上地址的实际验证结果为准。

## 首次上线

1. 使用确认的账号创建公开主页仓库，初始化本地 Git，将检查过的代码提交到分支。不要提交 `.tools/`、`.env`、`node_modules/`、报告或测试输出。
2. Settings → Pages → Build and deployment → Source 选择 GitHub Actions。
3. 建议为 main 配置规则：要求 PR、要求 CI 的 `Validate and test` 成功，由作者确认后合并。工作流文件不会自动开启仓库保护规则。
4. 本地执行 `verify`、`test:browser`、`release:check`，开 PR 等待 CI，通过后确认合并。
5. 查看 Deploy GitHub Pages：质量任务通过后检查真实文章，构建与审计成功才上传 Pages 产物，最后发布到 `github-pages` 环境。

`site` 是 `https://0xalchemist-cs.github.io`，不配置额外 base、CNAME、自定义域名或 DNS。

## 自动化边界

- PR 和 main push 运行 CI，也支持 `workflow_dispatch` 对指定分支显式运行同一套检查。
- 发布仅允许 main；部署依赖自己的同一提交质量任务，不假设独立 CI 已先完成。
- 共享检查执行 Node 22.22.0、npm ci、类型/格式/单测/内容与产物审计/构建、桌面和手机浏览器测试。报告保留七天。
- 发布使用串行 pages 并发组，避免旧任务在新任务之后覆盖网站。
- 公开项目刷新任务仅有读取权限。单独的 PR 任务获得 `contents: write`、`pull-requests: write` 和 `actions: write`，用于提交指定缓存文件、创建待审核 PR 和触发 CI；站点构建不接收 Token。外部 PR 不注入自定义 Secrets，不使用 `pull_request_target`。

## 精选项目自动同步

`sync-github.yml` 每周一 01:17 UTC（北京时间 09:17）或手动触发，计划任务可能延迟。流程为：严格同步公开资料 → 本地同等 `verify` → 保存已验证缓存 → 创建或更新元数据 PR → 显式触发 PR 分支的完整 CI → 作者确认合并 → 正常部署。

需在 Settings → Actions → General → Workflow permissions 开启 **Allow GitHub Actions to create and approve pull requests**。保持默认 Token 权限为只读，写权限仅由对应任务声明。此仓库不会自动批准或合并 PR；该设置是 GitHub 提供的创建 PR 开关，不代表启用自动审核。

无需额外 PAT 或付费服务。自动 PR 事件可能等待工作流批准，因此使用内置 `GITHUB_TOKEN` 显式触发 `ci.yml` 的 `workflow_dispatch`；检查使用元数据分支的同一提交。未通过检查的更新不应合并，部署还会再次检查实际 `main` 提交。

人工验收新工作流时，在 Actions 选择该工作流和功能分支，勾选 `dry_run`。应看到 `refresh` 成功、`review` 跳过，并可下载 `validated-public-cache`。正式启用后，API 无变化应保持文件与 PR 不变；API 超时、限流或无效响应应令严格任务失败，站点继续使用已提交缓存。

可只手动运行，或从工作流中移除 `schedule` 停止定期刷新。维护 PR 使用固定专用分支 `codex/refresh-public-metadata`，不要在该分支编写文章或功能代码。手工精选列表仍以 `src/content/projects/` 的非草稿、非示例配置为准。

## 线上验收

记录 workflow 链接、部署提交 SHA 和检查日期，访问首页、文章列表、真实文章、分类、标签、归档、项目、关于、搜索和不存在的地址。

验证 `/robots.txt`、`/sitemap-index.xml`、索引中实际列出的子 Sitemap、`/rss.xml`；检查手机与桌面、中文搜索、title、description、canonical、JSON-LD，无错误 base、示例、草稿或密钥。

这些项目必须检查实际线上站点。缺少内容或登录权限时，记录为“尚未上线验证”。

## 回滚

用新 PR 执行 `git revert <出问题的提交SHA>`，检查通过后合并重新部署。不要 reset 主分支或强推。同步失败保留缓存，构建失败保留上次成功站点，不跳过检查强行发布。

## 搜索平台（可选）

上线后在 Search Console 添加 URL 前缀属性 `https://0xalchemist-cs.github.io/`。按界面要求将验证 HTML 加入 `public/` 或将验证 meta 加入 SEO Head，正常 PR 发布。

验证通过后提交实际 Sitemap 索引，用 URL 检查看抓取情况。Bing 同理。没有启用 IndexNow、AI API 或统计服务。技术要素齐全不保证排名、收录或 AI 引用。

参考：[Astro 官方部署](https://docs.astro.build/en/guides/deploy/github/)、[GitHub Pages 入门](https://docs.github.com/en/pages/quickstart)。
