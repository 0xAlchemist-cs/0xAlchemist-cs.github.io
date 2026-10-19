import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
const { dist } = JSON.parse(
  await readFile('reports/browser-build.json', 'utf8'),
) as { dist: string };
const root = resolve(dist);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    );
    let file = resolve(root, '.' + path);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    response.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(join(root, '404.html')));
  }
}).listen(4322, '127.0.0.1', () =>
  console.log('隔离静态测试站点：http://127.0.0.1:4322'),
);
