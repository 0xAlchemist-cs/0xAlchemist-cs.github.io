import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { site } from '../src/config/site';
import {
  readArtSources,
  readApprovedShareArt,
  safeArtFile,
  shareArtManifestSchema,
  sourceDigest,
  type ShareArtManifest,
  type ShareArtSources,
  type ShareArtTarget,
} from '../src/lib/share-art';
import {
  renderBoundedShareArtText,
  verifiedFont,
} from '../src/lib/render-social-card';

export interface ComposeShareArtOptions {
  bundle: string;
  artwork: string;
  brief: string;
  layout: string;
  tool: string;
  alt?: string;
  model?: string;
}

const nonblank = z.string().trim().min(1);
const brandSchema = z.strictObject({
  author: nonblank,
  title: nonblank,
  url: z.string().url(),
});
const currentBrand = () => ({
  author: site.author,
  title: site.title,
  url: site.url,
});
const snapshotSchema = shareArtManifestSchema
  .pick({ version: true, target: true, sources: true, sourceDigest: true })
  .extend({ title: nonblank, brand: brandSchema });
const candidateSchema = shareArtManifestSchema
  .omit({ approval: true })
  .extend({ title: nonblank, brand: brandSchema });
const boxSchema = z
  .strictObject({
    left: z.number().int().min(0).max(1199),
    top: z.number().int().min(0).max(629),
    width: z.number().int().positive().max(1200),
    height: z.number().int().positive().max(630),
    fontSize: z.number().int().min(8).max(160),
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  })
  .refine(
    (box) => box.left + box.width <= 1200 && box.top + box.height <= 630,
    'Text box must fit the 1200 by 630 canvas',
  );
export const shareArtLayoutSchema = z.strictObject({
  version: z.literal(1),
  title: boxSchema,
  author: boxSchema,
  site: boxSchema,
});
export type ShareArtLayout = z.infer<typeof shareArtLayoutSchema>;
const hash = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');
const records = (snapshot: ShareArtSources) =>
  snapshot.sources.map(({ path, sha256 }) => ({ path, sha256 }));

function portableSegment(segment: string): boolean {
  return (
    !!segment &&
    segment !== '.' &&
    segment !== '..' &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(segment) &&
    !/[.\s]$/.test(segment) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
  );
}
function within(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error(`Path outside allowed directory: ${child}`);
}

// Reject links instead of resolving through them. Creation happens only after
// callers have checked root containment, one component at a time.
async function checkedDirectory(
  directory: string,
  create = false,
): Promise<void> {
  const absolute = path.resolve(directory);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const rootStat = await lstat(current);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error(`Unsafe directory: ${current}`);
  for (const segment of absolute
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)) {
    if (!portableSegment(segment))
      throw new Error(`Unsafe path segment: ${segment}`);
    current = path.join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST')
          throw mkdirError;
      }
      stat = await lstat(current);
    }
    if (stat.isSymbolicLink()) throw new Error(`Symbolic link: ${current}`);
    if (!stat.isDirectory()) throw new Error(`Expected directory: ${current}`);
  }
}
async function localInput(filename: string, root: string): Promise<Buffer> {
  if (filename.split(/[\\/]/).includes('..'))
    throw new Error(`Unsafe input path: ${filename}`);
  const absolute = path.resolve(root, filename);
  await checkedDirectory(path.dirname(absolute));
  if (!portableSegment(path.basename(absolute)))
    throw new Error(`Unsafe input filename: ${filename}`);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error(`Expected regular file, no symbolic links: ${absolute}`);
  return readFile(absolute);
}
async function constrainedDirectory(
  root: string,
  directory: string,
  boundary: string,
  create = false,
): Promise<string> {
  await checkedDirectory(path.resolve(root));
  if (
    !directory ||
    directory.split(/[\\/]/).some((part) => part === '..' || part === '.')
  )
    throw new Error(`Unsafe directory: ${directory}`);
  if (!path.isAbsolute(directory) && directory.includes('\\'))
    throw new Error(`Unsafe directory: ${directory}`);
  const absolute = path.resolve(root, directory);
  within(path.resolve(root, boundary), absolute);
  await checkedDirectory(absolute, create);
  return absolute;
}
async function newDirectory(root: string, directory: string): Promise<string> {
  if (directory.split(/[\\/]/).some((part) => part === '..' || part === '.'))
    throw new Error(`Unsafe directory: ${directory}`);
  const absolute = path.resolve(root, directory);
  within(path.resolve(root, 'reports/share-art'), absolute);
  if (absolute === path.resolve(root, 'reports/share-art'))
    throw new Error('A new bundle subdirectory is required');
  await constrainedDirectory(
    root,
    path.dirname(absolute),
    'reports/share-art',
    true,
  );
  if (!portableSegment(path.basename(absolute)))
    throw new Error(`Unsafe bundle directory: ${directory}`);
  await mkdir(absolute); // EEXIST is deliberate: never overwrite a bundle/version.
  return absolute;
}
async function jsonFile(
  root: string,
  directory: string,
  leaf: string,
): Promise<unknown> {
  return JSON.parse(
    await readFile(await safeArtFile(root, directory, leaf), 'utf8'),
  );
}
async function validateSnapshot(
  snapshot: z.infer<typeof snapshotSchema>,
  root: string,
): Promise<ShareArtSources> {
  if (sourceDigest(snapshot.sources) !== snapshot.sourceDigest)
    throw new Error('Share-art snapshot source digest mismatch');
  if (JSON.stringify(snapshot.brand) !== JSON.stringify(currentBrand()))
    throw new Error(
      'Share-art brand changed since prepare; prepare a fresh bundle',
    );
  const current = await readArtSources(snapshot.target, root);
  if (
    current.sourceDigest !== snapshot.sourceDigest ||
    current.title !== snapshot.title
  )
    throw new Error(
      'Stale share-art candidate or bundle: source changed; prepare and compose again',
    );
  return current;
}

