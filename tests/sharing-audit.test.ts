import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { site } from '../src/config/site';
import { auditSharing, writeSharingReport } from '../scripts/sharing-audit';

const origin = site.url;
const cardPath = '/og/blog/a-note-012345abcdef.png';
const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

interface HtmlOptions {
  image?: string;
  twitter?: string;
  title?: string;
  description?: string;
  alt?: string;
  width?: string;
  height?: string;
  extra?: string;
  schema?: string;
}

function html({
  image = origin + '/images/default-og.png',
  twitter = image,
  title = 'Useful title',
  description = 'A useful and complete description.',
  alt = 'A useful title — sharing illustration',
  width = '1200',
  height = '630',
  extra = '',
  schema = '',
}: HtmlOptions = {}) {
  return `<!doctype html><html><head><title>${escape(title)}</title>
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${escape(image)}">
<meta name="twitter:image" content="${escape(twitter)}">
<meta property="og:image:width" content="${width}">
<meta property="og:image:height" content="${height}">
<meta property="og:image:alt" content="${escape(alt)}">
<meta name="twitter:image:alt" content="${escape(alt)}">
${extra}${schema}</head><body><img src="/body-cover.png" alt="Independent body cover"></body></html>`;
}

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(process.cwd(), '.tmp-sharing-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (path: string, contents: string | Buffer) => {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  };
  const png = async (
    path = 'images/default-og.png',
    width = 1200,
    height = 630,
  ) =>
    put(
      path,
      await sharp({
        create: { width, height, channels: 3, background: '#193047' },
      })
        .png()
        .toBuffer(),
    );
  await png();
  await put('index.html', html());
  return { root, put, png };
}

test('valid default sharing passes with unconfigured platform verification', async (t) => {
  const { root } = await fixture(t);
  const report = await auditSharing(root, {});
  assert.deepEqual(report.errors, []);
  assert.equal(report.checked, 1);
  assert.equal(report.verification.status, 'not_configured');
  assert.equal(report.platformOperations.accountVerification, 'not_performed');
  assert.equal(report.platformOperations.sitemapSubmission, 'not_performed');
  assert.equal(
    (report.platformOperations as Record<string, string>).indexingInspection,
    'not_performed',
  );
  assert.equal(report.cards[0]?.image, origin + '/images/default-og.png');
  assert.equal(report.cards[0]?.width, 1200);
});

test('metadata mismatch, duplicate tags, missing alt and wrong declared sizes fail', async (t) => {
  for (const options of [
    { twitter: origin + '/other.png' },
    {
      extra: `<meta property="og:image" content="${origin}/images/default-og.png">`,
    },
    {
      extra: `<meta name="twitter:image" content="${origin}/images/default-og.png">`,
    },
    { alt: '' },
    { alt: 'image' },
    { width: '600' },
    { height: '315' },
  ]) {
    const { root, put } = await fixture(t);
    await put('index.html', html(options));
    assert.ok(
      (await auditSharing(root, {})).errors.length > 0,
      JSON.stringify(options),
    );
  }
});

test('missing image metadata and undeclared dimensions fail', async (t) => {
  const { root, put } = await fixture(t);
  await put(
    'index.html',
    html().replace(
      /<meta (?:property="og:image"|name="twitter:image"|property="og:image:width"|property="og:image:height")[^>]*>/g,
      '',
    ),
  );
  const report = await auditSharing(root, {});
  assert.ok(report.errors.length >= 4);
});

test('OG and Twitter alt text must describe the same sharing image', async (t) => {
  const { root, put } = await fixture(t);
  await put(
    'index.html',
    html().replace(
      /<meta name="twitter:image:alt"[^>]+>/,
      '<meta name="twitter:image:alt" content="An unrelated project illustration">',
    ),
  );
  assert.match(
    (await auditSharing(root, {})).errors.join('\n'),
    /OG and Twitter image alt text must match/,
  );
});

test('metadata uses OG property attributes and Twitter/verification name attributes', async (t) => {
  const { root, put } = await fixture(t);
  for (const [before, after] of [
    ['property="og:image"', 'name="og:image"'],
    ['name="twitter:image"', 'property="twitter:image"'],
  ]) {
    await put('index.html', html().replace(before!, after!));
    assert.ok((await auditSharing(root, {})).errors.length > 0, after);
  }
  await put(
    'index.html',
    html({
      extra: '<meta property="google-site-verification" content="token">',
    }),
  );
  assert.ok((await auditSharing(root, { google: 'token' })).errors.length > 0);
});

