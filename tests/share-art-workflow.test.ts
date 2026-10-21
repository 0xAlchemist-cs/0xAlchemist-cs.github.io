import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, type TestContext } from 'node:test';
import sharp from 'sharp';
import { site } from '../src/config/site';
import { readApprovedShareArt } from '../src/lib/share-art';
import {
  prepareShareArt,
  composeShareArt,
  approveShareArt,
  reviewShareArt,
} from '../scripts/share-art-workflow';
import {
  renderBoundedShareArtText,
  verifiedFont,
} from '../src/lib/render-social-card';

// Pango retains registered font files for this process. Keep fixture fonts alive
// until every rendering test is complete, then remove only the registered roots.
const renderingRoots: string[] = [];
after(async () => {
  for (const root of renderingRoots) {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('share-workflow-'));
    await rm(root, { recursive: true, force: true });
  }
});

const target = { kind: 'blog', slug: 'mixed' } as const;
const title = '中文 & <Astro> "exact" '.repeat(5).trim();
const source = `---\ntitle: '${title}'\ndescription: Synthetic fixture\nslug: mixed\npublishedAt: 2026-10-21\ncategory: Test\n---\n${'full text '.repeat(12000)}FULL_TEXT_TAIL`;
const layout = {
  version: 1,
  title: {
    left: 50,
    top: 30,
    width: 1000,
    height: 360,
    fontSize: 64,
    color: '#ffffff',
  },
  author: {
    left: 50,
    top: 540,
    width: 430,
    height: 50,
    fontSize: 28,
    color: '#ffffff',
  },
  site: {
    left: 650,
    top: 540,
    width: 500,
    height: 50,
    fontSize: 24,
    color: '#ffffff',
  },
};
async function exists(filename: string) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}
async function put(root: string, relative: string, value: string | Buffer) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
  return file;
}
async function fixture(_t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'share-workflow-'));
  renderingRoots.push(root);
  const content = await put(root, 'src/content/posts/post.mdx', source);
  await mkdir(path.join(root, 'assets/fonts'), { recursive: true });
  await copyFile(
    path.resolve('assets/fonts/NotoSansCJKsc-Regular.otf'),
    path.join(root, 'assets/fonts/NotoSansCJKsc-Regular.otf'),
  );
  const artwork = await put(
    root,
    'input/art.png',
    await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#173451' },
    })
      .png()
      .toBuffer(),
  );
  const brief = await put(
    root,
    'input/brief.md',
    '# Synthetic test brief\nNo generated model artwork or real author approval.\n',
  );
  const layoutFile = await put(
    root,
    'input/layout.json',
    JSON.stringify(layout),
  );
  const bundle = await prepareShareArt(
    target,
    'reports/share-art/blog/mixed/v1',
    root,
  );
  const options = {
    bundle,
    artwork,
    brief,
    layout: layoutFile,
    tool: 'test-fixture',
  };
  return {
    root,
    content,
    bundle,
    options,
    manifestPath: path.join(root, 'assets/share-art/blog/mixed/manifest.json'),
  };
}

test('approval requires an explicit nonblank confirmation before any file read or write', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'share-confirm-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    approveShareArt('reports/share-art/missing', '  ', root),
    /confirmation/i,
  );
  await assert.rejects(reviewShareArt(target, '', root), /confirmation/i);
  assert.equal(await exists(path.join(root, 'assets')), false);
});

test('prepare retains complete raw sources and brand without creating an approval or overwriting bundles', async (t) => {
  const f = await fixture(t);
  const input = await readFile(path.join(f.bundle, 'input.md'), 'utf8');
  assert.ok(input.includes(source));
  assert.ok(input.includes('FULL_TEXT_TAIL'));
  const snapshot = JSON.parse(
    await readFile(path.join(f.bundle, 'snapshot.json'), 'utf8'),
  );
  assert.equal(snapshot.title, title);
  assert.equal(snapshot.sources[0].text, undefined);
  assert.equal(snapshot.brand.author, site.author);
  assert.equal(await exists(f.manifestPath), false);
  assert.equal(await exists(path.dirname(f.manifestPath)), false);
  await assert.rejects(prepareShareArt(target, f.bundle, f.root), /exist/i);
  assert.equal(await readFile(path.join(f.bundle, 'input.md'), 'utf8'), input);
});

