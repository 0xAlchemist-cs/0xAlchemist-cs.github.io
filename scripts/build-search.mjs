import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'node-html-parser';

async function hasSearchableContent(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && (await hasSearchableContent(path))) return true;
    if (
      entry.isFile() &&
      entry.name.endsWith('.html') &&
      parse(await readFile(path, 'utf8')).querySelector('[data-pagefind-body]')
    )
      return true;
  }
  return false;
}
// A newly created site has no real content. Do not index its navigation or make
// that intentional empty state a build failure. Astro clears dist before build.
if (!(await hasSearchableContent('dist'))) {
  console.log(
    '没有公开文章或项目，跳过全文索引；空状态构建正常，发布门禁仍要求真实文章。',
  );
} else {
  const packageRoot = new URL('../node_modules/pagefind/', import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL('package.json', packageRoot), 'utf8'),
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL(manifest.bin, packageRoot)),
      '--site',
      'dist',
      '--root-selector',
      '[data-pagefind-body]',
    ],
    { stdio: 'inherit' },
  );
  if (result.error || result.status !== 0)
    process.exitCode = result.status ?? 1;
}
