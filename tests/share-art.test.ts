import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import sharp from 'sharp';
import {
  readApprovedShareArt,
  readArtSources,
  safeArtFile,
  shareArtManifestSchema,
  sourceDigest,
  type ShareArtManifest,
} from '../src/lib/share-art';

const target = { kind: 'projects', slug: 'shared' } as const;
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const post = (slug: string, related = '[]', body = 'body') =>
  `---\ntitle: ${slug} title\ndescription: A test article\nslug: ${slug}\npublishedAt: 2026-10-21\ncategory: Test\nrelatedRepos: ${related}\n---\n${body}`;
const project =
  '---\nslug: shared\nrepoFullName: Owner/Repo\ndisplayName: Test project\nsummary: Synthetic source fixture\nrelatedPosts: [explicit]\n---\nProject raw body';

async function put(root: string, relative: string, value: string | Buffer) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, value);
  return filename;
}

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'share-art-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await put(root, 'src/content/projects/nested/project.mdx', project);
  await put(root, 'src/content/posts/other-name.md', post('shared'));
  await put(
    root,
    'src/content/posts/nested/explicit.mdx',
    post('explicit', '[]', `${'long source text '.repeat(6000)}FULL_TEXT_TAIL`),
  );
  await put(
    root,
    'src/content/posts/nested/repository.md',
    post('repository', '[owner/rEpO]'),
  );
  return root;
}

async function approvedFixture(t: TestContext) {
  const root = await fixture(t);
  const snapshot = await readArtSources(target, root);
  const directory = 'assets/share-art/projects/shared';
  const png = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: '#213141' },
  })
    .png()
    .toBuffer();
  const files = {
    image: ['final.png', png],
    artwork: ['art.png', png],
    brief: ['brief.md', 'Synthetic test fixture; no model invocation.'],
    layout: ['layout.json', '{"fixture":true}'],
  } as const;
  const records = {} as Pick<
    ShareArtManifest,
    'image' | 'artwork' | 'brief' | 'layout'
  >;
  for (const key of ['image', 'artwork', 'brief', 'layout'] as const) {
    const [file, bytes] = files[key];
    await put(root, `${directory}/${file}`, bytes);
    records[key] = { file, sha256: hash(bytes) };
  }
  const manifest: ShareArtManifest = {
    version: 1,
    target,
    sources: snapshot.sources.map(({ path, sha256 }) => ({ path, sha256 })),
    sourceDigest: snapshot.sourceDigest,
    ...records,
    alt: 'Synthetic geometric test fixture',
    generator: { tool: 'test-fixture' },
    approval: {
      confirmed: true,
      record: 'Synthetic fixture approval only; no real artwork.',
    },
  };
  const save = () =>
    put(root, `${directory}/manifest.json`, JSON.stringify(manifest));
  await save();
  return { root, directory, png, manifest, save };
}

test('reader rejects non-content provenance even when its aggregate digest matches', async (t) => {
  const f = await approvedFixture(t);
  for (const invalid of [
    'README.md',
    'src/config/site.ts',
    'src/content/posts/article.txt',
  ]) {
    f.manifest.sources = [{ path: invalid, sha256: 'a'.repeat(64) }];
    f.manifest.sourceDigest = hash(JSON.stringify(f.manifest.sources));
    await f.save();
    await assert.rejects(
      readApprovedShareArt(target, f.root),
      /source|path|content|Markdown/i,
    );
  }
});

test('source snapshots resolve frontmatter slugs and include full project dependencies and raw text', async (t) => {
  const root = await fixture(t);
  const snapshot = await readArtSources(target, root);
  assert.equal(snapshot.title, 'Test project');
  assert.deepEqual(
    snapshot.sources.map((s) => s.path),
    [
      'src/content/posts/nested/explicit.mdx',
      'src/content/posts/nested/repository.md',
      'src/content/projects/nested/project.mdx',
    ],
  );
  assert.equal(
    snapshot.sources.some((s) => s.text.endsWith('FULL_TEXT_TAIL')),
    true,
  );
  assert.equal(
    snapshot.sources.find((s) => s.path.endsWith('project.mdx'))?.text,
    project,
  );
  const article = snapshot.sources.find((s) =>
    s.path.endsWith('explicit.mdx'),
  )!;
  assert.ok(article.text.startsWith('---\ntitle: explicit title\n'));
  assert.equal(article.sha256, hash(article.text));
  const blog = await readArtSources({ kind: 'blog', slug: 'shared' }, root);
  assert.equal(blog.title, 'shared title');
  assert.deepEqual(
    blog.sources.map((s) => s.path),
    ['src/content/posts/other-name.md'],
  );
});

