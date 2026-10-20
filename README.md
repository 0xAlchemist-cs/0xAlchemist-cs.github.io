# 0xAlchemist 的博客

Astro + TypeScript + Markdown/MDX 静态个人博客，包含文章、分类、标签、归档、项目、中文全文搜索、RSS、SEO 审计及 GitHub Pages 发布流程。浅色阅读界面配有鼠标聚拢连线背景。

目标地址：<https://0xalchemist-cs.github.io/>。首批正式内容包含 Signal Vision Backtest 与 IELTS Workspace 两篇项目介绍，布局示例和草稿由生产构建排除。实际发布状态以 GitHub Actions 和线上检查结果为准。

## 本地开始（Windows，不修改系统 Node）

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 install
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 dev
```

打开 <http://127.0.0.1:4321/>。独立 Node 22.22.0、随附 npm 和缓存均在忽略提交的 `.tools/` 中；安装时校验官方 SHA256，不修改系统 PATH。

macOS/Linux 使用 Node 22.22.0，运行 `npm ci`、`npm run dev`。CI 使用相同 Node 版本。

## 检查与生产预览

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 verify
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 test:browser
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 preview
```

`verify` 包含类型、格式、单元测试、内容审计、Astro + Pagefind 构建和产物审计。浏览器测试在独立临时目录构建测试数据，不修改作者内容；Windows 默认使用已有 Chrome，其他环境先执行 `npx playwright install --with-deps chromium`。可设置 `PLAYWRIGHT_CHANNEL`。

生产预览默认 <http://127.0.0.1:4321/>，请先停止开发服务器。生产预览排除草稿和示例，只展示正式内容。开发服务器不生成全文搜索索引，搜索需在生产预览中检验。`reports/` 保存审计、截图与隔离构建信息。

## 写作与维护

- [内容指南](CONTENT_GUIDE.md)：文章字段、图片、MDX、项目精选与关联。
- [部署指南](DEPLOYMENT.md)：PR 发布、Pages 设置、上线门禁、回滚和 Search Console。
- [系统架构](SYSTEM_ARCHITECTURE.md)：静态数据流、背景交互、缓存与检查边界。

身份配置位于 `src/config/site.ts`；域名也配置在 `astro.config.mjs`。更换账号时同时更新配置、部署说明和测试中固定 URL，再运行检查。用户主页仓库不设置额外 base，页面统一结尾斜杠，文件型端点除外。

精选项目展示 IELTS Workspace 和 Signal Vision Backtest，项目页与介绍文章双向关联并链接公开源码。公开元数据可手动刷新，也可每周由 Actions 创建待审核 PR；无变化不创建空更新，作者确认合并后才部署。详见部署指南中的同步权限与 `dry_run` 验收说明。

评论、AI 服务、统计追踪均未启用，无须外部 Key。GitHub Token 仅供公开资料同步及元数据 PR 任务使用，不传入站点构建。搜索平台注册与验证是可选操作，不保证收录、排名或 AI 引用。

## 原始资料

原始四份中文规范与全部架构图、流程图保持原样。原开发包 README 保存在 [docs/blueprint-README.md](docs/blueprint-README.md)，不作为博客文章发布。
