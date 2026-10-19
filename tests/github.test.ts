import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheSchema, refreshRepos, type RepoCache } from '../src/lib/github';

const data = {
  full_name: 'owner/public',
  html_url: 'https://github.com/owner/public',
  private: false as const,
  description: 'Public metadata',
  language: 'TypeScript',
  topics: ['test'],
  stargazers_count: 3,
  updated_at: '2026-10-01T00:00:00Z',
};
const old: RepoCache = {
  version: 1,
  repos: { 'owner/public': { fetchedAt: '2026-10-01T00:00:00Z', data } },
};
const mock = (
  callback: (url: string, init?: RequestInit) => Response | Promise<Response>,
) => callback as unknown as typeof fetch;

test('仅请求精选仓库，清除响应中的其他字段', async () => {
  const urls: string[] = [];
  const result = await refreshRepos(
    ['owner/public'],
    { version: 1, repos: {} },
    mock((url, init) => {
      urls.push(url);
      assert.ok(init?.signal);
      assert.equal(init?.redirect, 'error');
      return Response.json({
        ...data,
        token: 'do-not-retain',
        readme_html: '<script>bad()</script>',
      });
    }),
  );
  assert.deepEqual(urls, ['https://api.github.com/repos/owner/public']);
  assert.equal(result.errors.length, 0);
  assert.equal(JSON.stringify(result.cache).includes('do-not-retain'), false);
  assert.equal(JSON.stringify(result.cache).includes('readme_html'), false);
});
for (const status of [404, 429, 500])
  test(`HTTP ${status} 保留有效缓存，首次构建保持手工回退`, async () => {
    const fetcher = mock(() => new Response('', { status }));
    assert.deepEqual(
      (await refreshRepos(['owner/public'], old, fetcher)).cache,
      old,
    );
    const first = await refreshRepos(
      ['owner/public'],
      { version: 1, repos: {} },
      fetcher,
    );
    assert.deepEqual(first.cache.repos, {});
    assert.equal(first.errors.length, 1);
  });
test('超时、断网、损坏 JSON 与私有数据不覆盖公开缓存、不打印凭据', async () => {
  const responses = [
    mock(() => {
      throw new DOMException('Timeout', 'TimeoutError');
    }),
    mock(() => {
      throw new Error('Bearer SECRET_SHOULD_NOT_BE_LOGGED');
    }),
    mock(() => new Response('invalid-json', { status: 200 })),
    mock(() => Response.json({ ...data, private: true })),
    mock(() =>
      Response.json({
        ...data,
        full_name: 'other/repo',
        html_url: 'https://github.com/other/repo',
      }),
    ),
    mock(() =>
      Response.json({ ...data, html_url: 'https://evil.example/repo' }),
    ),
  ];
  for (const fetcher of responses) {
    const result = await refreshRepos(
      ['owner/public'],
      old,
      fetcher,
      'SECRET_SHOULD_NOT_BE_LOGGED',
    );
    assert.deepEqual(result.cache, old);
    assert.equal(result.errors.length, 1);
    assert.equal(
      JSON.stringify(result).includes('SECRET_SHOULD_NOT_BE_LOGGED'),
      false,
    );
  }
});
test('作者取消精选后清除对应缓存，缓存键必须匹配仓库', async () => {
  const result = await refreshRepos(
    [],
    old,
    mock(() => {
      throw new Error('Must not fetch');
    }),
  );
  assert.deepEqual(result.cache.repos, {});
  assert.equal(
    cacheSchema.safeParse({
      version: 1,
      repos: { wrong: old.repos['owner/public'] },
    }).success,
    false,
  );
});