test('compose uses synthetic art and escaped full text, creates versioned previews and records no invented model or approval', async (t) => {
  const f = await fixture(t);
  const candidate = await composeShareArt(
    {
      ...f.options,
      alt: 'Synthetic blue field with accurate Chinese typography',
    },
    f.root,
  );
  const bytes = await readFile(path.join(candidate, 'final.png'));
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  const pixels = await sharp(bytes).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0, 3)], [23, 52, 81]);
  assert.ok(pixels.includes(255));
  const record = JSON.parse(
    await readFile(path.join(candidate, 'candidate.json'), 'utf8'),
  );
  assert.deepEqual(record.generator, { tool: 'test-fixture' });
  assert.equal(record.approval, undefined);
  assert.equal(
    record.alt,
    'Synthetic blue field with accurate Chinese typography',
  );
  assert.equal(record.title, title);
  assert.ok(
    (await readFile(path.join(candidate, record.artwork.file))).equals(
      await readFile(f.options.artwork),
    ),
    'candidate must retain the original artwork bytes for future design edits',
  );
  const second = await composeShareArt(f.options, f.root);
  assert.notEqual(second, candidate);
  assert.deepEqual(await readFile(path.join(candidate, 'final.png')), bytes);
  assert.equal(
    JSON.parse(await readFile(path.join(second, 'candidate.json'), 'utf8')).alt,
    `${title} — ${site.title}`,
  );
  assert.equal(await exists(f.manifestPath), false);
});

test('site caption renders the site hostname rather than repeating the site title', async (t) => {
  const f = await fixture(t);
  const candidate = await composeShareArt(f.options, f.root);
  const actual = await sharp(await readFile(path.join(candidate, 'final.png')))
    .extract({
      left: layout.site.left,
      top: layout.site.top,
      width: layout.site.width,
      height: layout.site.height,
    })
    .removeAlpha()
    .raw()
    .toBuffer();
  const expectedText = await renderBoundedShareArtText(
    new URL(site.url).hostname,
    layout.site,
    await verifiedFont(f.root),
  );
  const expected = await sharp({
    create: {
      width: layout.site.width,
      height: layout.site.height,
      channels: 3,
      background: '#173451',
    },
  })
    .composite([{ input: expectedText, left: 0, top: 0 }])
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.ok(
    actual.equals(expected),
    'the site caption must contain the actual site hostname',
  );
});

test('handwritten title font is selectable and changes the candidate artwork', async (t) => {
  const f = await fixture(t);
  const ordinary = await composeShareArt(f.options, f.root);
  const fontDirectory = path.join(f.root, 'assets/fonts/lxgw-wenkai');
  await mkdir(fontDirectory, { recursive: true });
  await copyFile(
    path.resolve('assets/fonts/lxgw-wenkai/LXGWWenKai-Regular.ttf'),
    path.join(fontDirectory, 'LXGWWenKai-Regular.ttf'),
  );
  await writeFile(
    f.options.layout,
    JSON.stringify({ ...layout, title: { ...layout.title, font: 'wenkai' } }),
  );
  const handwritten = await composeShareArt(f.options, f.root);
  assert.equal(
    (await readFile(path.join(ordinary, 'final.png'))).equals(
      await readFile(path.join(handwritten, 'final.png')),
    ),
    false,
  );
  // Pango keeps successfully registered font files open on Windows. Exercise
  // missing and corrupt font checks in a separate root, before registration.
  const invalid = await fixture(t);
  await writeFile(
    invalid.options.layout,
    JSON.stringify({ ...layout, title: { ...layout.title, font: 'wenkai' } }),
  );
  await assert.rejects(
    composeShareArt(invalid.options, invalid.root),
    /font.*missing/i,
  );
  await put(
    invalid.root,
    'assets/fonts/lxgw-wenkai/LXGWWenKai-Regular.ttf',
    'corrupt font',
  );
  await assert.rejects(
    composeShareArt(invalid.options, invalid.root),
    /font.*SHA256/i,
  );
});

test('approval publishes exact candidate bytes, preserves prior assets, and source review leaves all artwork bytes unchanged', async (t) => {
  const f = await fixture(t);
  const first = await composeShareArt(f.options, f.root);
  const bytes = await readFile(path.join(first, 'final.png'));
  const manifest = await approveShareArt(
    first,
    'Synthetic test author confirms final fixture PNG',
    f.root,
  );
  const approved = await readApprovedShareArt(target, f.root);
  assert.deepEqual(approved?.png, bytes);
  assert.equal(approved?.status, 'current');
  assert.equal(manifest.approval.confirmed, true);
  const oldFinal = path.join(path.dirname(f.manifestPath), manifest.image.file);
  await writeFile(
    f.options.artwork,
    await sharp({
      create: { width: 700, height: 500, channels: 3, background: '#492837' },
    })
      .png()
      .toBuffer(),
  );
  const second = await composeShareArt(f.options, f.root);
  const next = await approveShareArt(
    second,
    'Synthetic fixture replacement confirmation',
    f.root,
  );
  assert.notEqual(next.image.file, manifest.image.file);
  assert.deepEqual(await readFile(oldFinal), bytes);
  const nextBytes = await readFile(path.join(second, 'final.png'));
  await writeFile(f.content, source + '\nContent changed after approval.');
  assert.equal(
    (await readApprovedShareArt(target, f.root))?.status,
    'needs_review',
  );
  const reviewed = await reviewShareArt(
    target,
    'Synthetic source review: keep exact approved fixture',
    f.root,
  );
  assert.notEqual(reviewed.sourceDigest, next.sourceDigest);
  assert.deepEqual(reviewed.image, next.image);
  assert.deepEqual(reviewed.artwork, next.artwork);
  assert.equal((await readApprovedShareArt(target, f.root))?.status, 'current');
  assert.deepEqual(
    (await readApprovedShareArt(target, f.root))?.png,
    nextBytes,
  );
  assert.deepEqual(await readFile(oldFinal), bytes);
});

