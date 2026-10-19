# Codex Master Prompt｜零成本 GitHub Pages 个人技术博客（Astro + SEO / GEO）

> 使用方法：把本文件完整粘贴给 Codex，或将它放进目标代码仓库并要求 Codex 依此执行。
> 项目目标：一个与 GitHub 深度关联、面向中文技术内容、可长期维护的个人品牌博客；不需要购买域名或服务器。

---

## 0. 你的角色与工作原则

你是一名资深全栈架构师、静态网站工程师、技术 SEO 工程师、GitHub Actions 工程师和严谨的代码审查员。你的交付物必须是真正可运行、可测试、可部署、可维护的项目，而不是只有截图、设计稿或空壳页面。

严格遵守：

1. **零成本是硬约束**：不得要求购买域名、VPS、数据库、付费 SaaS、付费 CMS、主题授权或 AI API 额度。可选外部服务只能在用户明确开启后启用，并必须有免费、无 Key 的回退路径。
2. **网址必须是** `https://<GITHUB_USERNAME>.github.io/`，仓库名称必须是 `<GITHUB_USERNAME>.github.io`，仓库使用 GitHub Free 可部署的**公开仓库**。不得配置自定义域名、DNS、CNAME 或默认依赖 Cloudflare/Vercel/Netlify。
3. **静态优先**：Astro + TypeScript + Markdown/MDX，使用 GitHub Pages 静态构建；**不依赖运行期后端、数据库、Node 服务器或运行时 Secrets**。
4. **数据来源可信**：展示公开 GitHub 仓库；不得向网站 HTML/前端 JS 暴露 GitHub Token、AI API Key、OAuth 凭据。私有仓库信息默认不抓取、不同步、不展示。
5. **工程质量优先**：类型严格、模块职责清晰、命名规范、可访问性、移动端响应式、错误降级、版本锁定、测试、文档、合理的自动化工作流。
6. **不夸大 SEO/GEO**：结构化数据、Sitemap、AI 爬虫可访问性不保证收录、AI 引用或搜索排名。不得编造流量数据、关键词排名、项目 Star 数。
7. **不要一次性重写整个仓库**。先审计再规划，按小里程碑推进，每阶段验证并输出实际修改清单。保留现有 Git 历史；破坏性操作（重置、覆盖、删除、强推）须先征得用户同意。
8. 若用户尚未提供 GitHub 用户名，优先从当前 repo remote 或 GitHub CLI 环境推断并**要求用户核对**；不要凭空假定账号。账号缺失时使用唯一配置占位符，先完成可本地运行的工程。

## 1. 成功标准

打造现代、克制、浅色优先的中文技术博客，兼具参考站点的高可读性和现代工程化能力：

- 访客可以快速阅读文章、按标签/分类浏览、搜索文章、访问作者资料、找到公开 GitHub 项目。
- 访客能够从一篇技术文章跳转到关联的 GitHub Repo / Release / Demo；从项目详情找到对应技术文章。
- 作者在 Git 中提交 Markdown → 触发质量检查 → 合并到 main → GitHub Actions 自动构建 → GitHub Pages 公布。
- 发布后的站点拥有正确的 canonical、metadata、Open Graph、JSON-LD、Sitemap、robots.txt、RSS、无效链接检查等。
- GitHub 项目展示数据由 Actions 构建时或低频同步时从 GitHub API 获取，遇到失败会使用上次**公开且已验证**的缓存，不能导致整个博客不可访问。
- 站点无 AI Key 时可完成确定性 SEO 校验（缺少 title/description、过长摘要、重复 slug、坏链接、图片缺 alt、缺 date 等）；填入可选 AI Key 后仅增加建议型分析，不自动发布未经审核的 AI 修改。
- 手机和桌面都正常显示，支持键盘操作、语义化标签、合理色彩对比、减少动画。

## 2. 推荐技术栈（如当前仓库已有等价能力，保留优质已有实现）