test('missing, undecodable, and incorrectly sized PNGs are audit errors', async (t) => {
  for (const failure of ['missing', 'broken', 'size', 'truncated', 'jpeg']) {
    const { root, put, png } = await fixture(t);
    const file = join(root, 'images/default-og.png');
    if (failure === 'missing') await rm(file);
    if (failure === 'broken') await put('images/default-og.png', 'not a PNG');
    if (failure === 'size') await png('images/default-og.png', 600, 315);
    if (failure === 'truncated') {
      const bytes = await readFile(file);
      await put('images/default-og.png', bytes.subarray(0, 60));
    }
    if (failure === 'jpeg')
      await put(
        'images/default-og.png',
        await sharp({
          create: { width: 1200, height: 630, channels: 3, background: '#111' },
        })
          .jpeg()
          .toBuffer(),
      );
    const report = await auditSharing(root, {});
    assert.ok(report.errors.length > 0, failure);
    if (failure !== 'size') assert.equal(report.cards.length, 0, failure);
  }
});

test('articles require their own slug/hash card and matching BlogPosting image independent of body cover', async (t) => {
  const { root, put, png } = await fixture(t);
  await png(cardPath.slice(1));
  const image = origin + cardPath;
  const schema = (value: string) =>
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', image: value })}</script>`;
  await put('blog/a-note/index.html', html({ image, schema: schema(image) }));
  assert.deepEqual((await auditSharing(root, {})).errors, []);
  await put(
    'blog/a-note/index.html',
    html({ image, schema: schema(origin + '/body-cover.png') }),
  );
  assert.match((await auditSharing(root, {})).errors.join('\n'), /BlogPosting/);
  await put('blog/a-note/index.html', html({ image }));
  assert.match((await auditSharing(root, {})).errors.join('\n'), /BlogPosting/);
});

test('card namespaces are derived independently from generated page routes', async (t) => {
  for (const [route, path] of [
    ['projects/a-note/index.html', '/og/projects/a-note-012345abcdef.png'],
    ['blog/a-note/index.html', '/og/projects/a-note-012345abcdef.png'],
    ['blog/a-note/index.html', '/og/blog/another-note-012345abcdef.png'],
    ['blog/a-note/index.html', '/og/blog/a-note-short.png'],
    ['about/index.html', cardPath],
  ]) {
    const { root, put, png } = await fixture(t);
    await png(path.slice(1));
    const image = origin + path;
    const schema = `<script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', image })}</script>`;
    await put(
      route!,
      html({ image, schema: route!.startsWith('blog/') ? schema : '' }),
    );
    const report = await auditSharing(root, {});
    assert.equal(
      report.errors.length === 0,
      route!.startsWith('projects/') && path!.startsWith('/og/projects/'),
      `${route}: ${report.errors.join('\n')}`,
    );
  }
});

test('verification tokens must appear accurately once on every generated page', async (t) => {
  const { root, put } = await fixture(t);
  const tokens = { google: ' google-token ', bing: ' bing-token ' };
  const extra =
    '<meta name="google-site-verification" content="google-token"><meta name="msvalidate.01" content="bing-token">';
  await put('index.html', html({ extra }));
  const report = await auditSharing(root, tokens);
  assert.deepEqual(report.errors, []);
  assert.equal(report.verification.status, 'configured');
  assert.deepEqual(report.verification.configured, {
    google: true,
    bing: true,
  });
  for (const bad of [
    '',
    extra + extra,
    extra.replace('google-token', 'wrong-token'),
  ]) {
    await put('index.html', html({ extra: bad }));
    assert.ok((await auditSharing(root, tokens)).errors.length > 0);
  }
  await put('index.html', html({ extra }));
  assert.ok(
    (await auditSharing(root, {})).errors.length > 0,
    'unconfigured tags are stale configuration',
  );
  await put('index.html', html());
  assert.deepEqual(
    (await auditSharing(root, { google: ' ', bing: '' })).errors,
    [],
  );
});

