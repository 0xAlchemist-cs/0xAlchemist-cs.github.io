import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { searchHTML } from '../scripts/search-html.mjs';
import { searchTerms } from '../src/lib/search-api';

test('连续中文保留短语边界，多个关键词可分别求交集，英文沿用原查询', () => {
  for (const [query, expected] of [
    ['回放', ['"回 放"']],
    ['图文信号回放', ['"图 文 信 号 回 放"']],
    ['Python 回放', ['Python', '"回 放"']],
    ['回放Python', ['"回 放"', 'Python']],
    ['信号 回放', ['"信 号"', '"回 放"']],
    ['"Python 回放"', ['"Python 回 放"']],
    ['Signal Vision', ['Signal Vision']],
    ['C#', ['C#']],
  ] as const)
    assert.deepEqual(searchTerms(query), expected, query);
});

test('索引副本只处理可检索文本，保留地址、锚点、转义和忽略区', () => {
  const source =
    '<html lang="zh-CN"><nav>导航文字</nav><article data-pagefind-body><h1 id="回放">回放</h1><p>&lt;回放&gt;&amp;复习</p><a href="/tags/回放/">源码</a><aside data-pagefind-ignore>忽略区域</aside><script>const word="回放";</script></article></html>';
  const output = searchHTML(source);
  assert.ok(output);
  const document = parse(output);
  assert.match(document.querySelector('h1')!.text, /回\u200b放/);
  assert.equal(document.querySelector('h1')!.id, '回放');
  assert.equal(
    document.querySelector('a')!.getAttribute('href'),
    '/tags/回放/',
  );
  assert.equal(
    document.querySelector('p')!.text.replace(/\u200b/g, ''),
    '<回放>&复习',
  );
  assert.equal(document.querySelector('nav')!.text, '导航文字');
  assert.equal(document.querySelector('aside')!.text, '忽略区域');
  assert.equal(document.querySelector('script')!.text, 'const word="回放";');
  assert.equal(document.querySelectorAll('script').length, 1);
  assert.equal(searchHTML('<html><nav>没有正式正文</nav></html>'), null);
});
