import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'node-html-parser';
import { site } from '../src/config/site';
import { loadContent } from './content-files';
import { writeReport, type AuditReport } from './report';
import { auditSharing, writeSharingReport } from './sharing-audit';

async function walk(directory: string): Promise<string[]> {
  const files = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      files.map((file) =>
        file.isDirectory()
          ? walk(join(directory, file.name))
          : [join(directory, file.name)],
      ),
    )
  ).flat();
}
export async function auditGeneratedSite(
  directory = 'dist',
): Promise<AuditReport> {
  const root = resolve(directory);
  const files = await walk(root);
  const errors: string[] = [];
  const warnings: string[] = [];
  const canonicalSeen = new Set<string>();
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const pages = new Map<string, ReturnType<typeof parse>>();
  const content = await loadContent();
  const hidden = [...content.posts, ...content.projects].filter(
    (entry) => entry.data.draft || entry.data.example,
  );
  const articleData = new Map(
    content.posts
      .filter((post) => !post.data.draft && !post.data.example)
      .map((post) => [`/blog/${post.data.slug}/`, post.data]),
  );
  const routeOf = (file: string) => {
    const path = '/' + relative(root, file).split(sep).join('/');
    return path.endsWith('/index.html') ? path.slice(0, -10) : path;
  };
  for (const file of htmlFiles)
    pages.set(file, parse(await readFile(file, 'utf8')));
  async function localFile(path: string) {
    const candidates = [path, decodeURIComponent(path)];
    for (const candidate of candidates) {
      const base = resolve(root, '.' + candidate);
      if (base !== root && !base.startsWith(root + sep)) continue;
      for (const target of [base, join(base, 'index.html')]) {
        try {
          if ((await stat(target)).isFile()) return target;
        } catch {
          /* Try alternate static output. */
        }
      }
    }
  }
  for (const [file, document] of pages) {
    const path = routeOf(file);
    const label = relative(root, file);
    const title = document.querySelector('title')?.text.trim();
    const description = document
      .querySelector('meta[name="description"]')
      ?.getAttribute('content');
    const canonicals = document.querySelectorAll('link[rel="canonical"]');
    if (!title || titles.has(title)) errors.push(`${label}: 标题缺失或重复。`);
    if (title) titles.add(title);
    if (!description || descriptions.has(description))
      errors.push(`${label}: 摘要缺失或重复。`);
    if (description) descriptions.add(description);
    if (document.querySelectorAll('h1').length !== 1)
      errors.push(`${label}: 页面应有且只有一个 H1。`);
    if (document.querySelector('html')?.getAttribute('lang') !== 'zh-CN')
      errors.push(`${label}: 缺少中文语言属性。`);
    const noindex = document
      .querySelector('meta[name="robots"]')
      ?.getAttribute('content')
      ?.includes('noindex');
    if (noindex && !['/search/', '/404.html'].includes(path))
      errors.push(`${label}: 正式页面意外 noindex。`);
    if (!noindex && ['/search/', '/404.html'].includes(path))
      errors.push(`${label}: 辅助页面应设置 noindex。`);
    if (canonicals.length !== 1) errors.push(`${label}: canonical 数量错误。`);
    const canonical = canonicals[0]?.getAttribute('href') ?? '';
    try {
      const url = new URL(canonical);
      if (canonicalSeen.has(url.href))
        errors.push(`${label}: canonical 重复。`);
      canonicalSeen.add(url.href);
      const configured = articleData.get(path)?.canonical;
      if (configured ? canonical !== configured : url.origin !== site.url)
        errors.push(`${label}: canonical 站点来源错误。`);
      if (
        !configured &&
        !noindex &&
        decodeURIComponent(url.pathname) !== decodeURIComponent(path)
      )
        errors.push(`${label}: canonical 与输出路由不一致。`);
    } catch {
      errors.push(`${label}: canonical 不是绝对 URL。`);
    }
    for (const property of [
      'og:title',
      'og:description',
      'og:url',
      'og:image',
    ]) {
      if (
        !document
          .querySelector(`meta[property="${property}"]`)
          ?.getAttribute('content')
      )
        errors.push(`${label}: 缺少 ${property}。`);
    }
    let hasArticle = false;
    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]',
    )) {
      try {
        const schema = JSON.parse(script.text);
        if (schema['@context'] !== 'https://schema.org' || !schema['@type'])
          throw new Error();
        if (schema['@type'] === 'BlogPosting') {
          hasArticle = true;
          const expected = articleData.get(path);
          if (
            !expected ||
            schema.headline !== expected.title ||
            schema.description !== expected.description ||
            !Number.isFinite(Date.parse(schema.datePublished))
          )
            errors.push(`${label}: 文章 JSON-LD 与内容不一致。`);
        }
      } catch {
        errors.push(`${label}: JSON-LD 无效。`);
      }
    }
    if (articleData.has(path) && !hasArticle)
      errors.push(`${label}: 文章缺少 BlogPosting JSON-LD。`);
    for (const image of document.querySelectorAll('img')) {
      if (!image.hasAttribute('alt')) errors.push(`${label}: 图片缺少 alt。`);
      if (!image.hasAttribute('width') || !image.hasAttribute('height'))
        errors.push(`${label}: 图片缺少尺寸。`);
    }
    for (const element of document.querySelectorAll(
      'a[href], img[src], script[src], link[href]',
    )) {
      const href = element.getAttribute('href') ?? element.getAttribute('src');
      if (!href || /^(mailto:|tel:|data:)/i.test(href)) continue;
      try {
        const url = new URL(href, site.url + path);
        if (url.origin !== site.url) continue;
        const target = await localFile(url.pathname);
        if (!target) {
          errors.push(`${label}: 站内链接或资源不存在：${url.pathname}`);
          continue;
        }
        if (url.hash && target.endsWith('.html')) {
          const targetDocument = pages.get(target);
          const id = decodeURIComponent(url.hash.slice(1));
          if (
            !targetDocument
              ?.querySelectorAll('[id]')
              .some((node) => node.id === id)
          )
            errors.push(`${label}: 锚点不存在：${url.pathname}${url.hash}`);
        }
      } catch {
        errors.push(`${label}: 链接格式无效。`);
      }
    }
  }
  const robots = await readFile(join(root, 'robots.txt'), 'utf8');
  const sitemapMatch = /^Sitemap:\s*(\S+)/im.exec(robots);
  if (!sitemapMatch || sitemapMatch[1] !== `${site.url}/sitemap-index.xml`)
    errors.push('robots.txt 未引用实际 Sitemap 索引。');
  const index = parse(await readFile(join(root, 'sitemap-index.xml'), 'utf8'));
  const sitemapPages: string[] = [];
  for (const loc of index.querySelectorAll('loc')) {
    const url = new URL(loc.text);
    const file = await localFile(url.pathname);
    if (url.origin !== site.url || !file) {
      errors.push('Sitemap 子文件不存在或站点错误。');
      continue;
    }
    const child = parse(await readFile(file, 'utf8'));
    if (!child.querySelector('urlset'))
      errors.push('Sitemap 不是有效的 URL 集合。');
    for (const location of child.querySelectorAll('loc')) {
      const target = new URL(location.text);
      sitemapPages.push(target.pathname);
      if (target.origin !== site.url || !(await localFile(target.pathname)))
        errors.push(`Sitemap 指向不存在的页面：${target.pathname}`);
      if (/\/(search|404)(\/|\.|$)/.test(target.pathname))
        errors.push('Sitemap 包含不应索引的辅助页面。');
    }
  }
  for (const [file, document] of pages) {
    if (
      !document
        .querySelector('meta[name="robots"]')
        ?.getAttribute('content')
        ?.includes('noindex') &&
      !sitemapPages.some(
        (path) =>
          decodeURIComponent(path) === decodeURIComponent(routeOf(file)),
      )
    )
      errors.push(`${relative(root, file)}: 正式页面未列入 Sitemap。`);
  }
  const rss = parse(await readFile(join(root, 'rss.xml'), 'utf8'));
  if (!rss.querySelector('rss') || !rss.querySelector('channel'))
    errors.push('RSS 结构无效。');
  const publicPosts = content.posts.filter(
    (post) => !post.data.draft && !post.data.example,
  );
  if (rss.querySelectorAll('item').length !== publicPosts.length)
    errors.push('RSS 文章数量与正式内容不符。');
  for (const post of publicPosts) {
    if (!(await localFile(`/blog/${post.data.slug}/`)))
      errors.push(`正式文章未生成：${post.data.slug}`);
  }
  const envSecrets = Object.entries(process.env)
    .filter(
      ([key, value]) =>
        /TOKEN|SECRET|API_KEY/.test(key) && value && value.length >= 12,
    )
    .map(([, value]) => value!);
  const secretPattern =
    /(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-proj-[A-Za-z0-9_-]{20,})/;
  for (const file of files.filter((file) =>
    /\.(html|js|json|xml|txt|css|map)$/.test(file),
  )) {
    const text = await readFile(file, 'utf8');
    if (
      secretPattern.test(text) ||
      envSecrets.some((secret) => text.includes(secret))
    )
      errors.push(`${relative(root, file)}: 检测到疑似凭据，未打印内容。`);
    if (text.includes('DRAFT_CANARY_DO_NOT_PUBLISH_71A9'))
      errors.push(`${relative(root, file)}: 草稿正文泄漏。`);
    for (const entry of hidden) {
      const route = `/${'publishedAt' in entry.data ? 'blog' : 'projects'}/${entry.data.slug}/`;
      if (text.includes(route))
        errors.push(`${relative(root, file)}: 示例或草稿路径进入公开产物。`);
    }
  }
  if (!publicPosts.length)
    warnings.push('没有正式文章，当前产物用于验证空状态，不具备正式上线条件。');
  return { checked: htmlFiles.length, errors: [...new Set(errors)], warnings };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await writeReport('seo-site', await auditGeneratedSite());
    await writeSharingReport(await auditSharing());
  } catch {
    await writeReport('seo-site', {
      checked: 0,
      errors: ['无法读取或解析生成产物；请先成功构建。'],
      warnings: [],
    });
  }
}