test('stale candidates and stale bundles cannot be approved or composed', async (t) => {
  const f = await fixture(t);
  const candidate = await composeShareArt(f.options, f.root);
  await writeFile(f.content, source + '\nChanged before approval');
  await assert.rejects(
    approveShareArt(candidate, 'Synthetic confirmation', f.root),
    /stale|source.*chang/i,
  );
  await assert.rejects(
    composeShareArt(f.options, f.root),
    /stale|source.*chang/i,
  );
  assert.equal(await exists(f.manifestPath), false);
});

test('approval rejects every tampered candidate asset and a mismatched target without replacing existing approval', async (t) => {
  const f = await fixture(t);
  const candidate = await composeShareArt(f.options, f.root);
  await approveShareArt(candidate, 'Synthetic fixture approval', f.root);
  const before = await readFile(f.manifestPath);
  for (const leaf of ['final.png', 'artwork.png', 'brief.md', 'layout.json']) {
    const file = path.join(candidate, leaf);
    const original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from('tampered')]));
    await assert.rejects(
      approveShareArt(candidate, 'Synthetic confirmation', f.root),
      /SHA256|digest/i,
    );
    await writeFile(file, original);
  }
  const recordFile = path.join(candidate, 'candidate.json');
  const record = JSON.parse(await readFile(recordFile, 'utf8'));
  record.target.slug = 'other';
  await writeFile(recordFile, JSON.stringify(record));
  await assert.rejects(
    approveShareArt(candidate, 'Synthetic confirmation', f.root),
    /target|Unknown.*slug/i,
  );
  assert.deepEqual(await readFile(f.manifestPath), before);
});

test('invalid layouts and altered brand snapshots fail instead of silently changing typography', async (t) => {
  const f = await fixture(t);
  for (const invalid of [
    { ...layout, title: { ...layout.title, left: 1190 } },
    { ...layout, title: { ...layout.title, fontSize: 0 } },
    { ...layout, title: { ...layout.title, color: 'red' } },
    {
      ...layout,
      title: { ...layout.title, text: 'user supplied replacement' },
    },
    { ...layout, version: 2 },
  ]) {
    await writeFile(f.options.layout, JSON.stringify(invalid));
    await assert.rejects(composeShareArt(f.options, f.root));
  }
  await writeFile(f.options.layout, JSON.stringify(layout));
  const snapshotFile = path.join(f.bundle, 'snapshot.json');
  const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
  snapshot.brand.author = 'Altered author';
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  await assert.rejects(composeShareArt(f.options, f.root), /brand/i);
});

test('writers reject traversal, out-of-bound paths and directory junctions', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    prepareShareArt(target, 'reports/share-art/../escape', f.root),
    /unsafe|outside|travers/i,
  );
  await assert.rejects(
    prepareShareArt(target, 'public/bundle', f.root),
    /outside|reports/i,
  );
  await assert.rejects(
    composeShareArt(
      { ...f.options, bundle: 'reports/share-art/../escape' },
      f.root,
    ),
  );
  await assert.rejects(
    approveShareArt(
      'reports/share-art/../escape',
      'Synthetic confirmation',
      f.root,
    ),
  );
  const external = await mkdtemp(path.join(tmpdir(), 'share-outside-'));
  t.after(() => rm(external, { recursive: true, force: true }));
  await symlink(
    external,
    path.join(f.root, 'reports/share-art/linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    prepareShareArt(target, 'reports/share-art/linked/new', f.root),
    /link/i,
  );
  await mkdir(path.join(f.root, 'assets/share-art/blog'), { recursive: true });
  await symlink(
    external,
    path.join(f.root, 'assets/share-art/blog/mixed'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const candidate = await composeShareArt(f.options, f.root);
  await assert.rejects(
    approveShareArt(candidate, 'Synthetic confirmation', f.root),
    /link/i,
  );
  await assert.rejects(
    reviewShareArt(target, 'Synthetic confirmation', f.root),
    /link/i,
  );
  assert.equal(await exists(path.join(external, 'manifest.json')), false);
});
