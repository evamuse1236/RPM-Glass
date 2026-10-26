import {build} from 'esbuild';
import {copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleOptions, shippedText} from '../scripts/build-companion-assets.mjs';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const out = here('./dist/');
const server = process.env.RPM_SYNC_SERVER ?? null;
rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
await build({...bundleOptions, entryPoints: [here('./app/main.mjs')], minify: true, outfile: `${out}app.js`,
  define: {'globalThis.RPM_SYNC_SERVER': JSON.stringify(server)}});
for (const file of ['planner.css', 'review.css']) writeFileSync(`${out}${file}`, shippedText(file));
for (const [from, to] of [['./app/index.html', 'index.html'], ['./app/web.css', 'web.css'], ['./app/task-pane.css', 'task-pane.css'], ['./app/wide-pages.css', 'wide-pages.css'],['../android-companion/theme.css', 'theme.css'],
  ['../android-companion/assets/fonts/google-sans-flex.woff2', 'google-sans-flex.woff2'], ['../android-companion/assets/fonts/material-symbols-rounded.woff2', 'material-symbols-rounded.woff2']])
  copyFileSync(here(from), `${out}${to}`);
console.log(`Built web/dist for ${server ?? 'the same origin'}`);

if (!server) {
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2'};
  const files = readdirSync(out).map(name => `${JSON.stringify(`/${name}`)}: {type: ${JSON.stringify(types[extname(name)])}, body: bytes(${JSON.stringify(readFileSync(`${out}${name}`).toString('base64'))})}`);
  const site = here('./dist-site/');
  rmSync(site, {recursive: true, force: true});
  const contents = `import {siteWorker} from './site-worker.mjs';
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export default siteWorker({${files.join(',')}});`;
  await build({stdin: {resolveDir: here('.'), sourcefile: 'site-entry.mjs', contents}, bundle: true, format: 'esm', target: 'es2022', minify: true, outfile: `${site}server/index.js`});
  console.log('Built web/dist-site/server/index.js for ChatGPT Sites');
}