- Astro（官方稳定版）、TypeScript strict、Astro Content Collections（schema 校验）。
- Markdown/MDX 文章、Shiki 代码高亮、Astro 图片处理；尽可能零或少客户端 JavaScript。
- 官方 `@astrojs/sitemap`，`@astrojs/rss`；按需要使用成熟的 OG 图片方案，也可先采用静态默认 OG 图片。
- GitHub Actions：PR / push CI；main 构建和 `withastro/action` + `actions/deploy-pages` 正式部署；最小权限。
- GitHub 项目同步：GitHub REST API + Actions 内置 `GITHUB_TOKEN`（仅服务于 Actions 构建/同步；绝不写入前端），亦可纯本地配置公开项目清单。
- 评论：Giscus（GitHub Discussions）**可选**，默认关闭；无需服务器，确认 repo Discussions 配置后再开通。
- Search Console、Bing Webmaster Tools、IndexNow 均为**可选外部注册/验证步骤**。IndexNow 需先完成 key 文件和提交验证，不承诺一定生效。
- 自动化 SEO：Node/TypeScript 本地检查脚本，默认不调用第三方付费 API；可选 LLM 插件单独模块化。

## 3. 页面与信息架构

页面至少包括：

1. `/` 首页：个人介绍、精选文章、公开项目精选、主题分类入口。首页以内容可读性为核心，不要做大面积炫技动画。
2. `/blog/` 文章列表：分页、标签、分类、发布时间。
3. `/blog/[slug]/` 文章详情：目录、阅读时间、上/下篇、相关文章、原始资料和相关仓库链接、规范的文章结构化数据。
4. `/tags/` 和 `/tags/[tag]/`：标签入口与文章列表。
5. `/projects/` 和 `/projects/[slug]/`：公开项目卡片及详情，显示名称、简介、技术栈、仓库链接、文档/演示链接（仅实际存在时），Star / 最后更新（显示数据更新时间、抓取失败时不伪造）。
6. `/about/`：作者介绍、技能、个人 GitHub、联系渠道（由配置控制）。
7. `/search/`：优先选用构建期生成的静态搜索索引和客户端轻量搜索，避免第三方收费搜索 SaaS。
8. `/404` 与 `/rss.xml`。

**内容模型**：

- `posts`: title、description、slug、publishedAt、updatedAt?、draft、tags、category、cover?、coverAlt?、canonical?（必要时）、relatedRepos[]、references[]、language?。
- `projects`: slug、repoFullName、displayName?、summary、techStack[]、featured、relatedPosts[]、demoUrl?、status?。
- `siteConfig`: githubUsername、siteUrl（生成）、siteTitle、authorName、bio、socialProfiles、siteLanguage、theme。
- 日期统一 ISO；草稿不进入公开构建、Sitemap、RSS；分类/标签 slug 稳定，可维护旧链接的静态跳转页。

## 4. SEO 关键要求（必须落地与测试）

- 在页面级生成唯一 `<title>`、meta description、canonical（绝对 URL）、OG/Twitter metadata、语言属性和可选图片。
- `astro.config` 中 `site` 必须是 `https://<username>.github.io`，**用户主页仓库不得错误设置 `/repo-name/` base**；内部链接不得出现双重前缀；优先统一 trailing slash 策略。
- Sitemap 必须与实际输出文件名对应，`robots.txt` 中的 Sitemap 地址一致，且只包含正式、可索引页面；RSS 的绝对链接正确。
- 合理使用 `Person`、`WebSite`、`BlogPosting`/`Article`、`BreadcrumbList` 的 JSON-LD，字段必须与真实页面一致。没有事实支持的数据不要补造。
- 禁止生产页面意外 `noindex`，也禁止利用隐形文字、关键词堆砌、虚假评论、门页等违规 SEO 技巧。
- 语义化 H1/H2/H3、可读 URL、内部链接、图片尺寸和 alt、代码块可复制性、清晰的原始来源和更新日期。
- 检查 `robots.txt` 的搜索爬虫策略；搜索展示与模型训练权限应当分别考虑，不能把 AI 爬虫一概当成同一种用途；默认允许正常公开网页的索引爬虫，不承诺 AI 搜索一定引用。
- `llms.txt` 如加入，仅作为**实验性辅助文件**，不能宣称其能提高 Google 或 ChatGPT 引用；优先做好 HTML/JSON-LD、可信内容、原始引用、RSS/Sitemap。
- 不把 Google Indexing API 当作普通文章的一键收录 API；Google 对其适用页面类型有限制。提交 Sitemap 不等于保证收录。

## 5. GitHub 深度关联

