import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stringify } from 'yaml';
import { parseFrontmatter, sourceFiles } from './content-files';

// Build real test content in a disposable, ignored workspace, never in the author's source tree.
await mkdir('.tools', { recursive: true });
await mkdir('reports', { recursive: true });
const root = await mkdtemp(join(resolve('.tools'), 'integration-'));
for (const file of [
  'src',
  'public',
  'scripts',
  'astro.config.mjs',
  'tsconfig.json',
  'package.json',
])
  await cp(file, join(root, file), { recursive: true });
// Keep fixture pagination independent of the author's growing content library.
// Only the disposable copies are hidden; source posts and projects stay intact.
for (const collection of ['posts', 'projects']) {
  for (const file of await sourceFiles(join(root, 'src/content', collection))) {
    const parsed = parseFrontmatter(await readFile(file, 'utf8'));
    const data = parsed.data as Record<string, unknown>;
    await writeFile(
      file,
      `---\n${stringify({ ...data, draft: true })}---\n${parsed.body}`,
    );
  }
}
await symlink(
  resolve('node_modules'),
  join(root, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
await cp(
  'tests/fixtures/unpublished-note.md',
  join(root, 'src/content/posts/unpublished-note.md'),
);
const visible = {
  title: '集成测试：让中文搜索找到技术记录',
  description:
    '仅存在于隔离测试构建中的文章，用于验证中文全文搜索、元数据、关联项目和发布过滤。',
  slug: 'integration-visible',
  publishedAt: '2026-09-01',
  category: '搜索测试',
  tags: ['中文检索', 'Astro', 'C#', 'CI/CD', 'GitHub Pages'],
  relatedRepos: ['Test-Owner/Test-Repo', 'other-owner/other-public'],
};
await writeFile(
  join(root, 'src/content/posts/integration-visible.md'),
  `---\n${stringify(visible)}---\n\n## 中文检索\n\n知识花园里的量子炼金术，用于测试中文搜索。\n\n## 可复制代码\n\n\u0060\u0060\u0060ts\nconst answer = 42;\n\u0060\u0060\u0060\n\n[关联项目](/projects/integration-project/)\n`,
);
for (let index = 0; index < 8; index++) {
  const data = {
    ...visible,
    title: `分页集成测试文章 ${index + 1}`,
    description: `隔离构建中的第 ${index + 1} 篇分页测试文章，用于检查列表分页和每页元数据唯一性。`,
    slug: `integration-page-${index + 1}`,
    publishedAt: `2026-08-${String(index + 1).padStart(2, '0')}`,
    relatedRepos: [],
  };
  await writeFile(
    join(root, `src/content/posts/integration-page-${index + 1}.md`),
    `---\n${stringify(data)}---\n\n## 测试正文\n\n这是隔离构建中的分页样本。\n\n## 验证说明\n\n不会写入正式网站内容。\n`,
  );
}
await writeFile(
  join(root, 'src/content/projects/integration-project.md'),
  `---\n${stringify({ slug: 'integration-project', repoFullName: 'test-owner/test-repo', displayName: '关联项目集成测试', summary: '仅存在于隔离构建中的项目，用于验证文章与项目双向关联。', techStack: ['TypeScript'], featured: true, relatedPosts: [] })}---\n\n## 测试项目\n\n用于隔离构建，绝不发布。\n`,
);
function run(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
  if (result.error || result.status !== 0)
    throw new Error('隔离构建检查失败。');
}
run(['scripts/astro.mjs', 'build']);
run(['scripts/build-search.mjs']);
run(['--import', 'tsx', 'scripts/check-generated-site.ts']);
await writeFile(
  'reports/browser-build.json',
  JSON.stringify({ root, dist: join(root, 'dist') }, null, 2),
);
console.log('隔离测试构建已准备，正式 dist/ 和作者内容未被修改。');
