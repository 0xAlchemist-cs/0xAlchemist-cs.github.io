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

只请求已精选、非草稿、非示例项目。无 Token 可尝试公开 API；超时、断网或限流时保留有效缓存，首次失败则使用手工资料，不编造 Star。成功数据注明获取日期。

审查缓存差异后通过 PR 提交。GitHub 手动同步工作流只上传 artifact，不自动提交或合并；没有定时写入任务。取消精选后再次同步会清理对应缓存。

## 日常发布

新建分支 → 本地写作和预览 → `verify` → 确认真实内容并取消草稿 → PR → CI → 作者确认合并 → 自动部署。网站功能有改动时另跑 `test:browser`。检查失败时修复错误，不绕过门禁。

## 修改已上线的文章

直接编辑 `src/content/posts/` 中对应的 Markdown 文件。正文、标题、摘要、标签和参考资料都可以调整；保留原来的 `slug`，文章地址就会保持稳定。

保留原始 `publishedAt` 和 `draft: false`，需要展示修改时间时填写本次修改日期的 `updatedAt`，例如 `updatedAt: '2026-10-20'`。修改先在分支预览，通过检查并确认合并后，GitHub Actions 会重新构建部署，更新线上正文、搜索索引、RSS 和 Sitemap。

发布后需要恢复旧版本时，按部署文档通过新 PR 撤销对应提交，再经检查和部署恢复内容。
