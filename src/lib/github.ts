import { z } from 'zod';
import { repoName } from './schemas';

export const publicRepoSchema = z
  .object({
    full_name: repoName,
    html_url: z.url(),
    private: z.literal(false),
    description: z.string().nullable(),
    language: z.string().nullable(),
    topics: z.array(z.string()).default([]),
    stargazers_count: z.number().int().nonnegative(),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .superRefine((repo, ctx) => {
    if (
      repo.html_url.toLowerCase() !==
      `https://github.com/${repo.full_name}`.toLowerCase()
    )
      ctx.addIssue({
        code: 'custom',
        path: ['html_url'],
        message: '仓库 URL 与名称不符',
      });
  });
export const cacheEntrySchema = z.object({
  fetchedAt: z.iso.datetime({ offset: true }),
  data: publicRepoSchema,
});
export const cacheSchema = z
  .object({
    version: z.literal(1),
    repos: z.record(z.string(), cacheEntrySchema),
  })
  .superRefine((cache, ctx) => {
    for (const [name, entry] of Object.entries(cache.repos)) {
      if (name !== entry.data.full_name.toLowerCase())
        ctx.addIssue({
          code: 'custom',
          path: ['repos', name],
          message: '缓存键必须匹配公开仓库名称',
        });
    }
  });
export type RepoCache = z.infer<typeof cacheSchema>;

export async function refreshRepos(
  names: string[],
  previous: RepoCache,
  fetcher: typeof fetch = fetch,
  token?: string,
) {
  const next: RepoCache = { version: 1, repos: { ...previous.repos } };
  const errors: string[] = [];
  for (const name of [...new Set(names)]) {
    repoName.parse(name);
    try {
      const response = await fetcher(`https://api.github.com/repos/${name}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Public metadata unavailable');
      const data = publicRepoSchema.parse(await response.json());
      if (data.full_name.toLowerCase() !== name.toLowerCase())
        throw new Error('Repository identity mismatch');
      next.repos[name.toLowerCase()] = {
        fetchedAt: new Date().toISOString(),
        data,
      };
    } catch {
      // Never log a response, exception message, or token; preserve validated data only.
      errors.push(`${name}: 同步失败，保留有效缓存或使用手工配置。`);
    }
  }
  // Drop metadata for repositories the author has removed from the selection.
  const selected = new Set(names.map((name) => name.toLowerCase()));
  next.repos = Object.fromEntries(
    Object.entries(next.repos).filter(([name]) => selected.has(name)),
  );
  return { cache: cacheSchema.parse(next), errors };
}