export async function prepareShareArt(
  target: ShareArtTarget,
  out: string,
  root = process.cwd(),
): Promise<string> {
  const sources = await readArtSources(target, root);
  const directory = await newDirectory(root, out);
  const snapshot = snapshotSchema.parse({
    version: 1,
    target,
    title: sources.title,
    sources: records(sources),
    sourceDigest: sources.sourceDigest,
    brand: currentBrand(),
  });
  const input = `# Share-art complete input\n\nTarget: ${target.kind}/${target.slug}\n\nTitle: ${sources.title}\n\nBrand: ${JSON.stringify(snapshot.brand)}\n\nRead every complete source below before writing a real design brief. No source text has been truncated.\n\n${sources.sources.map((source) => `## Source: ${source.path}\nSHA256: ${source.sha256}\n\n${source.text}`).join('\n\n')}`;
  await writeFile(path.join(directory, 'input.md'), input, { flag: 'wx' });
  await writeFile(
    path.join(directory, 'snapshot.json'),
    JSON.stringify(snapshot, null, 2) + '\n',
    { flag: 'wx' },
  );
  await writeFile(
    path.join(directory, 'GUIDE.md'),
    '# Codex artwork guide\n\nRead input.md in full, including frontmatter and every linked project article. Write a genuine brief covering thesis, audience, tone, metaphor, composition, palette, accurate typography and avoidances. Use only the Codex built-in image tool to generate artwork; this CLI never calls a model or network. Supply an artwork raster, brief Markdown and version-1 layout JSON. Text comes from the full title and site configuration; do not put text values in layout. Compose a final 1200×630 candidate, preview it, and obtain explicit author confirmation of that exact PNG before approve. Brief approval is separate from final-image and merge approval. Never invent a model name.\n',
    { flag: 'wx' },
  );
  return directory;
}

export async function composeShareArt(
  options: ComposeShareArtOptions,
  root = process.cwd(),
): Promise<string> {
  const bundle = await constrainedDirectory(
    root,
    options.bundle,
    'reports/share-art',
  );
  const snapshot = snapshotSchema.parse(
    await jsonFile(root, bundle, 'snapshot.json'),
  );
  await validateSnapshot(snapshot, root);
  const generator = shareArtManifestSchema.shape.generator.parse({
    tool: options.tool,
    ...(options.model !== undefined ? { model: options.model } : {}),
  });
  const alt = nonblank.parse(
    options.alt ?? `${snapshot.title} — ${snapshot.brand.title}`,
  );
  const artworkInput = await localInput(options.artwork, root);
  const brief = await localInput(options.brief, root);
  if (!brief.toString('utf8').trim())
    throw new Error('Share-art brief must not be empty');
  const layoutBytes = await localInput(options.layout, root);
  const layout = shareArtLayoutSchema.parse(
    JSON.parse(layoutBytes.toString('utf8')),
  );
  const format = (await sharp(artworkInput, { failOn: 'warning' }).metadata())
    .format;
  if (
    !format ||
    !['png', 'jpeg', 'webp', 'avif', 'tiff', 'gif', 'heif'].includes(format)
  )
    throw new Error('Share-art artwork must be a local raster image');
  const artwork = await sharp(artworkInput, { failOn: 'warning' })
    .rotate()
    .resize(1200, 630, { fit: 'cover' })
    .png()
    .toBuffer();
  const artworkExtension = format === 'jpeg' ? 'jpg' : format;
  await safeArtFile(root, 'assets/fonts', 'NotoSansCJKsc-Regular.otf');
  const fontfile = await verifiedFont(root);
  const values = {
    title: snapshot.title,
    author: snapshot.brand.author,
    site: new URL(snapshot.brand.url).hostname,
  };
  const layers = [];
  for (const key of ['title', 'author', 'site'] as const) {
    const box = layout[key];
    layers.push({
      input: await renderBoundedShareArtText(values[key], box, fontfile),
      left: box.left,
      top: box.top,
    });
  }
  const image = await sharp(artwork).composite(layers).png().toBuffer();
  const directory = await newDirectory(
    root,
    path.join(bundle, `candidate-${randomUUID()}`),
  );
  const output = {
    image: ['final.png', image],
    artwork: [`artwork.${artworkExtension}`, artworkInput],
    brief: ['brief.md', brief],
    layout: ['layout.json', layoutBytes],
  } as const;
  const assets = {} as Pick<
    ShareArtManifest,
    'image' | 'artwork' | 'brief' | 'layout'
  >;
  for (const key of ['image', 'artwork', 'brief', 'layout'] as const) {
    const [file, bytes] = output[key];
    await writeFile(path.join(directory, file), bytes, { flag: 'wx' });
    assets[key] = { file, sha256: hash(bytes) };
  }
  const candidate = candidateSchema.parse({
    ...snapshot,
    ...assets,
    generator,
    alt,
  });
  await writeFile(
    path.join(directory, 'candidate.json'),
    JSON.stringify(candidate, null, 2) + '\n',
    { flag: 'wx' },
  );
  return directory;
}

