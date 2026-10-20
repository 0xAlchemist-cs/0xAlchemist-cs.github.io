import { test, expect } from '@playwright/test';

test('中文连续词、组合关键词与引号短语不受浏览器词典影响', async ({ page }) => {
  await page.goto('http://127.0.0.1:4322/search/');
  const input = page.getByPlaceholder('搜索文章与项目…');
  const project = page.locator(
    '.pagefind-ui__result-link[href="/projects/integration-project/"]',
  );
  const unrelated = page.locator(
    '.pagefind-ui__result-link[href="/blog/integration-visible/"]',
  );
  for (const query of [
    '回放',
    '图文信号回放',
    '信号 回放',
    'Python 回放',
    '回放Python',
    '"回放"',
  ]) {
    await input.fill(query);
    await expect(page.locator('.pagefind-ui__message')).toContainText(query);
    await expect(project, query).toBeVisible({ timeout: 15000 });
    await expect(unrelated, `不能把分散的回/放算作${query}`).toHaveCount(0);
    await expect(project).toHaveText('关联项目集成测试');
  }
  await input.fill('"Python 回放"');
  await expect(page.locator('.pagefind-ui__message')).toContainText('没有找到');
  await expect(project).toHaveCount(0);
  await input.fill('复习');
  await expect(project).toBeVisible();
  await input.fill('answer');
  await expect(unrelated).toBeVisible();
  await input.fill('这个词根本不存在');
  await expect(page.locator('.pagefind-ui__message')).toContainText('没有找到');
  await expect(page.locator('.pagefind-ui__result-link')).toHaveCount(0);
});

test('缺少 Intl.Segmenter 时中文查询仍能命中连续词', async ({ page }) => {
  await page.goto('http://127.0.0.1:4322/');
  const urls = await page.evaluate(async () => {
    const path = '/search-api/pagefind.js';
    const api = await import(path);
    await api.options({ noWorker: true });
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    Object.defineProperty(Intl, 'Segmenter', {
      value: undefined,
      configurable: true,
    });
    try {
      const response = await api.search('回放');
      return Promise.all(
        response.results.map(
          async (result: { data: () => Promise<{ url: string }> }) =>
            (await result.data()).url,
        ),
      );
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
    }
  });
  expect(urls).toEqual(['/projects/integration-project/']);
});
