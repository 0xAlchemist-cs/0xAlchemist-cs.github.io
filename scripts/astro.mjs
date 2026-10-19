import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const packageRoot = new URL('../node_modules/astro/', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('package.json', packageRoot), 'utf8'),
);
const entry = new URL(
  typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.astro,
  packageRoot,
);
const child = spawn(
  process.execPath,
  [fileURLToPath(entry), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  },
);
child.on('error', () => {
  console.error('无法启动 Astro，请先安装依赖。');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