function confirmationRecord(confirmation: string): string {
  if (typeof confirmation !== 'string' || !confirmation.trim())
    throw new Error('Explicit nonempty author confirmation is required');
  return confirmation.trim();
}
async function atomicManifest(
  root: string,
  directory: string,
  manifest: ShareArtManifest,
): Promise<void> {
  try {
    await safeArtFile(root, directory, 'manifest.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = path.join(directory, `manifest-${randomUUID()}.tmp`);
  await writeFile(
    temporary,
    JSON.stringify(shareArtManifestSchema.parse(manifest), null, 2) + '\n',
    { flag: 'wx' },
  );
  await rename(temporary, path.join(directory, 'manifest.json'));
}
export async function approveShareArt(
  candidate: string,
  confirmation: string,
  root = process.cwd(),
): Promise<ShareArtManifest> {
  const record = confirmationRecord(confirmation);
  const candidateDirectory = await constrainedDirectory(
    root,
    candidate,
    'reports/share-art',
  );
  const parsed = candidateSchema.parse(
    await jsonFile(root, candidateDirectory, 'candidate.json'),
  );
  await validateSnapshot(
    snapshotSchema.parse({
      version: parsed.version,
      target: parsed.target,
      sources: parsed.sources,
      sourceDigest: parsed.sourceDigest,
      title: parsed.title,
      brand: parsed.brand,
    }),
    root,
  );
  const bytes = {} as Record<'image' | 'artwork' | 'brief' | 'layout', Buffer>;
  for (const key of ['image', 'artwork', 'brief', 'layout'] as const) {
    bytes[key] = await readFile(
      await safeArtFile(root, candidateDirectory, parsed[key].file),
    );
    if (hash(bytes[key]) !== parsed[key].sha256)
      throw new Error(`Candidate ${key} SHA256 digest mismatch`);
  }
  const png = sharp(bytes.image, { failOn: 'warning' });
  const metadata = await png.metadata();
  if (
    metadata.format !== 'png' ||
    metadata.width !== 1200 ||
    metadata.height !== 630
  )
    throw new Error('Candidate final image must be a 1200 by 630 PNG');
  await png.raw().toBuffer();
  shareArtLayoutSchema.parse(JSON.parse(bytes.layout.toString('utf8')));
  const directory = await constrainedDirectory(
    root,
    `assets/share-art/${parsed.target.kind}/${parsed.target.slug}`,
    'assets/share-art',
    true,
  );
  await readApprovedShareArt(parsed.target, root);
  const { title: _title, brand: _brand, ...fields } = parsed;
  const manifest = shareArtManifestSchema.parse({
    ...fields,
    approval: { confirmed: true, record },
  });
  for (const key of ['image', 'artwork', 'brief', 'layout'] as const) {
    const extension =
      key === 'brief'
        ? 'md'
        : key === 'layout'
          ? 'json'
          : key === 'artwork'
            ? path.extname(parsed.artwork.file).slice(1)
            : 'png';
    const leaf = `${key}-${hash(bytes[key])}.${extension}`;
    const destination = path.join(directory, leaf);
    try {
      await writeFile(destination, bytes[key], { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (
        !bytes[key].equals(
          await readFile(await safeArtFile(root, directory, leaf)),
        )
      )
        throw new Error(`Existing asset digest mismatch: ${leaf}`);
    }
    manifest[key] = { file: leaf, sha256: hash(bytes[key]) };
  }
  await atomicManifest(root, directory, manifest);
  return manifest;
}
export async function reviewShareArt(
  target: ShareArtTarget,
  confirmation: string,
  root = process.cwd(),
): Promise<ShareArtManifest> {
  const record = confirmationRecord(confirmation);
  const approved = await readApprovedShareArt(target, root);
  if (!approved) throw new Error('No approved share-art manifest to review');
  const current = await readArtSources(target, root);
  const manifest = shareArtManifestSchema.parse({
    ...approved.manifest,
    sources: records(current),
    sourceDigest: current.sourceDigest,
    approval: { confirmed: true, record },
  });
  const directory = await constrainedDirectory(
    root,
    `assets/share-art/${target.kind}/${target.slug}`,
    'assets/share-art',
  );
  await atomicManifest(root, directory, manifest);
  return manifest;
}
