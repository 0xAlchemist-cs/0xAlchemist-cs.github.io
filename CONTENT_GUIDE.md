# 内容指南

## 写文章

在 `src/content/posts/` 新建 `.md` 或 `.mdx`，填写：

```yaml
---
title: '这里填写真实文章标题'
description: '说明遇到的问题、采用的办法，以及读者能获得的结论。'
slug: 'my-first-note'
publishedAt: '2026-10-18'
draft: true
example: false
featured: false
category: '工程实践'
tags: ['TypeScript']
relatedRepos: []
references: []
---
```

日期使用有效 ISO 字符串；可选 `updatedAt` 不能早于发布日期。slug 使用小写英文、数字和单横线，发布后保持稳定；迁移旧地址时补静态跳转页并验证目标。

开发服务器展示草稿和示例并加以标记。生产构建排除 `draft: true` 或 `example: true` 的内容，包括主题计数、关联链接、RSS、Sitemap 和搜索。`featured: true` 用于首页精选。未来日期的非草稿仍会公开，本项目没有定时发布。

**不要仅取消示例标记就将示例当作真实经历发布。** 请另写真实文章。

## 正文与图片

- 正文从二级标题开始，页面已生成 H1。
- 图片放在 `public/images/`，使用 `/images/文件名` 并提供 alt；建议使用带实际 `width`、`height` 的 `<img>`，构建检查会指出尺寸缺失。
- 封面使用 1200 × 630 图片，同时填写 `cover` 和 `coverAlt`。
- 代码块注明语言，浏览器提供复制按钮，复制失败可手工选择。
- MDX 使用相同字段，只引入可信本地组件；MDX 可以执行代码，不直接接受未经审查的外部内容。
- 引用使用 `references: [{ title: "来源", url: "https://..." }]`。数据、经验和结论需要作者核实，脚本只能给出确定性检查和人工复核提示。

分类和标签随公开文章生成，名称经 Unicode 规范化与大小写归并。改名可能改变 URL，已经使用的名称应保持稳定。

## 自动分享图

文章与项目会自动生成 1200×630 PNG。文字卡片包含标题、分类或项目标识、最多三个标签／技术栈、作者与站点地址，统一浅色蓝白风格。文章的 `cover` 和 `coverAlt` 仍用于正文展示，社交分享与文章 JSON-LD 始终使用自动生成的卡片。

无需手工填写分享图路径。文章使用 `/og/blog/<slug>-<hash>.png`，项目使用 `/og/projects/<slug>-<hash>.png`；修改卡片文字、品牌配置或模板后，构建会更新图片地址。平台自己的页面抓取及缓存刷新仍由平台决定。

标题会换行、缩小字号；超出三行时图片内显示省略，完整标题仍保留在页面与替代文字中。草稿和示例图片随其内容一起从生产构建排除。字体固定在仓库的 `assets/fonts/`，附授权和校验信息，构建不联网取字体，也不依赖本机字体。

构建后执行 `audit:site`，打开 `reports/share-preview.html` 检查真实内容卡片；同目录的 `sharing.json`、`sharing.md` 保存图片及验证配置检查结果。图片可直接从生产预览对应的 `/og/` 地址访问。

## 精选公开项目

在 `src/content/projects/` 添加 Markdown：

```yaml
---
slug: 'my-public-project'
repoFullName: '0xAlchemist-cs/实际公开仓库名'
displayName: '项目名称'
summary: '项目解决什么问题，适合谁使用。'
techStack: ['TypeScript']
featured: true
draft: true
example: false
relatedPosts: ['my-first-note']
---
```

确认公开且允许展示后，改为 `draft: false`。可选的 `demoUrl`、`status` 仅填写真实信息，不自动枚举账号全部仓库，不抓取 README HTML。

文章的 `relatedRepos` 填写仓库全名，项目的 `relatedPosts` 填写文章 slug；任一侧配置均可双向展示。隐藏文章不产生生产死链。

## 刷新公开元数据

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 sync:github
powershell -ExecutionPolicy Bypass -File scripts/project.ps1 format
```

只请求已精选、非草稿、非示例项目。无 Token 可尝试公开 API；超时、断网或限流时保留有效缓存，首次失败则使用手工资料，不编造 Star。成功数据注明快照获取日期；公开字段没有变化时保留原快照及日期，避免只有时间变化的更新。

当前精选项目为 `ielts-workspace` 和 `signal-vision-backtest`；配置、介绍文章、项目页与 GitHub 链接均可单独维护。取消精选后再次同步会清理对应缓存。

GitHub Actions 的 **Review public project metadata** 每周一北京时间约 09:17 检查，也可手动运行。只读任务使用 `--strict`：任一仓库同步失败时保留原文件并失败退出；校验、构建和产物审计通过后，才把缓存交给单独的写入任务。

写入任务只提交 `src/data/github-public-cache.json`，复用 `codex/refresh-public-metadata` 分支与同一待审核 PR，不自动合并。无有效差异时不创建空 PR。创建或更新 PR 后会显式触发该分支的完整 CI；作者审核并确认合并后，走正常部署门禁。

手动运行时可选 `dry_run`，仅检查并保存 Artifact，适合验证新配置。该模式也允许在功能分支运行；创建 PR 的任务只允许在 `main` 运行。日常本地同步仍允许有效缓存回退；需要严格失败时在 npm 命令后添加 `-- --strict`。

### 中文检索规则

连续中文按完整短语查找，例如“回放”“图文信号回放”；空格分开的关键词可位于正文不同位置，例如 `Python 回放`。加英文双引号要求整个短语连续，例如 `"Python 回放"`。纯英文查询沿用 Pagefind 的处理。

构建只在搜索索引副本中统一中文字边界，站点正文、元数据和锚点不变；查询适配层对中文短语分别搜索，并以页面交集实现组合查询，避免不同浏览器分词造成漏检或将“回忆……放弃”误作“回放”。结果标题会去掉索引专用的不可见分隔符。无需外部服务或额外依赖，底层仍使用 [Pagefind](https://pagefind.app/docs/multilingual/)。

## 日常发布

新建分支 → 本地写作和预览 → `verify` → 确认真实内容并取消草稿 → PR → CI → 作者确认合并 → 自动部署。网站功能有改动时另跑 `test:browser`。检查失败时修复错误，不绕过门禁。

## 修改已上线的文章

直接编辑 `src/content/posts/` 中对应的 Markdown 文件。正文、标题、摘要、标签和参考资料都可以调整；保留原来的 `slug`，文章地址就会保持稳定。

保留原始 `publishedAt` 和 `draft: false`，需要展示修改时间时填写本次修改日期的 `updatedAt`，例如 `updatedAt: '2026-10-20'`。修改先在分支预览，通过检查并确认合并后，GitHub Actions 会重新构建部署，更新线上正文、搜索索引、RSS 和 Sitemap。

发布后需要恢复旧版本时，按部署文档通过新 PR 撤销对应提交，再经检查和部署恢复内容。
