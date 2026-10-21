import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { parseFrontmatter } from '../../scripts/content-files';
import { postSchema, projectSchema, slugSchema } from './schemas';

export type ShareArtTarget = { kind: 'blog' | 'projects'; slug: string };
export type ShareArtSource = { path: string; sha256: string; text: string };
export type ShareArtSources = ShareArtTarget & {
  title: string;
  sources: ShareArtSource[];
  sourceDigest: string;
};
export type ArtFile = { file: string; sha256: string };

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const textSchema = z.string().trim().min(1);
const targetSchema = z.strictObject({
  kind: z.enum(['blog', 'projects']),
  slug: slugSchema,
});

// Use portable path rules: reject Windows aliases/streams even on Ubuntu.
function safeSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== '.' &&
    segment !== '..' &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(segment) &&
    !/[.\s]$/.test(segment) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
  );
}

function safeRelativePath(value: string): boolean {
  return value.split('/').every(safeSegment);
}

function safeLeaf(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) && safeSegment(value);
}

const sourceRecordSchema = z.strictObject({
  path: z
    .string()
    .refine(
      (value) =>
        safeRelativePath(value) &&
        /^src\/content\/(posts|projects)\/.+\.mdx?$/.test(value),
      'Source path must be a safe content Markdown or MDX file',
    ),
  sha256: sha256Schema,
});
const artFileSchema = z.strictObject({
  file: z
    .string()
    .refine(safeLeaf, 'Art files must use a single safe filename'),
  sha256: sha256Schema,
});

export const shareArtManifestSchema = z.strictObject({
  version: z.literal(1),
  target: targetSchema,
  sources: z.array(sourceRecordSchema).min(1),
  sourceDigest: sha256Schema,
  image: artFileSchema,
  artwork: artFileSchema,
  brief: artFileSchema,
  layout: artFileSchema,
  alt: textSchema,
  generator: z.strictObject({ tool: textSchema, model: textSchema.optional() }),
  approval: z.strictObject({ confirmed: z.literal(true), record: textSchema }),
});
export type ShareArtManifest = z.infer<typeof shareArtManifestSchema>;
export type ApprovedShareArt = {
  manifest: ShareArtManifest;
  png: Buffer;
  status: 'current' | 'needs_review';
  currentSourceDigest: string;
};

const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const comparePaths = (a: { path: string }, b: { path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

export function sourceDigest(
  sources: { path: string; sha256: string }[],
): string {
  const records = z
    .array(sourceRecordSchema)
    .parse(sources.map(({ path, sha256 }) => ({ path, sha256 })));
  const seen = new Set<string>();
  for (const record of records) {
    const key = record.path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate source path: ${record.path}`);
    seen.add(key);
  }
  // Explicit property order makes equivalent input objects hash identically.
  return hash(
    JSON.stringify(
      records.sort(comparePaths).map(({ path, sha256 }) => ({ path, sha256 })),
    ),
  );
}

function inside(root: string, filename: string): void {
  const relative = path.relative(root, filename);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path is outside root: ${filename}`);
  }
}

// lstat every component, including ancestors of root, before any read/readdir.
// Do not realpath first: it would hide the very links we must reject.
async function checkedPath(
  filename: string,
  directory: boolean,
): Promise<void> {
  const absolute = path.resolve(filename);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const parts = absolute
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);
  const rootStat = await lstat(current);
  if (rootStat.isSymbolicLink()) throw new Error(`Symbolic link: ${current}`);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]!);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic link: ${current}`);
    if ((index < parts.length - 1 || directory) && !stat.isDirectory()) {
      throw new Error(`Expected directory: ${current}`);
    }
    if (index === parts.length - 1 && !directory && !stat.isFile()) {
      throw new Error(`Expected regular file: ${current}`);
    }
  }
}

export async function safeArtFile(
  root: string,
  directory: string,
  filename: string,
): Promise<string> {
  if (!safeLeaf(filename)) throw new Error(`Unsafe art filename: ${filename}`);
  const absoluteRoot = path.resolve(root);
  // Accept absolute in-root directories as well as portable relative paths.
  if (!path.isAbsolute(directory) && !safeRelativePath(directory)) {
    throw new Error(`Unsafe art directory: ${directory}`);
  }
  if (directory.split(/[\\/]/).includes('..')) {
    throw new Error(`Unsafe art directory: ${directory}`);
  }
  const absoluteDirectory = path.resolve(absoluteRoot, directory);
  inside(absoluteRoot, absoluteDirectory);
  await checkedPath(absoluteRoot, true);
  await checkedPath(absoluteDirectory, true);
  const absoluteFile = path.join(absoluteDirectory, filename);
  await checkedPath(absoluteFile, false);
  return absoluteFile;
}

async function contentFiles(
  root: string,
  directory: string,
): Promise<string[]> {
  inside(root, directory);
  await checkedPath(directory, true);
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link: ${filename}`);
    if (entry.isDirectory()) {
      files.push(...(await contentFiles(root, filename)));
    } else if (/\.mdx?$/.test(entry.name)) {
      await checkedPath(filename, false);
      files.push(filename);
    }
  }
  return files.sort();
}

