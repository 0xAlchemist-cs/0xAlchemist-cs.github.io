import {
  readFile,
  readdir,
  lstat,
  appendFile,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { parse, type HTMLElement } from 'node-html-parser';
import sharp from 'sharp';
import {
  site,
  searchVerification,
  type SearchVerification,
} from '../src/config/site';
import { writeReport, type AuditReport } from './report';
import { readApprovedShareArt } from '../src/lib/share-art';

export interface SharingCard {
  art: {
    source: 'template' | 'ai';
    approval: 'not_configured' | 'confirmed';
    review: 'not_required' | 'current' | 'needs_review';
  };
  page: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  width: number;
  height: number;
}

export interface SharingAuditReport extends AuditReport {
  verification: {
    status: 'configured' | 'not_configured';
    configured: { google: boolean; bing: boolean };
  };
  platformOperations: {
    accountVerification: 'not_performed';
    sitemapSubmission: 'not_performed';
    indexingInspection: 'not_performed';
  };
  cards: SharingCard[];
}

const verificationNames = {
  google: 'google-site-verification',
  bing: 'msvalidate.01',
} as const;

const inside = (root: string, target: string) =>
  target === root || target.startsWith(root + sep);

async function walk(root: string, errors: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = join(root, entry.name);
    // Never follow symlinks, including directory symlinks out of the build.
    if (entry.isSymbolicLink())
      errors.push(
        `${entry.name}: symbolic links are not allowed in generated output.`,
      );
    else if (entry.isDirectory()) files.push(...(await walk(target, errors)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function resolveImage(root: string, image: string): Promise<string> {
  const url = new URL(image);
  if (
    url.origin !== new URL(site.url).origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    image !== url.href
  )
    throw new Error('expected an absolute local image URL');
  const path = decodeURIComponent(url.pathname);
  if (
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('unsafe image path');
  const target = resolve(root, '.' + path);
  if (!inside(root, target))
    throw new Error('image path escapes generated root');
  // Inspect every component rather than following links outside the output root.
  // lstat also works in Windows sandboxes that prohibit realpath handles.
  let component = root;
  for (const part of ['', ...relative(root, target).split(sep)]) {
    if (part) component = join(component, part);
    if ((await lstat(component)).isSymbolicLink())
      throw new Error('image path contains a symlink');
  }
  return target;
}

async function decodePng(file: string) {
  const bytes = await readFile(file);
  const metadata = await sharp(bytes, { failOn: 'warning' }).metadata();
  if (metadata.format !== 'png') throw new Error('image must decode as PNG');
  // metadata() alone accepts some truncated PNGs; decode every pixel as well.
  await sharp(bytes, { failOn: 'warning' }).raw().toBuffer();
  if (metadata.width !== 1200 || metadata.height !== 630)
    throw new Error('actual PNG dimensions must be 1200x630');
  return bytes;
}

function meta(document: HTMLElement, key: string) {
  return document
    .querySelectorAll('meta')
    .filter(
      (element) =>
        element.getAttribute('property') === key ||
        element.getAttribute('name') === key,
    );
}

const usefulAlt = (value: string) =>
  value.trim().length >= 4 &&
  !/^(image|photo|picture|cover|thumbnail|图片|封面|分享图|预览图)$/i.test(
    value.trim(),
  );

function blogPostings(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(blogPostings);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record['@type'])
    ? record['@type']
    : [record['@type']];
  return [
    ...(types.includes('BlogPosting') ? [record] : []),
    ...blogPostings(record['@graph']),
  ];
}

export async function auditSharing(
  directory = 'dist',
  verification: SearchVerification = searchVerification,
  options: { authorRoot?: string } = {},
): Promise<SharingAuditReport> {
  const root = resolve(directory);
  const tokens = {
    google: verification.google?.trim() || '',
    bing: verification.bing?.trim() || '',
  };
  const configured = { google: !!tokens.google, bing: !!tokens.bing };
  const report: SharingAuditReport = {
    checked: 0,
    errors: [],
    warnings: [],
    verification: {
      status:
        configured.google || configured.bing ? 'configured' : 'not_configured',
      configured,
    },
    platformOperations: {
      accountVerification: 'not_performed',
      sitemapSubmission: 'not_performed',
      indexingInspection: 'not_performed',
    },
    cards: [],
  };
  let files: string[];
  try {
    files = await walk(root, report.errors);
  } catch {
    report.errors.push('无法读取生成产物；请先成功构建。');
    return report;
  }
  const htmlFiles = files.filter((file) => /\.html$/i.test(file));
  const referenced = new Set<string>();
  const decoded = new Map<string, Promise<Buffer>>();
  for (const file of htmlFiles) {
    report.checked++;
    const label = relative(root, file).split(sep).join('/');
    const page = '/' + label.replace(/(^|\/)index\.html$/, '$1');
    const document = parse(await readFile(file, 'utf8'));
    const error = (message: string) =>
      report.errors.push(`${label}: ${message}`);
    const value = (key: string) => {
      const elements = meta(document, key);
      if (elements.length !== 1)
        error(`${key} must appear exactly once (found ${elements.length}).`);
      const attribute = key.startsWith('twitter:') ? 'name' : 'property';
      if (elements[0] && elements[0].getAttribute(attribute) !== key)
        error(`${key} must use the ${attribute} attribute.`);
      const content = elements[0]?.getAttribute('content') ?? '';
      if (!content.trim()) error(`${key} is missing or empty.`);
      return content;
    };
    const image = value('og:image');
    const twitterImage = value('twitter:image');
    if (image !== twitterImage) error('OG and Twitter image URLs must match.');
    const title = value('og:title');
    const description = value('og:description');
    const alt = value('og:image:alt');
    const twitterAlt = value('twitter:image:alt');
    if (!usefulAlt(alt))
      error('og:image:alt must describe the sharing image usefully.');
    if (!usefulAlt(twitterAlt))
      error('twitter:image:alt must describe the sharing image usefully.');
    if (alt !== twitterAlt) error('OG and Twitter image alt text must match.');
    if (value('og:image:width') !== '1200')
      error('og:image:width must be 1200.');
    if (value('og:image:height') !== '630')
      error('og:image:height must be 630.');

    // Derive the expected namespace from output paths, independently of card generation.
    const contentRoute = /^\/(blog|projects)\/([^/]+)\/$/.exec(page);
    let expectedImage = false;
    try {
      const url = new URL(image);
      if (contentRoute) {
        const [, kind, slug] = contentRoute;
        const expectedPrefix = `/og/${kind}/${slug}-`;
        expectedImage =
          url.pathname.startsWith(expectedPrefix) &&
          /^[a-f0-9]{12}\.png$/.test(url.pathname.slice(expectedPrefix.length));
      } else {
        expectedImage = url.pathname === '/images/default-og.png';
      }
    } catch {
      /* Report the invalid URL below as well as its wrong namespace. */
    }
    if (!expectedImage)
      error(
        'Sharing image does not match the generated page namespace/slug/hash.',
      );

    try {
      const target = await resolveImage(root, image);
      referenced.add(target);
      let png = decoded.get(target);
      if (!png) {
        png = decodePng(target);
        decoded.set(target, png);
      }
      const bytes = await png;
      let art: SharingCard['art'] = {
        source: 'template',
        approval: 'not_configured',
        review: 'not_required',
      };
      if (contentRoute) {
        const approved = await readApprovedShareArt(
          {
            kind: contentRoute[1] as 'blog' | 'projects',
            slug: contentRoute[2]!,
          },
          options.authorRoot,
        );
        if (approved) {
          art = {
            source: 'ai',
            approval: 'confirmed',
            review: approved.status,
          };
          if (
            createHash('sha256').update(bytes).digest('hex') !==
            approved.manifest.image.sha256
          )
            error(
              'Generated PNG SHA256 differs from the approved final image.',
            );
          if (alt !== approved.manifest.alt)
            error('Sharing image alt differs from the approved description.');
          if (approved.status === 'needs_review')
            report.warnings.push(
              `${page}: 正文或关联文章变化，已确认配图需要复核；保留原图。`,
            );
        }
      }
      if (expectedImage)
        report.cards.push({
          art,
          page,
          title,
          description,
          image,
          alt,
          width: 1200,
          height: 630,
        });
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException)?.code;
      const reason = code
        ? `file unavailable (${code})`
        : cause instanceof Error
          ? cause.message
          : 'decode failed';
      error(`Sharing PNG is missing, unsafe, or invalid: ${reason}`);
    }

    const postings: Record<string, unknown>[] = [];
    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]',
    )) {
      try {
        postings.push(...blogPostings(JSON.parse(script.text)));
      } catch {
        error('JSON-LD cannot be parsed.');
      }
    }
    if (contentRoute?.[1] === 'blog' && postings.length !== 1)
      error('Article must contain exactly one BlogPosting JSON-LD.');
    for (const posting of postings)
      if (posting.image !== image)
        error(
          'BlogPosting.image must exactly match og:image, independently of the body cover.',
        );

    for (const platform of ['google', 'bing'] as const) {
      const elements = meta(document, verificationNames[platform]);
      const token = tokens[platform];
      if (
        token
          ? elements.length !== 1 ||
            elements[0]?.getAttribute('name') !== verificationNames[platform] ||
            elements[0]?.getAttribute('content') !== token
          : elements.length !== 0
      )
        error(
          `${verificationNames[platform]} must match configured verification exactly once, or be absent when unconfigured.`,
        );
    }
  }
  if (!htmlFiles.length) report.errors.push('生成产物没有 HTML 页面。');
  for (const file of files) {
    const label = relative(root, file).split(sep).join('/');
    if (/^og\/.*\.png$/i.test(label) && !referenced.has(file))
      report.errors.push(
        `${label}: unreferenced OG PNG may expose hidden content.`,
      );
    if (/\.(?:woff2?|ttf|otf|eot)$/i.test(label))
      report.errors.push(`${label}: font files must not be published.`);
    if (/(?:^|\/)(?:assets|reports)\/share-art(?:\/|$)/i.test(label))
      report.errors.push(
        `${label}: private share-art working resources must not be published.`,
      );
    if (/(?:^|\/)(?:sitemap[^/]*|rss|feed)\.xml$/i.test(label)) {
      const xml = await readFile(file, 'utf8');
      if (/\/og\//i.test(xml) || /\/og\//i.test(parse(xml).text))
        report.errors.push(
          `${label}: OG image URLs must not appear in sitemap XML or RSS.`,
        );
    }
  }
  report.errors = [...new Set(report.errors)];
  report.warnings = [...new Set(report.warnings)];
  return report;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export async function writeSharingReport(
  report: SharingAuditReport,
  directory = 'dist',
): Promise<void> {
  await writeReport('sharing', report);
  await appendFile(
    'reports/sharing.md',
    `\n## 搜索平台验证\n\n状态：${report.verification.status}。Google：${report.verification.configured.google ? '已配置' : '未配置'}；Bing：${report.verification.configured.bing ? '已配置' : '未配置'}。\n\n## 待完成的平台操作\n\n- 账号验证：${report.platformOperations.accountVerification}；需要在平台确认站点所有权。\n- Sitemap 提交：${report.platformOperations.sitemapSubmission}；需要在平台提交站点地图。\n- 收录检查：${report.platformOperations.indexingInspection}；需要在平台查看抓取和收录状态。\n\n本地静态检查无法判定这些平台操作是否已完成。\n`,
  );
  await appendFile(
    'reports/sharing.md',
    '\n## 配图来源与复核\n\n| 页面 | 来源 | 确认 | 复核 |\n| --- | --- | --- | --- |\n' +
      report.cards
        .map(
          (card) =>
            `| ${card.page} | ${card.art.source} | ${card.art.approval} | ${card.art.review} |`,
        )
        .join('\n') +
      '\n',
  );
  const cards: string[] = [];
  // Show the site's default once, alongside the distinct content cards.
  const previewCards = report.cards.filter(
    (card) => card.page === '/' || card.image.startsWith(site.url + '/og/'),
  );
  for (const card of previewCards) {
    try {
      const image = await resolveImage(resolve(directory), card.image);
      const bytes = await decodePng(image);
      cards.push(
        `<article><img width="1200" height="630" src="data:image/png;base64,${bytes.toString('base64')}" alt="${escapeHtml(card.alt)}"><div><h2>${escapeHtml(card.title)}</h2><p>${escapeHtml(card.description)}</p><p class="page">${escapeHtml(card.page)}</p><p class="page">${card.art.source === 'ai' ? '已确认配图' : '文字模板'} · ${card.art.review === 'needs_review' ? '来源已变化，需要复核' : card.art.approval === 'confirmed' ? '已确认，来源一致' : '尚未配置独立插画'}</p></div></article>`,
      );
    } catch {
      /* Error reports remain useful when a missing image cannot be previewed. */
    }
  }
  await mkdir('reports', { recursive: true });
  await writeFile(
    'reports/share-preview.html',
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>分享预览</title><style>body{font-family:system-ui,sans-serif;margin:0 auto;padding:32px;max-width:1100px;background:#f4f6fa;color:#192537}h1{margin-bottom:8px}.status{color:#536078}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px}article{overflow:hidden;border:1px solid #d8dfe8;border-radius:16px;background:white}img{display:block;width:100%;height:auto}article div{padding:18px}h2{font-size:20px;margin:0}p{line-height:1.6;overflow-wrap:anywhere}.page{color:#657089;font-size:14px}.errors{color:#9b2631}</style></head><body><h1>分享预览</h1><p class="status">检查 ${report.checked} 页；错误 ${report.errors.length}；搜索平台配置：${report.verification.status === 'configured' ? '已配置' : '未配置'}。</p><p>账号验证、Sitemap 提交与收录检查需到平台完成；本地检查未执行这些操作。</p>${report.errors.length ? `<section class="errors"><h2>检查错误</h2><ul>${report.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></section>` : ''}<main class="cards">${cards.join('') || '<p>没有可预览的有效分享图片。</p>'}</main></body></html>\n`,
  );
}
