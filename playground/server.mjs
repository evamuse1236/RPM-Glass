import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {context} from 'esbuild';
import {bundleOptions, shippedText} from '../scripts/build-companion-assets.mjs';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {vectorToMaskSvg, colorsToCss} from './android-res.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const from = (...parts) => path.join(root, ...parts);
const surfaceJava = from('app/src/main/java/com/rpm/prototype/CompanionSurface.java');
const TYPES = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png',
  '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml'};

const surface = () => {
  const java = fs.readFileSync(surfaceJava, 'utf8');
  return {assets: new Set([...java.match(/ASSETS=Set\.of\(([^)]*)\)/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1])),
    csp: java.match(/CSP="([^"]+)"/)[1]};
};

const bundle = entry => context({...bundleOptions, ...entry, write: false, sourcemap: 'inline', logLevel: 'silent'});
const bundlers = {'runtime.js': await bundle({}), 'notch-actions.js': await bundle({entryPoints: ['android-companion/notch-actions.mjs']})};

const PAGE_HOOKS = '<script src="/__playground/emulate.js"></script>\n<script type="module" src="/__playground/fake-native.mjs"></script>\n';

async function phoneAsset(name) {
  if (bundlers[name]) return (await bundlers[name].rebuild()).outputFiles[0].contents;
  if (name === 'butterfly.png') return fs.readFileSync(from('android-companion/assets', name));
  if (name.endsWith('.woff2')) return fs.readFileSync(from('android-companion/assets/fonts', name));
  const text = shippedText(name);
  return name.endsWith('.html') ? text.replace('<script type="module" src="/runtime.js">', PAGE_HOOKS + '$&') : text;
}

function playgroundAsset(name) {
  if (name === 'seed.json') return JSON.stringify(seedStore(new Date()).data);
  const icon = name.match(/^icon\/([a-z_]+)\.svg$/);
  if (icon) return vectorToMaskSvg(fs.readFileSync(from('app/src/main/res/drawable', icon[1] + '.xml'), 'utf8'));
  if (name === 'widget-butterfly.png') return fs.readFileSync(from('app/src/main/res/drawable-nodpi/butterfly.png'));
  if (name === 'android-colors.css') return colorsToCss(fs.readFileSync(from('app/src/main/res/values/colors.xml'), 'utf8'),
    fs.readFileSync(from('app/src/main/res/values-night/colors.xml'), 'utf8'));
  const file = path.join(here, path.normalize(name));
  if (!file.startsWith(here + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return fs.readFileSync(file);
}

async function respond(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const pathname = url.pathname === '/' ? '/__playground/shell.html' : url.pathname;
  const {assets, csp} = surface();
  let body = null, name = pathname.slice(1);
  if (pathname.startsWith('/__playground/')) body = playgroundAsset(name = pathname.slice('/__playground/'.length));
  else if (assets.has(name)) {
    body = await phoneAsset(name);
    if (name.endsWith('.html')) res.setHeader('content-security-policy', csp);
  }
  if (body == null) {
    res.writeHead(404, {'content-type': 'text/plain'});
    return res.end(`Not served: ${pathname}. The phone only serves the files listed in CompanionSurface.ASSETS.`);
  }
  res.writeHead(200, {'content-type': TYPES[path.extname(name)] ?? 'application/octet-stream', 'cache-control': 'no-store'});
  res.end(body);
}

const server = http.createServer((req, res) => respond(req, res).catch(error => {
  console.error(error);
  res.writeHead(500, {'content-type': 'text/plain'});
  res.end(String(error?.stack ?? error));
}));

function listen(port, triesLeft) {
  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && triesLeft > 0) return listen(port + 1, triesLeft - 1);
    throw error;
  });
  server.listen(port, '127.0.0.1', () => console.log(`RPM playground: http://127.0.0.1:${port}/`));
}
listen(Number(process.argv[2] ?? process.env.PORT ?? 4180), 10);
