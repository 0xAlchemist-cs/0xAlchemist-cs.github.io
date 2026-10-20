import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('严格同步遇到部分失败时退出失败且不写入半份更新', async () => {
  const tools = resolve('.tools');
  await mkdir(tools, { recursive: true });
  const root = await mkdtemp(join(tools, 'sync-cli-'));
  try {
    for (const directory of [
      'src/content/posts',
      'src/content/projects',
      'src/data',
    ])
      await mkdir(join(root, directory), { recursive: true });
    for (const name of ['public', 'second'])
      await writeFile(
        join(root, `src/content/projects/${name}.md`),
        `---\nslug: '${name}'\nrepoFullName: 'owner/${name}'\ndisplayName: '${name}'\nsummary: 'CLI fixture project'\n---\n`,
      );
    const path = join(root, 'src/data/github-public-cache.json');
    const original = '{"version":1,"repos":{}}\n';
    await writeFile(path, original);
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        new URL('./fixtures/github-fetch.mjs', import.meta.url).href,
        '--import',
        'tsx',
        fileURLToPath(new URL('../scripts/sync-github.ts', import.meta.url)),
        '--strict',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    assert.equal(child.error, undefined);
    assert.match(
      child.stderr,
      /owner\/second: 同步失败/,
      `必须运行到预设限流响应：${child.stdout}${child.stderr}`,
    );
    assert.equal(
      child.status,
      1,
      `严格同步必须失败，实际输出：${child.stdout}${child.stderr}`,
    );
    assert.equal(
      await readFile(path, 'utf8'),
      original,
      '部分成功不能覆盖原缓存',
    );
  } finally {
    assert.ok(root.startsWith(tools + sep), '只清理工作区内的隔离测试目录');
    await rm(root, { recursive: true, force: true });
  }
});
