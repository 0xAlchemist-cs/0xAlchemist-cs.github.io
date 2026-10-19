import { z } from 'zod';

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 使用小写英文、数字与单横线');
export const safeUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  );
}, 'URL 必须为不含凭据的 HTTP(S) 地址');
export const repoName = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const text = z.string().trim().min(1);
const tags = z
  .array(text)
  .refine(
    (items) =>
      new Set(items.map((item) => item.normalize('NFKC').toLowerCase()))
        .size === items.length,
    '标签不可重复（忽略大小写）',
  );
const date = z
  .union([z.date(), z.iso.date(), z.iso.datetime({ offset: true })])
  .pipe(z.coerce.date());

export const postSchema = z
  .object({
    title: text,
    description: text,
    slug: slugSchema,
    publishedAt: date,
    updatedAt: date.optional(),
    draft: z.boolean().default(false),
    example: z.boolean().default(false),
    featured: z.boolean().default(false),
    tags: tags.default([]),
    category: text,
    cover: z.string().startsWith('/').optional(),
    coverAlt: text.optional(),
    canonical: safeUrl.optional(),
    relatedRepos: z.array(repoName).default([]),
    references: z.array(z.object({ title: text, url: safeUrl })).default([]),
  })
  .superRefine((post, ctx) => {
    if (post.cover && !post.coverAlt)
      ctx.addIssue({
        code: 'custom',
        path: ['coverAlt'],
        message: '封面必须提供替代文字',
      });
    if (post.updatedAt && post.updatedAt < post.publishedAt)
      ctx.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: '更新日期不可早于发布日期',
      });
  });

export const projectSchema = z
  .object({
    slug: slugSchema,
    repoFullName: repoName.optional(),
    displayName: text,
    summary: text,
    techStack: tags.default([]),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    example: z.boolean().default(false),
    relatedPosts: z.array(slugSchema).default([]),
    demoUrl: safeUrl.optional(),
    status: text.optional(),
  })
  .superRefine((project, ctx) => {
    if (!project.example && !project.repoFullName)
      ctx.addIssue({
        code: 'custom',
        path: ['repoFullName'],
        message: '正式项目需要公开仓库全名',
      });
  });

export type PostData = z.infer<typeof postSchema>;
export type ProjectData = z.infer<typeof projectSchema>;

export function isVisible(
  data: { draft: boolean; example: boolean },
  development: boolean,
) {
  return development || (!data.draft && !data.example);
}

// Normalize names before URL encoding; links remain stable across content order changes.
export function topicSlug(name: string) {
  const normalized = name.normalize('NFKC').trim().toLowerCase();
  // Escape reserved path characters without merging distinct topics such as C# and C.
  const safe = normalized.replace(
    /[%~/?#\\]/g,
    (character) => `~${character.codePointAt(0)!.toString(16)}~`,
  );
  return encodeURIComponent(
    safe === '.' || safe === '..' || safe.endsWith('.')
      ? safe.replace(/\./g, '~2e~')
      : safe,
  );
}

export function topicGroups<
  T extends { data: { tags: string[]; category: string } },
>(items: T[], type: 'tags' | 'category') {
  const groups = new Map<string, { name: string; slug: string; items: T[] }>();
  for (const item of items) {
    for (const name of type === 'tags'
      ? item.data.tags
      : [item.data.category]) {
      const slug = topicSlug(name);
      const group = groups.get(slug) ?? { name, slug, items: [] };
      group.items.push(item);
      groups.set(slug, group);
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.items.length - a.items.length || a.name.localeCompare(b.name, 'zh-CN'),
  );
}
