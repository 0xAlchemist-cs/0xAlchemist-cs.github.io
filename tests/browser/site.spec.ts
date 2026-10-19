import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const dev = 'http://127.0.0.1:4321';
const production = 'http://127.0.0.1:4322';

test('首页可用、无横向溢出，背景不拦截交互', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(dev);
  await expect(page.locator('h1')).toContainText('保持好奇');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  await expect(page.locator('#particle-background')).toHaveCSS(
    'pointer-events',
    'none',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.mouse.move(100, 250);
  await mkdir('reports/screenshots', { recursive: true });
  await page.screenshot({
    path: `reports/screenshots/home-${info.project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到正文' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('link', { name: '翻开文章' }).click();
  await expect(page.locator('h1')).toContainText('写下来');
  expect(errors).toEqual([]);
});

test('开发环境的示例、中文分类、关联项目与文章目录可浏览', async ({
  page,
}, info) => {
  await page.goto(`${dev}/blog/design-a-static-blog/`);
  await expect(page.locator('.notice')).toContainText('示例');
  await expect(
    page.getByRole('link', { name: '知识花园 · 项目配置示例', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.toc a').first()).toBeAttached();
  if (info.project.name === 'mobile')
    await expect(page.locator('#article-toc')).not.toHaveAttribute('open', '');
  await page.screenshot({
    path: `reports/screenshots/article-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .locator('.article-heading')
    .getByRole('link', { name: '工程实践', exact: true })
    .click();
  await expect(page.locator('h1')).toHaveText('工程实践');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('减少动态效果与手动关闭背景生效', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(dev);
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'disabled',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  await page.getByRole('button', { name: '背景动态：开' }).click();
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'disabled',
  );
  await page.reload();
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'disabled',
  );
});

test('隔离生产构建可检索中文正文，项目双向关联、分页与草稿过滤正确', async ({
  page,
}) => {
  await page.goto(`${production}/search/`);
  const input = page.getByPlaceholder('搜索文章与项目…');
  await expect(input).toBeVisible();
  await input.fill('量子炼金术');
  const result = page.getByRole('link', {
    name: '集成测试：让中文搜索找到技术记录',
    exact: true,
  });
  await expect(result).toBeVisible({ timeout: 15000 });
  await result.click();
  await expect(page.locator('h1')).toHaveText(
    '集成测试：让中文搜索找到技术记录',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://0xalchemist-cs.github.io/blog/integration-visible/',
  );
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const copyButton = page.getByRole('button', { name: '复制这段代码' });
  await copyButton.click();
  await expect(copyButton).toHaveText('已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'const answer = 42;',
  );
  await page
    .locator('.article-heading')
    .getByRole('link', { name: '# CI/CD', exact: true })
    .click();
  await expect(page.locator('h1')).toHaveText('# CI/CD');
  await page
    .getByRole('link', {
      name: '集成测试：让中文搜索找到技术记录',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('link', { name: 'other-owner/other-public ↗' }),
  ).toHaveAttribute('href', 'https://github.com/other-owner/other-public');
  await page
    .getByRole('link', { name: '关联项目集成测试', exact: true })
    .click();
  await expect(
    page.getByRole('link', {
      name: '集成测试：让中文搜索找到技术记录',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${production}/blog/page/2/`);
  await expect(page.locator('.article-card')).toHaveCount(1);
  await page.goto(`${production}/blog/design-a-static-blog/`);
  await expect(page.locator('h1')).toContainText('这条线');
  await page.goto(`${production}/blog/unpublished-note/`);
  await expect(page.locator('h1')).toContainText('这条线');
});

test.describe('关闭 JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('仍可阅读正文并访问关联项目', async ({ page }) => {
    await page.goto(`${production}/blog/integration-visible/`);
    await expect(page.locator('h1')).toHaveText(
      '集成测试：让中文搜索找到技术记录',
    );
    await expect(page.locator('.prose')).toContainText('量子炼金术');
    await page.getByRole('link', { name: '关联项目', exact: true }).click();
    await expect(page.locator('h1')).toHaveText('关联项目集成测试');
  });
});

test('首页与文章通过 WCAG A/AA 自动检查', async ({ page }) => {
  for (const path of [
    '/',
    '/blog/design-a-static-blog/',
    '/about/',
    '/projects/',
  ]) {
    await page.goto(dev + path);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  }
});
