import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import {
  postSchema,
  projectSchema,
  type PostData,
  type ProjectData,
} from '../src/lib/schemas';

export function parseFrontmatter(source: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) throw new Error('Missing YAML frontmatter');
  const doc = parseDocument(match[1]!, { uniqueKeys: true });
  if (doc.errors.length) throw new Error('Invalid YAML frontmatter');
  return {
    data: doc.toJS({ maxAliasCount: 0 }) as unknown,
    body: source.slice(match[0].length),
  };
}
export async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(directory, entry.name))
        : /\.mdx?$/.test(entry.name)
          ? [join(directory, entry.name)]
          : [],
    ),
  );
  return children.flat().sort();
}
export type ContentRecord<T> = { file: string; data: T; body: string };
export async function loadContent() {
  const posts: ContentRecord<PostData>[] = [];
  const projects: ContentRecord<ProjectData>[] = [];
  const errors: string[] = [];
  for (const [type, schema, target] of [
    ['posts', postSchema, posts],
    ['projects', projectSchema, projects],
  ] as const) {
    for (const file of await sourceFiles(`src/content/${type}`)) {
      try {
        const parsed = parseFrontmatter(await readFile(file, 'utf8'));
        const result = schema.safeParse(parsed.data);
        if (!result.success) {
          errors.push(
            `${file}: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
          );
          continue;
        }
        // The tuple keeps schema and collection aligned; the public return type is explicit.
        (target as ContentRecord<PostData | ProjectData>[]).push({
          file,
          body: parsed.body,
          data: result.data,
        });
      } catch {
        errors.push(`${file}: frontmatter 缺失或 YAML 无法解析。`);
      }
    }
  }
  return { posts, projects, errors };
}
