import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  readArtSources,
  type ShareArtTarget,
  type ShareArtManifest,
} from '../../src/lib/share-art';

export const artFixtureTitle =
  'Synthetic article with approved geometric artwork';
export const artFixtureAlt = `${artFixtureTitle} — a synthetic blue geometric fixture`;
export const privateArtCanary = 'SHARE_ART_PRIVATE_CANARY_20261021';
export const artHash = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');

export async function putArtFixture(
  root: string,
  file: string,
  bytes: Buffer | string,
) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return target;
}

export async function approvedArtFixture(
  root: string,
  target: ShareArtTarget = { kind: 'blog', slug: 'a-note' },
) {
  await mkdir(path.join(root, 'src/content/posts'), { recursive: true });
  const source =
    target.kind === 'blog'
      ? `---\ntitle: '${artFixtureTitle}'\ndescription: 'Synthetic description for integration testing.'\nslug: ${target.slug}\npublishedAt: '2026-10-21'\ncategory: Test\n---\nSynthetic source only.\n`
      : `---\ndisplayName: '${artFixtureTitle}'\nsummary: 'Synthetic project for integration testing.'\nslug: ${target.slug}\nrepoFullName: test-owner/test-repo\n---\nSynthetic source only.\n`;
  const sourceFile = await putArtFixture(
    root,
    `src/content/${target.kind === 'blog' ? 'posts' : 'projects'}/fixture.md`,
    source,
  );
  return {
    ...(await writeApprovedArtFixture(root, target)),
    sourceFile,
    readSource: () => readFile(sourceFile, 'utf8'),
  };
}

export async function writeApprovedArtFixture(
  root: string,
  target: ShareArtTarget,
) {
  const snapshot = await readArtSources(target, root);
  const image = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: '#375c92' },
  })
    .png()
    .toBuffer();
  const directory = `assets/share-art/${target.kind}/${target.slug}`;
  const values = {
    image: ['final.png', image],
    artwork: ['artwork.png', image],
    brief: ['brief.md', privateArtCanary],
    layout: ['layout.json', '{"version":1,"fixture":true}'],
  } as const;
  const files = {} as Pick<
    ShareArtManifest,
    'image' | 'artwork' | 'brief' | 'layout'
  >;
  for (const key of ['image', 'artwork', 'brief', 'layout'] as const) {
    const [file, bytes] = values[key];
    await putArtFixture(root, `${directory}/${file}`, bytes);
    files[key] = { file, sha256: artHash(bytes) };
  }
  const manifest: ShareArtManifest = {
    version: 1,
    target,
    sources: snapshot.sources.map(({ path, sha256 }) => ({ path, sha256 })),
    sourceDigest: snapshot.sourceDigest,
    ...files,
    alt: `${snapshot.title} — a synthetic blue geometric fixture`,
    generator: { tool: 'test-fixture' },
    approval: {
      confirmed: true,
      record: 'Synthetic fixture only; no real model call or author approval.',
    },
  };
  const save = () =>
    putArtFixture(root, `${directory}/manifest.json`, JSON.stringify(manifest));
  await save();
  return { image, manifest, directory, save };
}
