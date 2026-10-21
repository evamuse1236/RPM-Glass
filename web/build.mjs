import {build} from 'esbuild';
import {copyFileSync, mkdirSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const here = path => fileURLToPath(new URL(path, import.meta.url));
const out = here('./dist/');
const server = process.env.RPM_SYNC_SERVER ?? null;
rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
await build({entryPoints: [here('./app/main.mjs')], bundle: true, format: 'esm', target: 'es2022', minify: true, outfile: `${out}app.js`,
  define: {'globalThis.RPM_SYNC_SERVER': JSON.stringify(server)}});
for (const [from, to] of [['./app/index.html', 'index.html'], ['./app/site.css', 'site.css'], ['../android-companion/theme.css', 'theme.css'],
  ['../android-companion/assets/fonts/google-sans-flex.woff2', 'google-sans-flex.woff2'], ['../android-companion/assets/fonts/material-symbols-rounded.woff2', 'material-symbols-rounded.woff2']])
  copyFileSync(here(from), `${out}${to}`);
console.log(`Built web/dist for ${server ?? 'the same origin'}`);