test('orphan OG images, published fonts, and OG URLs in feeds or sitemaps fail', async (t) => {
  const { root, png, put } = await fixture(t);
  await png('og/blog/hidden-draft-012345abcdef.png');
  await put('assets/font.WOFF2', 'font');
  await put(
    'sitemap-0.xml',
    `<urlset><url><loc>${origin}${cardPath}</loc></url></urlset>`,
  );
  await put(
    'rss.xml',
    `<rss><channel><description>&lt;img src="${origin}${cardPath}"&gt;</description></channel></rss>`,
  );
  const errors = (await auditSharing(root, {})).errors.join('\n');
  assert.match(errors, /unreferenced|orphan|未引用/i);
  assert.match(errors, /font|字体/i);
  assert.match(errors, /sitemap-0.xml/);
  assert.match(errors, /rss.xml/);
});

test('external, relative, encoded traversal, and credential-bearing URLs are rejected safely', async (t) => {
  for (const image of [
    'https://other.example/images/default-og.png',
    '/images/default-og.png',
    origin + '/images/%2e%2e/%2e%2e/secret.png',
    origin + '/images/%2f..%2fsecret.png',
    origin.replace('https://', 'https://user:password@') +
      '/images/default-og.png',
    origin + '/images/default-og.png?unexpected=1',
  ]) {
    const { root, put } = await fixture(t);
    await put('index.html', html({ image }));
    const report = await auditSharing(root, {});
    assert.ok(report.errors.length > 0, image);
    assert.equal(report.cards.length, 0, image);
  }
});

test('a symlink directory cannot resolve an image outside the generated root', async (t) => {
  const { root, put } = await fixture(t);
  const outside = await fixture(t);
  await rm(join(root, 'images'), { recursive: true });
  try {
    await symlink(
      join(outside.root, 'images'),
      join(root, 'images'),
      'junction',
    );
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EPERM') {
      t.skip('Windows sandbox does not permit creation of junction fixtures.');
      return;
    }
    throw cause;
  }
  await put('index.html', html());
  const report = await auditSharing(root, {});
  assert.match(report.errors.join('\n'), /symlink|symbolic link/i);
  assert.equal(report.cards.length, 0);
});

test('offline preview escapes content, embeds decoded PNG data, and records deferred tasks', async (t) => {
  const { root, put } = await fixture(t);
  const title = '<script>alert("title")</script>';
  const description = '<img src=x onerror=alert(1)> & "description"';
  await put('index.html', html({ title, description }));
  const report = await auditSharing(root, {});
  assert.deepEqual(report.errors, []);
  const previousDirectory = process.cwd();
  try {
    process.chdir(root);
    await writeSharingReport(report, root);
  } finally {
    process.chdir(previousDirectory);
  }
  const preview = await readFile(
    join(root, 'reports/share-preview.html'),
    'utf8',
  );
  assert.ok(preview.includes('data:image/png;base64,'));
  assert.ok(preview.includes('&lt;script&gt;'));
  assert.ok(preview.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!preview.includes(title));
  assert.ok(!preview.includes('<img src=x'));
  const json = JSON.parse(
    await readFile(join(root, 'reports/sharing.json'), 'utf8'),
  );
  assert.equal(json.verification.status, 'not_configured');
  assert.equal(json.platformOperations.sitemapSubmission, 'not_performed');
  const markdown = await readFile(join(root, 'reports/sharing.md'), 'utf8');
  assert.ok(markdown.includes('not_configured'));
  assert.ok(markdown.includes('not_performed'));
});

test('missing image still writes a useful error report and omits invalid preview images', async (t) => {
  const { root } = await fixture(t);
  await rm(join(root, 'images/default-og.png'));
  const report = await auditSharing(root, {});
  const previousDirectory = process.cwd();
  const previousExitCode = process.exitCode;
  try {
    process.chdir(root);
    await writeSharingReport(report, root);
    assert.equal(process.exitCode, 1);
  } finally {
    process.chdir(previousDirectory);
    process.exitCode = previousExitCode;
  }
  const preview = await readFile(
    join(root, 'reports/share-preview.html'),
    'utf8',
  );
  assert.ok(!preview.includes('data:image/png;base64,'));
  assert.match(preview, /错误|error/i);
});
