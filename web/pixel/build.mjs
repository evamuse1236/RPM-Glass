import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'dist', 'rpm-pixel.html');
const target = ['chrome123', 'safari17.5', 'firefox128'];

const browserCrypto = {
  name: 'browser-crypto',
  setup(b) {
    b.onResolve({filter: /^node:crypto$/}, () => ({path: 'crypto', namespace: 'browser-crypto'}));
    b.onLoad({filter: /.*/, namespace: 'browser-crypto'}, () => ({contents: 'export const randomUUID = () => globalThis.crypto.randomUUID();', loader: 'js'}));
  },
};

const [js, css] = await Promise.all([
  build({entryPoints: [path.join(here, 'main.mjs')], bundle: true, format: 'iife', platform: 'browser', target,
    minify: true, write: false, plugins: [browserCrypto], legalComments: 'none'}),
  build({entryPoints: [path.join(here, 'styles.css')], bundle: true, minify: true, write: false, target,
    loader: {'.woff2': 'dataurl'}}),
]);

const inline = (text, tag) => text.replaceAll(`</${tag}`, `<\\/${tag}`);
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8')
  .replace('/*STYLE*/', () => inline(css.outputFiles[0].text, 'style'))
  .replace('/*SCRIPT*/', () => inline(js.outputFiles[0].text, 'script'));
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)} ${(html.length / 1024).toFixed(0)} KB`);
