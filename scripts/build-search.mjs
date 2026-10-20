import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createIndex, close } from 'pagefind';
import ts from 'typescript';
import { searchHTML } from './search-html.mjs';

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}
const pages = [];
for (const path of await htmlFiles('dist')) {
  const content = searchHTML(await readFile(path, 'utf8'));
  if (content !== null) pages.push({ path, content });
}
if (!pages.length) {
  console.log(
    '没有公开文章或项目，跳过全文索引；空状态构建正常，发布门禁仍要求真实文章。',
  );
} else {
  try {
    const { index, errors } = await createIndex({
      rootSelector: '[data-pagefind-body]',
    });
    if (!index || errors.length) throw new Error(errors.join('\n'));
    for (const { path, content } of pages) {
      const url =
        '/' +
        relative('dist', path)
          .split(sep)
          .join('/')
          .replace(/index\.html$/, '');
      const result = await index.addHTMLFile({ url, content });
      if (result.errors.length) throw new Error(result.errors.join('\n'));
    }
    const result = await index.writeFiles({ outputPath: 'dist/pagefind' });
    if (result.errors.length) throw new Error(result.errors.join('\n'));
    const source = await readFile('src/lib/search-api.ts', 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        removeComments: true,
      },
      reportDiagnostics: true,
    });
    if (output.diagnostics?.length) throw new Error('搜索适配模块编译失败。');
    await mkdir('dist/search-api', { recursive: true });
    await writeFile('dist/search-api/pagefind.js', output.outputText);
    console.log(
      `Pagefind: indexed ${pages.length} public pages with consistent Han-character boundaries.`,
    );
  } finally {
    await close();
  }
}
