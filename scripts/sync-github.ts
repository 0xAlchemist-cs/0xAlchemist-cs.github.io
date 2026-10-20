import { readFile, writeFile, rename } from 'node:fs/promises';
import { loadContent } from './content-files';
import { cacheSchema, refreshRepos } from '../src/lib/github';

const { projects, errors } = await loadContent();
if (errors.length) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 1;
} else {
  const path = 'src/data/github-public-cache.json';
  const parsed = cacheSchema.safeParse(
    JSON.parse(await readFile(path, 'utf8')),
  );
  // A malformed cache is not silently overwritten: fix or recover it first.
  if (!parsed.success) {
    console.error('缓存校验失败，未修改文件。');
    process.exitCode = 1;
  } else {
    const names = projects
      .filter((project) => !project.data.draft && !project.data.example)
      .map((project) => project.data.repoFullName!);
    const result = await refreshRepos(
      names,
      parsed.data,
      fetch,
      process.env.GITHUB_TOKEN,
    );
    result.errors.forEach((message) => console.warn(message));
    const rejected =
      process.argv.includes('--strict') && result.errors.length > 0;
    if (rejected) {
      console.error('严格同步失败，原缓存未修改。');
      process.exitCode = 1;
    } else if (JSON.stringify(result.cache) !== JSON.stringify(parsed.data)) {
      const temporary = `${path}.tmp`;
      await writeFile(temporary, JSON.stringify(result.cache, null, 2) + '\n');
      await rename(temporary, path);
    }
    console.log(
      `已检查 ${names.length} 个手工精选项目；失败 ${result.errors.length}。公开元数据仍可离线构建。`,
    );
  }
}
