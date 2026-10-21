import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const fixture = 'http://127.0.0.1:4322';

test('已确认配图原样输出，内部简报与清单不进入网页', async ({ page }) => {
  const build = JSON.parse(
    await readFile('reports/browser-build.json', 'utf8'),
  );
  const manifest = JSON.parse(
    await readFile(
      join(
        build.root,
        'assets/share-art/blog/integration-visible/manifest.json',
      ),
      'utf8',
    ),
  );
  expect(manifest.generator.tool).toBe('test-fixture');
  await page.goto(fixture + '/blog/integration-visible/');
  const image = (await page
    .locator('meta[property="og:image"]')
    .getAttribute('content'))!;
  const response = await page.request.get(fixture + new URL(image).pathname);
  expect(response.status()).toBe(200);
  expect(
    createHash('sha256')
      .update(await response.body())
      .digest('hex'),
  ).toBe(manifest.image.sha256);
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    'content',
    manifest.alt,
  );
  expect(await page.content()).not.toContain(
    'SHARE_ART_PRIVATE_CANARY_20261021',
  );
  expect(
    (
      await page.request.get(
        fixture + '/assets/share-art/blog/integration-visible/manifest.json',
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(
        fixture + '/assets/share-art/blog/integration-visible/brief.md',
      )
    ).status(),
  ).toBe(404);
});

test('文章与项目使用独立中文分享图，正文封面不覆盖分享元数据', async ({
  page,
}) => {
  for (const [path, namespace] of [
    ['/blog/integration-visible/', 'blog'],
    ['/projects/integration-project/', 'projects'],
  ]) {
    await page.goto(fixture + path);
    const image = await page
      .locator('meta[property="og:image"]')
      .getAttribute('content');
    expect(image).toMatch(
      new RegExp(
        `^https://0xalchemist-cs\\.github\\.io/og/${namespace}/[a-z0-9-]+-[a-f0-9]{12}\\.png$`,
      ),
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      image!,
    );
    const title = await page.locator('h1').innerText();
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      'content',
      new RegExp(title),
    );
    await expect(
      page.locator('meta[name="twitter:image:alt"]'),
    ).toHaveAttribute('content', new RegExp(title));
    const response = await page.request.get(fixture + new URL(image!).pathname);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const metadata = await sharp(await response.body()).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual([
      'png',
      1200,
      630,
    ]);
    if (namespace === 'blog') {
      const article = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((nodes) =>
          nodes
            .map((node) => JSON.parse(node.textContent!))
            .find((value) => value['@type'] === 'BlogPosting'),
        );
      expect(article.image).toBe(image);
      await expect(
        page.locator('.article-paper > img[src="/images/default-og.png"]'),
      ).toBeVisible();
    }
  }
});

test('验证配置仅在配置后输出一次，普通页面保留默认分享图', async ({ page }) => {
  await page.goto(fixture + '/');
  await expect(
    page.locator('meta[name="google-site-verification"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('meta[name="google-site-verification"]'),
  ).toHaveAttribute('content', 'V12_TEST_GOOGLE_ONLY_IN_FIXTURE_9F6C');
  await expect(page.locator('meta[name="msvalidate.01"]')).toHaveCount(1);
  await expect(page.locator('meta[name="msvalidate.01"]')).toHaveAttribute(
    'content',
    'V12_TEST_BING_ONLY_IN_FIXTURE_8D2B',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://0xalchemist-cs.github.io/images/default-og.png',
  );
  await page.goto('http://127.0.0.1:4321/');
  await expect(
    page.locator(
      'meta[name="google-site-verification"],meta[name="msvalidate.01"]',
    ),
  ).toHaveCount(0);
});