- 显示一份**用户审核通过**的项目列表；同步只能读取公开元数据（full_name、description、html_url、language、topics、stargazers_count、updated_at 等）。
- 支持 “手动精选 + GitHub 公共数据补全”；精选顺序、项目分组和描述由作者决定，不要用 Star 自动决定所有内容排序。
- 抓取策略：首次构建如 API 不可用，使用手工项目配置；可选每周定时刷新并提交静态缓存，手工 workflow_dispatch 也可以触发；遇到 API 限流时保留最后成功数据。
- 所有外部数据做 schema 验证、文本转义、URL 校验、错误记录；避免直接把外部 README HTML 注入页面。
- 同步功能不得暴露 GITHUB_TOKEN，不使用外部网站接收 Token。
- 项目文章对应通过 `relatedRepos` 与 `relatedPosts` 互相关联；可扩展至公开 Releases，但 MVP 不抓取 Commit 历史全文。

## 6. 自动 SEO 审计与可选 AI Key

建立 `scripts/seo-audit.ts` 或等价模块，至少检查：

- Markdown frontmatter 必填字段、日期有效性、slug 唯一、标签规范化。
- `title` / `description` 长度区间**作为警告而非盲目的硬性排名公式**；摘要缺失/标题重复应阻断或明确报告。
- 图片 ALT 缺失、死链（本地站内链接优先）、过于稀疏的文章结构、缺少出处的统计或断言（仅提示人工复核）。
- 构建后的 canonical 唯一、JSON-LD 有效、Sitemap 可解析、全部 URL 在站点根路径下。
- 输出 JSON 与 Markdown 审计报告，CI 上传 artifact；可在 PR 留评论，但注意权限和无 Token 环境降级。

可选 `AI_SEO_API_KEY`：

- 默认**不设置**、**不调用**、**不收费**、**不阻断发布**。Key 只能作为 GitHub Actions Secrets/本地环境变量，严禁注入静态站点或日志。
- 仅在显式配置 `AI_SEO_ENABLED=true` 后分析文章的可读性、问答结构、标题建议、摘要建议、内部链接建议、内容事实核查清单。
- AI 不得捏造经验、案例、数字、引用，不得直接改写后自动发布；输出建议报告经人工审批后再修改。
- 采用适配器接口，避免锁定某家模型供应商；若尚无服务可用，提供 `NoopSeoAssistant` 和本地规则版本。

## 7. GitHub Actions 与 CI/CD

分离两种 workflow：

A. `ci.yml`：在 pull_request 和 main push 时检查格式、TypeScript、内容 schema、SEO 规则、链接、build；无须外部 Secrets。

B. `deploy.yml`：main push（也允许手工触发）；在 CI 通过后使用 Astro 官方 Action 发布 GitHub Pages；权限 `contents: read`、`pages: write`、`id-token: write`，GitHub Pages 部署环境为 `github-pages`，并开启并发保护，避免较旧构建覆盖新版本。

可选 C. `sync-github.yml`：定时低频或手工触发；只获取公开数据；必须处理限流与错误，是否自动 PR 由用户决定；**不得因刷新失败而覆盖已有缓存**。

每次构建要求可重复，提交锁文件（package-lock / pnpm-lock）；尽可能固定 action 主版本。对外部 PR 不能运行可读取高权限 Secrets 的脚本。

## 8. 视觉与交互设计

- 参考中文技术博客的阅读体验：浅色、克制、留白、合理字号、目录清晰；不要黑底高对比、连续横线堆叠或大面积运动效果。
- 自适应桌面/手机，带可访问导航、键盘焦点、面包屑；暗色模式可选但不抢主视觉。
- 首屏先展示作者身份与精选内容，而不是复杂 3D 动效。
- 可按分类浏览，文章展示最后修改日期并与 GitHub Repo 建立可信关联。
- 核心组件：BaseLayout、SeoHead、Header、Footer、ArticleCard、ProjectCard、TagChip、TableOfContents、Breadcrumb、RelatedRepos、RelatedPosts、SearchBox。

## 9. 项目结构建议（可合理调整）

```text
<username>.github.io/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy.yml
│   └── sync-github.yml              # 可选
├── public/
│   ├── robots.txt                   # 或构建期生成
│   ├── favicon.svg
│   └── images/default-og.png
├── src/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   │   ├── index.astro
│   │   ├── blog/
│   │   ├── projects/
│   │   ├── tags/
│   │   ├── about.astro
│   │   └── rss.xml.ts
│   ├── content/posts/
│   ├── content/projects/
│   ├── data/github-public-cache.json
│   ├── config/site.ts
│   ├── lib/github/
│   ├── lib/seo/
│   └── styles/
├── scripts/
│   ├── seo-audit.ts
│   ├── sync-github.ts
│   └── check-generated-site.ts
├── tests/
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── README.md
├── SYSTEM_ARCHITECTURE.md
├── DEPLOYMENT.md
└── CONTENT_GUIDE.md
```

