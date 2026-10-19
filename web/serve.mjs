/** Serves web/ on a free local port: npm run web:serve, then open the printed link. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const TYPES = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf'};

export function resolvePath(url) {
  const name = decodeURIComponent(new URL(url, 'http://local').pathname);
  const file = path.resolve(root, '.' + (name.endsWith('/') ? name + 'index.html' : name));
  return file.startsWith(root + path.sep) || file === root ? file : null;
}

export function listing() {
  const dist = path.join(root, 'dist');
  const pages = fs.existsSync(dist) ? fs.readdirSync(dist).filter(f => f.endsWith('.html')) : [];
  const links = pages.map(p => `<li><a href="/dist/${p}">${p}</a></li>`).join('') || '<li>No builds yet. Run npm run web:normal.</li>';
  return `<!doctype html><meta charset="utf-8"><title>RPM web</title><h1>RPM web builds</h1><ul>${links}</ul>`;
}

export function createServer() {
  return http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, {'content-type': TYPES['.html']});
      return res.end(listing());
    }
    const file = resolvePath(req.url);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, {'content-type': 'text/plain'});
      return res.end('Not found');
    }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store'});
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(Number(process.env.PORT) || 0, '127.0.0.1', () => {
    const {port} = server.address();
    console.log(`RPM web is at http://127.0.0.1:${port}/`);
  });
}
