import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve('scripts/share-art.ts');
const run = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
    encoding: 'utf8',
  });

test('CLI refuses unknown commands, duplicate flags and missing approval records', () => {
  for (const args of [
    ['unknown'],
    ['approve', '--candidate', 'reports/share-art/unused'],
    ['compose', '--unknown', 'value'],
    [
      'prepare',
      'blog/example',
      '--out',
      'reports/share-art/a',
      '--out',
      'reports/share-art/b',
    ],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /unknown|confirmation|required|duplicate/i);
    assert.doesNotMatch(
      result.stderr,
      /Cannot find module|ERR_MODULE_NOT_FOUND/,
    );
  }
});

test('CLI help explains generation is operated by Codex and does not approve an image', () => {
  const result = run('--help');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /prepare/);
  assert.match(result.stdout, /compose/);
  assert.match(result.stdout, /approve/);
  assert.match(result.stdout, /Codex/);
});