## 10. 开发阶段（严格按序；每阶段都需交付和验收）

### 阶段 0：仓库与环境审计
- 检查当前目录是否已有项目、远端和可用账号；输出不可破坏现有工作成果的实施计划。
- 收集/确认 GitHub 用户名、网站标题、作者显示名（可以默认占位符）。
- 判断新建或渐进改造；列出依赖、风险、预计文件变更（无需估算时间）。

### 阶段 1：可部署的最小站点
- Astro + TypeScript strict 初始化、全局布局、首页、About、示例文章。
- GitHub Pages URL/仓库名/部署工作流正确配置，CI、本地 `build` 通过。
- 用最少依赖实现，不引入数据库和付费服务。

### 阶段 2：完整博客内容系统
- Content Collections、文章页、列表、归档、分类/标签、目录、静态搜索、RSS、404。
- 草稿隔离、日期与 slug 验证、移动端可访问性。

### 阶段 3：GitHub 项目专区
- 静态手工项目配置；公开仓库 API 缓存/同步；项目详情、关联文章。
- 验证 GitHub API 失败时页面正常构建、敏感信息不出现在产物。

### 阶段 4：SEO/GEO 工程
- SeoHead、canonical、OG、Sitemap、robots、JSON-LD、内部链接、公开爬虫策略。
- 默认无 Key SEO 审计；可选 AI 适配器与报告（不开启也完全正常）。

### 阶段 5：质量门禁及正式上线
- 完成单测、站点生成产物检查、死链、移动端 Lighthouse/无障碍检查。
- GitHub Actions 成功部署，逐条确认线上文章、Sitemap、RSS、robots、meta、项目链接正常。
- 搜索引擎验证/提交属于上线后的可选人工操作，不作为部署前阻塞。

### 阶段 6：维护与运营
- 新文章 PR → CI → 人工审核 → 合并 → 自动部署；SEO 审计报告周期回顾。
- 公开项目缓存每周刷新或手动更新；失败保护；保留回滚说明。
- 提供用户可直接使用的 `CONTENT_GUIDE.md` 和 `DEPLOYMENT.md`。

## 11. 验收条件（不得只有自述，必须附证据）

1. `npm ci`、`npm run check`（或等价）、`npm run build` 成功，CI 正常。
2. 网站从仓库 `<username>.github.io` 部署后根 URL 是 `https://<username>.github.io/`，没有 `/repo-name/` 错误路径。
3. 至少有 1 篇示例文章、1 个示例公开项目（使用占位示例时必须明确标注，不伪造真实仓库）。
4. `sitemap-index.xml` 或实际生成的 Sitemap URL 可访问，且 robots.txt 引用的是实际路径，不得猜文件名。
5. 每篇文章在生成的 HTML 内有独立 title/description/canonical 和有效的 BlogPosting/Article JSON-LD。
6. README 说明替换 GitHub 用户名、如何发布文章、如何维护项目、如何部署、如何做 Search Console 验证。
7. 没有任何必须购买的服务，未提供 AI Key 也可成功构建。
8. 证明 Token/Secrets 未进入 `dist/`、日志和前端 bundle。
9. 报告测试命令与结果，清楚区分已实测项和只能由用户登录 GitHub 后验证的步骤。

## 12. 你的每轮输出格式

在每个里程碑结束时输出：

- **完成了什么**：按模块说明具体变更。
- **主要文件**：新增/修改文件路径及原因。
- **验证证据**：实际执行的命令、结果、仍未验证之处。
- **风险与限制**：是否存在 GitHub 账号、认证、抓取额度、SEO 收录等外部限制。
- **下一阶段计划**：不重复已完成的工作。

若你有本地代码编辑与命令执行权限，请直接实施并验证；若无权限，输出可复制文件/补丁及精确操作步骤，不要假装已部署或已连接 GitHub。

---

## 官方资料（实现时以当前官方文档为准）

- GitHub Pages: https://docs.github.com/en/pages/quickstart
- Astro GitHub Pages 部署: https://docs.astro.build/en/guides/deploy/github/
- Astro Sitemap: https://docs.astro.build/en/guides/integrations-guide/sitemap/
- Google AI 功能与网站: https://developers.google.com/search/docs/appearance/ai-features
- Google Sitemap: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google 文章结构化数据: https://developers.google.com/search/docs/appearance/structured-data/article
- IndexNow（可选）: https://www.indexnow.org/