test('source digests normalize CRLF but include linked article and frontmatter edits', async (t) => {
  const root = await fixture(t);
  const lf = await readArtSources(target, root);
  for (const source of lf.sources)
    await put(root, source.path, source.text.replaceAll('\n', '\r\n'));
  const crlf = await readArtSources(target, root);
  assert.equal(lf.sourceDigest, crlf.sourceDigest);
  assert.ok(crlf.sources.every((s) => !s.text.includes('\r\n')));
  await put(
    root,
    'src/content/posts/nested/repository.md',
    post('repository', '[owner/repo]', 'edited dependency'),
  );
  assert.notEqual(
    lf.sourceDigest,
    (await readArtSources(target, root)).sourceDigest,
  );
  await put(
    root,
    'src/content/posts/other-name.md',
    post('shared').replace('shared title', 'changed title'),
  );
  const blog = await readArtSources({ kind: 'blog', slug: 'shared' }, root);
  assert.equal(blog.title, 'changed title');
  assert.notEqual(blog.sources[0]!.sha256, hash(post('shared')));
});

test('digest hashes canonical sorted path/digest JSON and rejects duplicate or unsafe records', () => {
  const a = { path: 'src/content/posts/a.md', sha256: 'a'.repeat(64) };
  const b = { path: 'src/content/posts/b.md', sha256: 'b'.repeat(64) };
  assert.equal(sourceDigest([b, a]), hash(JSON.stringify([a, b])));
  assert.equal(
    sourceDigest([{ sha256: a.sha256, path: a.path }]),
    hash(JSON.stringify([a])),
  );
  assert.throws(() => sourceDigest([a, a]));
  assert.throws(() =>
    sourceDigest([a, { ...a, path: 'src/content/posts/A.md' }]),
  );
  for (const unsafe of [
    '../a',
    '/a',
    'C:/a',
    'src\\a',
    'src/../a',
    'src//a',
    'src/./a',
    'src/a.',
    'src/a:ads',
    'src/CON.md',
  ])
    assert.throws(() => sourceDigest([{ ...a, path: unsafe }]), unsafe);
  assert.throws(() => sourceDigest([{ ...a, sha256: 'invalid' }]));
});

test('digest accepts full source snapshots but hashes only path and SHA256 records', () => {
  const source = {
    path: 'src/content/posts/a.md',
    sha256: 'a'.repeat(64),
    text: 'complete raw source',
  };
  assert.equal(
    sourceDigest([source]),
    hash(
      JSON.stringify([
        { path: 'src/content/posts/a.md', sha256: 'a'.repeat(64) },
      ]),
    ),
  );
});

test('missing, duplicate and invalid content targets fail explicitly', async (t) => {
  const root = await fixture(t);
  await assert.rejects(() =>
    readArtSources({ kind: 'blog', slug: 'missing' }, root),
  );
  await put(root, 'src/content/posts/duplicate.md', post('shared'));
  await assert.rejects(
    () => readArtSources({ kind: 'blog', slug: 'shared' }, root),
    /duplicate/i,
  );
  for (const slug of ['../escape', 'UPPER', 'a/b'])
    await assert.rejects(() =>
      readApprovedShareArt({ kind: 'blog', slug }, root),
    );
  await assert.rejects(() =>
    readArtSources({ kind: 'invalid', slug: 'shared' } as never, root),
  );
  await put(root, 'src/content/projects/duplicate.mdx', project);
  await rm(path.join(root, 'src/content/posts/duplicate.md'));
  await assert.rejects(() => readArtSources(target, root), /duplicate/i);
});

