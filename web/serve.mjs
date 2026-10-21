import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = +(process.env.PORT ?? 5178);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2'};
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://local').pathname;
  const file = resolve(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root.replace(/[/]$/, '') + sep)) return response.writeHead(404).end('Not found');
  const body = await readFile(file).catch(() => null);
  if (!body) return response.writeHead(404).end('Not found');
  response.writeHead(200, {'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store'}).end(body);
}).listen(port, '127.0.0.1', () => console.log(`RPM web on http://127.0.0.1:${port}`));
