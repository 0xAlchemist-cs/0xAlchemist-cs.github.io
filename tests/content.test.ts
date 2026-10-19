import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postSchema,
  projectSchema,
  isVisible,
  topicGroups,
  safeUrl,
  topicSlug,
} from '../src/lib/schemas';
import { parseFrontmatter } from '../scripts/content-files';

const basePost = {
  title: '测试文章',
  description: '一篇用于验证内容模型的文章。',
  slug: 'test-note',
  publishedAt: '2026-10-18',
  category: '工程实践',
  tags: ['Astro'],
};

test('生产环境同时排除草稿和示例，开发环境可预览', () => {
  for (const draft of [true, false])
    for (const example of [true, false]) {
      assert.equal(isVisible({ draft, example }, false), !draft && !example);
      assert.equal(isVisible({ draft, example }, true), true);
    }
});
test('缺字段、无效日期、日期回滚、危险 slug、重复标签均拒绝', () => {
  assert.equal(postSchema.safeParse(basePost).success, true);
  for (const override of [
    { title: '' },
    { description: '' },
    { publishedAt: '2026-02-31' },
    { publishedAt: 'bad-date' },
    { updatedAt: '2026-10-17' },
    { slug: '../escape' },
    { tags: ['Astro', 'astro'] },
    { cover: '/image.png' },
  ]) {
    assert.equal(
      postSchema.safeParse({ ...basePost, ...override }).success,
      false,
      JSON.stringify(override),
    );
  }
});
test('只有明确标注的示例项目可以没有真实仓库', () => {
  const project = { slug: 'demo', displayName: '示例', summary: '仅供测试' };
  assert.equal(projectSchema.safeParse(project).success, false);
  assert.equal(
    projectSchema.safeParse({ ...project, example: true }).success,
    true,
  );
  assert.equal(
    projectSchema.safeParse({ ...project, repoFullName: 'owner/public' })
      .success,
    true,
  );
});
test('外部 URL 拒绝可执行协议与嵌入凭据', () => {
  assert.equal(safeUrl.safeParse('javascript:alert(1)').success, false);
  assert.equal(
    safeUrl.safeParse('https://user:password@example.com').success,
    false,
  );
  assert.equal(
    safeUrl.safeParse('https://github.com/0xAlchemist-cs').success,
    true,
  );
});
test('同一标签忽略大小写归组，中文主题生成稳定链接', () => {
  const entries = [
    { data: { tags: ['Astro', '中文'], category: '工程实践' } },
    { data: { tags: ['astro'], category: '工程实践' } },
  ];
  assert.equal(
    topicGroups(entries, 'tags').find((group) => group.slug === 'astro')?.items
      .length,
    2,
  );
  assert.equal(topicGroups(entries, 'category').length, 1);
  assert.equal(
    topicGroups(entries, 'category')[0]?.slug,
    encodeURIComponent('工程实践'),
  );
});
test('frontmatter 仅解析 YAML，拒绝重复键与别名展开', () => {
  assert.equal(
    (parseFrontmatter('---\ntitle: hello\n---\nbody').data as { title: string })
      .title,
    'hello',
  );
  assert.throws(() => parseFrontmatter('---\ntitle: a\ntitle: b\n---\n'));
  assert.throws(() => parseFrontmatter('---\na: &a [1]\nb: *a\n---\n'));
  assert.throws(() => parseFrontmatter('not frontmatter'));
});

test('C#、CI/CD、空格标签与点路径有稳定且安全的路由', () => {
  for (const name of [
    'C#',
    'CI/CD',
    'GitHub Pages',
    '..',
    'path\\name',
    'name.',
  ]) {
    assert.doesNotMatch(decodeURIComponent(topicSlug(name)), /[/?#\\]/);
    assert.notEqual(decodeURIComponent(topicSlug(name)), '..');
  }
  assert.notEqual(topicSlug('C#'), topicSlug('C'));
  assert.equal(topicSlug(' C# '), topicSlug('c#'));
  assert.notEqual(topicSlug('CI/CD'), topicSlug('ci~2f~cd'));
});
