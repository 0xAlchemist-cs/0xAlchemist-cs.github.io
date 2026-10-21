import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import sharp from 'sharp';
import {
  postCard,
  projectCard,
  resolveSocialCard,
} from '../src/lib/social-card';
import { auditSharing } from '../scripts/sharing-audit';
import { site } from '../src/config/site';
import {
  approvedArtFixture,
  artFixtureTitle,
  artFixtureAlt,
  artHash,
  putArtFixture,
} from './fixtures/share-art';

async function temporary(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'art-integration-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('art-integration-'));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
const template = () =>
  postCard({
    slug: 'a-note',
    title: artFixtureTitle,
    category: 'Test',
    tags: [],
  });
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
async function generatedPage(root: string, bytes: Buffer) {
  const card = await resolveSocialCard(template(), root);
  const image = site.url + card.image.src;
  const html = `<html><head><title>${artFixtureTitle}</title><meta property="og:title" content="${artFixtureTitle}"><meta property="og:description" content="Useful synthetic description for this integration page."><meta property="og:image" content="${image}"><meta name="twitter:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escape(card.image.alt)}"><meta name="twitter:image:alt" content="${escape(card.image.alt)}"><script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', image })}</script></head><body></body></html>`;
  await putArtFixture(root, 'dist/blog/a-note/index.html', html);
  await putArtFixture(root, 'dist' + card.image.src, bytes);
  return path.join(root, 'dist');
}

test('unconfigured content keeps its original template card', async (t) => {
  const root = await temporary(t);
  assert.deepEqual(await resolveSocialCard(template(), root), template());
});

test('approved final bytes and alt are selected with a stable distinct URL', async (t) => {
  const root = await temporary(t);
  const fixture = await approvedArtFixture(root);
  const card = await resolveSocialCard(template(), root);
  assert.notEqual(card.image.src, template().image.src);
  assert.equal(card.image.alt, artFixtureAlt);
  assert.ok(card.approvedArt?.png.equals(fixture.image));
  assert.equal(card.approvedArt?.status, 'current');
  assert.equal(
    (await resolveSocialCard(template(), root)).image.src,
    card.image.src,
  );
  await writeFile(
    fixture.sourceFile,
    (await fixture.readSource()) + '\nEdited after approval.',
  );
  const stale = await resolveSocialCard(template(), root);
  assert.equal(stale.approvedArt?.status, 'needs_review');
  assert.equal(stale.image.src, card.image.src);
  assert.ok(stale.approvedArt?.png.equals(fixture.image));
});

test('changing selected PNG changes address and corrupt approval cannot fall back silently', async (t) => {
  const root = await temporary(t);
  const fixture = await approvedArtFixture(root);
  const before = await resolveSocialCard(template(), root);
  const replacement = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: '#997755' },
  })
    .png()
    .toBuffer();
  await putArtFixture(root, `${fixture.directory}/final.png`, replacement);
  fixture.manifest.image.sha256 = artHash(replacement);
  await fixture.save();
  assert.notEqual(
    (await resolveSocialCard(template(), root)).image.src,
    before.image.src,
  );
  await putArtFixture(root, `${fixture.directory}/final.png`, 'corrupt');
  await assert.rejects(resolveSocialCard(template(), root), /SHA256|PNG/);
});

test('project and article approvals remain in separate URL namespaces', async (t) => {
  const root = await temporary(t);
  const fixture = await approvedArtFixture(root, {
    kind: 'projects',
    slug: 'a-note',
  });
  const card = await resolveSocialCard(
    projectCard({
      slug: 'a-note',
      displayName: artFixtureTitle,
      techStack: [],
    }),
    root,
  );
  assert.match(card.image.src, /^\/og\/projects\/a-note-[a-f0-9]{12}\.png$/);
  assert.ok(card.approvedArt?.png.equals(fixture.image));
  assert.equal(
    (await resolveSocialCard(template(), root)).approvedArt,
    undefined,
  );
});

test('independent sharing audit records AI approval and flags stale sources', async (t) => {
  const root = await temporary(t);
  const fixture = await approvedArtFixture(root);
  const dist = await generatedPage(root, fixture.image);
  const report = await auditSharing(dist, {}, { authorRoot: root });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.cards[0]?.art, {
    source: 'ai',
    approval: 'confirmed',
    review: 'current',
  });
  await writeFile(
    fixture.sourceFile,
    (await fixture.readSource()) + '\nSource changed.',
  );
  const stale = await auditSharing(dist, {}, { authorRoot: root });
  assert.deepEqual(stale.errors, []);
  assert.equal(stale.cards[0]?.art.review, 'needs_review');
  assert.match(stale.warnings.join('\n'), /复核|review/i);
});

test('sharing audit rejects a valid PNG whose bytes differ from the confirmed file', async (t) => {
  const root = await temporary(t);
  await approvedArtFixture(root);
  const altered = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  const dist = await generatedPage(root, altered);
  const report = await auditSharing(dist, {}, { authorRoot: root });
  assert.match(report.errors.join('\n'), /approved|confirmed|确认|SHA256/i);
});