async function collection<T extends { slug: string }>(
  root: string,
  name: string,
  schema: z.ZodType<T>,
) {
  const records: { data: T; source: ShareArtSource }[] = [];
  const seen = new Set<string>();
  for (const filename of await contentFiles(
    root,
    path.join(root, 'src/content', name),
  )) {
    const relative = path.relative(root, filename).split(path.sep).join('/');
    if (!safeRelativePath(relative))
      throw new Error(`Unsafe source path: ${relative}`);
    const text = (await readFile(filename, 'utf8')).replaceAll('\r\n', '\n');
    const data = schema.parse(parseFrontmatter(text).data);
    const slug = data.slug;
    if (seen.has(slug)) throw new Error(`Duplicate ${name} slug: ${slug}`);
    seen.add(slug);
    records.push({
      data,
      source: { path: relative, sha256: hash(text), text },
    });
  }
  return records;
}

export async function readArtSources(
  target: ShareArtTarget,
  root = process.cwd(),
): Promise<ShareArtSources> {
  targetSchema.parse(target);
  const absoluteRoot = path.resolve(root);
  await checkedPath(absoluteRoot, true);
  const posts = await collection(absoluteRoot, 'posts', postSchema);
  let title: string;
  let sources: ShareArtSource[];
  if (target.kind === 'blog') {
    const post = posts.find(({ data }) => data.slug === target.slug);
    if (!post) throw new Error(`Unknown blog slug: ${target.slug}`);
    title = post.data.title;
    sources = [post.source];
  } else {
    const projects = await collection(absoluteRoot, 'projects', projectSchema);
    const project = projects.find(({ data }) => data.slug === target.slug);
    if (!project) throw new Error(`Unknown project slug: ${target.slug}`);
    title = project.data.displayName;
    sources = [
      project.source,
      ...posts
        .filter(
          ({ data }) =>
            project.data.relatedPosts.includes(data.slug) ||
            data.relatedRepos.some(
              (repo) =>
                repo.toLowerCase() === project.data.repoFullName?.toLowerCase(),
            ),
        )
        .map(({ source }) => source),
    ];
  }
  sources.sort(comparePaths);
  return {
    ...target,
    title,
    sources,
    sourceDigest: sourceDigest(
      sources.map(({ path, sha256 }) => ({ path, sha256 })),
    ),
  };
}

export async function readApprovedShareArt(
  target: ShareArtTarget,
  root = process.cwd(),
): Promise<ApprovedShareArt | null> {
  targetSchema.parse(target);
  const directory = `assets/share-art/${target.kind}/${target.slug}`;
  // Validate root independently so an invalid/missing root cannot look unconfigured.
  await checkedPath(path.resolve(root), true);
  let manifestFile: string;
  try {
    manifestFile = await safeArtFile(root, directory, 'manifest.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const manifest = shareArtManifestSchema.parse(
    JSON.parse(await readFile(manifestFile, 'utf8')),
  );
  if (
    manifest.target.kind !== target.kind ||
    manifest.target.slug !== target.slug
  ) {
    throw new Error('Share-art manifest target mismatch');
  }
  if (sourceDigest(manifest.sources) !== manifest.sourceDigest) {
    throw new Error('Share-art manifest source digest mismatch');
  }
  let png!: Buffer;
  for (const key of ['image', 'artwork', 'brief', 'layout'] as const) {
    const record = manifest[key];
    const filename = await safeArtFile(root, directory, record.file);
    const bytes = await readFile(filename);
    if (hash(bytes) !== record.sha256)
      throw new Error(`Share-art ${key} SHA256 mismatch`);
    if (key === 'image') png = bytes;
  }
  const image = sharp(png, { failOn: 'warning' });
  const metadata = await image.metadata();
  if (
    metadata.format !== 'png' ||
    metadata.width !== 1200 ||
    metadata.height !== 630
  ) {
    throw new Error('Share-art final image must be a 1200 by 630 PNG');
  }
  // metadata() reads only headers. Force complete pixel decoding to reject corruption.
  await image.raw().toBuffer();
  const current = await readArtSources(target, root);
  return {
    manifest,
    png,
    status:
      current.sourceDigest === manifest.sourceDigest
        ? 'current'
        : 'needs_review',
    currentSourceDigest: current.sourceDigest,
  };
}
