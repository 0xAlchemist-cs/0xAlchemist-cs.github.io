import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { site } from '../src/config/site';
import {
  defaultSocialImage,
  postCard,
  projectCard,
} from '../src/lib/social-card';
import {
  layoutSocialCardTitle,
  renderSocialCard,
} from '../src/lib/render-social-card';

const post = {
  slug: 'mixed-title',
  title: '中文与 Astro practical notes',
  category: '工程实践',
  tags: ['Astro', '中文', 'Web', 'ignored'],
};

test('post cards preserve titles and expose deterministic versioned image URLs', () => {
  const card = postCard(post);
  assert.deepEqual(card, postCard({ ...post }));
  assert.match(card.image.src, /^\/og\/blog\/mixed-title-[a-f0-9]{12}\.png$/);
  assert.equal(card.image.width, 1200);
  assert.equal(card.image.height, 630);
  assert.ok(card.image.alt.includes(post.title));
  assert.equal(card.title, post.title);
  assert.deepEqual(card.tags, ['Astro', '中文', 'Web']);
  assert.equal(card.label, post.category);
  assert.equal(card.author, site.author);
  assert.equal(card.siteTitle, site.title);
  assert.equal(card.siteHost, new URL(site.url).hostname);
  assert.ok(card.templateVersion);
  assert.ok(card.fontVersion);
});

test('every edited rendered content field invalidates the image URL', () => {
  const before = postCard(post).image.src;
  for (const change of [
    { title: '新的标题' },
    { category: '思考' },
    { tags: ['changed'] },
  ]) {
    assert.notEqual(postCard({ ...post, ...change }).image.src, before);
  }
  assert.equal(
    postCard({ ...post, tags: [...post.tags.slice(0, 3), 'not rendered'] })
      .image.src,
    before,
  );
});

test('projects use their own namespace and tech tags, including empty lists', () => {
  const card = projectCard({
    slug: post.slug,
    displayName: post.title,
    techStack: [],
  });
  assert.match(
    card.image.src,
    /^\/og\/projects\/mixed-title-[a-f0-9]{12}\.png$/,
  );
  assert.notEqual(card.image.src, postCard(post).image.src);
  assert.equal(card.kind, 'projects');
  assert.equal(card.title, post.title);
  assert.deepEqual(card.tags, []);
  assert.deepEqual(
    projectCard({
      slug: 'project',
      displayName: 'A',
      techStack: ['a', 'b', 'c', 'd'],
    }).tags,
    ['a', 'b', 'c'],
  );
  assert.equal(defaultSocialImage.src, '/images/default-og.png');
  assert.equal(defaultSocialImage.width, 1200);
  assert.equal(defaultSocialImage.height, 630);
  assert.ok(defaultSocialImage.alt.includes(site.title));
});

test('mixed CJK/Latin title wrapping uses actual font width and ellipsises after shrinking', async () => {
  const short = await layoutSocialCardTitle('中文与 Astro practical notes');
  assert.equal(short.lines.join(''), '中文与 Astro practical notes');
  const long = await layoutSocialCardTitle(
    '中文与UnbrokenLatinWord<&> '.repeat(45),
  );
  assert.ok(long.fontSize < short.fontSize);
  assert.ok(long.lines.length <= 3);
  assert.ok(long.lines.at(-1)?.endsWith('…'));
  for (const line of long.lines) {
    const text = line
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const { info } = await sharp({
      text: {
        text,
        font: `Noto Sans CJK SC ${long.fontSize}`,
        fontfile: path.resolve('assets/fonts/NotoSansCJKsc-Regular.otf'),
        rgba: true,
        dpi: 72,
      },
    })
      .png()
      .toBuffer({ resolveWithObject: true });
    assert.ok(info.width <= 1024, `${line}: ${info.width}px`);
  }
});

test('special markup titles and empty tags render a real 1200 × 630 PNG', async () => {
  const card = postCard({
    slug: 'escaped',
    title: '<span foreground="red">中文 & "Astro"</span> '.repeat(8),
    category: '<工程 & 实践>',
    tags: [],
  });
  const png = await renderSocialCard(card);
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [247, 248, 252]);
  const pixel = (x: number, y: number) => [
    ...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3),
  ];
  assert.deepEqual(pixel(60, 60), [255, 255, 255]);
  assert.deepEqual(pixel(90, 68), [51, 93, 221]);
});

test('missing or corrupt local fonts fail rendering even after a successful render', async () => {
  const root = process.cwd();
  const temporary = await mkdtemp(path.join(tmpdir(), 'social-font-'));
  try {
    process.chdir(temporary);
    await assert.rejects(
      renderSocialCard(postCard(post)),
      /social.card font.*missing/i,
    );
    await mkdir(path.join(temporary, 'assets/fonts'), { recursive: true });
    await writeFile(
      path.join(temporary, 'assets/fonts/NotoSansCJKsc-Regular.otf'),
      'corrupt font',
    );
    await assert.rejects(
      renderSocialCard(postCard(post)),
      /social.card font.*SHA256 mismatch/i,
    );
  } finally {
    process.chdir(root);
    await rm(temporary, { recursive: true, force: true });
  }
});