test('invalid YAML and schema-invalid authored metadata fail instead of being omitted', async (t) => {
  const root = await fixture(t);
  await put(
    root,
    'src/content/posts/bad.md',
    '---\ntitle: duplicate\ntitle: bad\n---\n',
  );
  await assert.rejects(() => readArtSources(target, root));
  await put(
    root,
    'src/content/posts/bad.md',
    post('valid').replace('category: Test\n', ''),
  );
  await assert.rejects(() => readArtSources(target, root));
});

test('only absent manifests fall back; approved assets retain exact bytes and expose stale source status', async (t) => {
  const root = await fixture(t);
  assert.equal(await readApprovedShareArt(target, root), null);
  const fixtureArt = await approvedFixture(t);
  const approved = await readApprovedShareArt(target, fixtureArt.root);
  assert.equal(approved?.status, 'current');
  assert.deepEqual(approved?.png, fixtureArt.png);
  assert.equal(approved?.currentSourceDigest, fixtureArt.manifest.sourceDigest);
  await put(
    fixtureArt.root,
    'src/content/posts/nested/repository.md',
    post('repository', '[owner/repo]', 'new revision'),
  );
  const stale = await readApprovedShareArt(target, fixtureArt.root);
  assert.equal(stale?.status, 'needs_review');
  assert.notEqual(stale?.currentSourceDigest, fixtureArt.manifest.sourceDigest);
  assert.deepEqual(stale?.png, fixtureArt.png);
});

test('strict versioned manifests reject invalid approval, alt, target, hashes and unknown keys', async (t) => {
  const { root, manifest, save } = await approvedFixture(t);
  for (const change of [
    { version: 2 },
    { target: { kind: 'blog', slug: 'shared' } },
    { sourceDigest: 'f'.repeat(64) },
    { sources: [...manifest.sources, manifest.sources[0]] },
    { sources: [{ path: '../outside.md', sha256: 'a'.repeat(64) }] },
    { approval: { confirmed: false, record: 'no' } },
    { approval: { confirmed: true, record: '  ' } },
    { alt: '  ' },
    { unexpected: true },
    { generator: { tool: 'test-fixture', unknown: true } },
    { image: { ...manifest.image, sha256: 'bad' } },
    { layout: { ...manifest.layout, file: '../layout.json' } },
  ]) {
    await put(
      root,
      'assets/share-art/projects/shared/manifest.json',
      JSON.stringify({ ...manifest, ...change }),
    );
    await assert.rejects(
      () => readApprovedShareArt(target, root),
      JSON.stringify(change),
    );
  }
  assert.equal(shareArtManifestSchema.safeParse(manifest).success, true);
  await save();
  await put(
    root,
    'assets/share-art/projects/shared/manifest.json',
    '{broken json',
  );
  await assert.rejects(() => readApprovedShareArt(target, root));
});

for (const key of ['image', 'artwork', 'brief', 'layout'] as const) {
  test(`approved ${key} must exist and match its SHA256`, async (t) => {
    const art = await approvedFixture(t);
    const relative = `${art.directory}/${art.manifest[key].file}`;
    await put(art.root, relative, 'corrupt bytes');
    await assert.rejects(
      () => readApprovedShareArt(target, art.root),
      /sha256|digest|hash/i,
    );
    await rm(path.join(art.root, relative));
    await assert.rejects(() => readApprovedShareArt(target, art.root));
  });
}

test('final image must be a fully decodable PNG of exactly 1200 by 630', async (t) => {
  const art = await approvedFixture(t);
  const wrongSize = await sharp({
    create: { width: 1200, height: 629, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  const jpeg = await sharp(art.png).jpeg().toBuffer();
  // Preserve the PNG header/dimensions while corrupting its compressed pixel stream.
  const corrupt = Buffer.from(art.png);
  const idat = corrupt.indexOf('IDAT');
  corrupt.fill(0, idat + 4, idat + 20);
  for (const bytes of [wrongSize, jpeg, corrupt, art.png.subarray(0, 40)]) {
    await put(art.root, `${art.directory}/final.png`, bytes);
    art.manifest.image.sha256 = hash(bytes);
    await art.save();
    await assert.rejects(() => readApprovedShareArt(target, art.root));
  }
});

test('safeArtFile constrains the directory and filename on Windows and POSIX', async (t) => {
  const root = await fixture(t);
  await put(root, 'assets/share-art/test.txt', 'local');
  assert.equal(
    await safeArtFile(root, 'assets/share-art', 'test.txt'),
    path.join(root, 'assets/share-art/test.txt'),
  );
  for (const filename of [
    '../test.txt',
    '..',
    '.',
    '/test.txt',
    'C:\\test.txt',
    'a/b',
    'a\\b',
    'CON',
    'name.',
    'name:ads',
    'name ',
  ])
    await assert.rejects(
      () => safeArtFile(root, 'assets/share-art', filename),
      filename,
    );
  for (const directory of [
    '../outside',
    path.dirname(root),
    'assets/../src',
    'assets\\..\\src',
  ])
    await assert.rejects(
      () => safeArtFile(root, directory, 'test.txt'),
      directory,
    );
});

test('source walking and asset resolution reject linked directories without following them', async (t) => {
  const root = await fixture(t);
  const outside = await mkdtemp(path.join(tmpdir(), 'share-art-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await put(outside, 'escape.md', post('escape'));
  await symlink(
    outside,
    path.join(root, 'src/content/posts/linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    () => readArtSources(target, root),
    /symlink|symbolic|link/i,
  );
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await symlink(
    outside,
    path.join(root, 'assets/share-art'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    () => safeArtFile(root, 'assets/share-art', 'escape.md'),
    /symlink|symbolic|link/i,
  );
  await assert.rejects(
    () => readApprovedShareArt(target, root),
    /symlink|symbolic|link/i,
  );
  const linkedRoot = path.join(outside, 'linked-root');
  await symlink(
    root,
    linkedRoot,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    () => safeArtFile(linkedRoot, 'src/content/posts', 'other-name.md'),
    /symlink|symbolic|link/i,
  );
});

test('manifest and final file symlinks fail even when their content and hashes are valid', async (t) => {
  const art = await approvedFixture(t);
  const final = path.join(art.root, art.directory, 'final.png');
  const outside = await put(art.root, 'outside.png', art.png);
  await rm(final);
  try {
    await symlink(outside, final, 'file');
  } catch (error) {
    if (
      process.platform === 'win32' &&
      (error as NodeJS.ErrnoException).code === 'EPERM'
    ) {
      t.skip(
        'Windows account lacks file-symlink privilege; junction tests execute separately.',
      );
      return;
    }
    throw error;
  }
  await assert.rejects(
    () => readApprovedShareArt(target, art.root),
    /symlink|symbolic|link/i,
  );
  await rm(final);
  await writeFile(final, art.png);
  const manifestFile = path.join(art.root, art.directory, 'manifest.json');
  const original = await readFile(manifestFile);
  await put(art.root, 'outside.json', original);
  await rm(manifestFile);
  await symlink(path.join(art.root, 'outside.json'), manifestFile, 'file');
  await assert.rejects(
    () => readApprovedShareArt(target, art.root),
    /symlink|symbolic|link/i,
  );
});

test('manifest and final asset leaf junctions fail instead of falling back or reading through links', async (t) => {
  const art = await approvedFixture(t);
  const linkedDirectory = path.join(art.root, 'linked-directory');
  await mkdir(linkedDirectory);
  const final = path.join(art.root, art.directory, 'final.png');
  await rm(final);
  await symlink(
    linkedDirectory,
    final,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    () => readApprovedShareArt(target, art.root),
    /symlink|symbolic|link/i,
  );
  await rm(final);
  await writeFile(final, art.png);
  const manifest = path.join(art.root, art.directory, 'manifest.json');
  await rm(manifest);
  await symlink(
    linkedDirectory,
    manifest,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    () => readApprovedShareArt(target, art.root),
    /symlink|symbolic|link/i,
  );
});
