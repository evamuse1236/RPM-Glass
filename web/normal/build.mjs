/** Builds web/dist/rpm-normal.html: one file with the CSS, fonts, script and demo fixture inside. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '../dist/rpm-normal.html');

const browserCrypto = {
  name: 'browser-crypto',
  setup(build) {
    build.onResolve({filter: /^node:crypto$/}, () => ({path: 'node-crypto', namespace: 'browser-crypto'}));
    build.onLoad({filter: /.*/, namespace: 'browser-crypto'}, () => ({contents: 'export const randomUUID = () => globalThis.crypto.randomUUID();'}));
  },
};

const script = await esbuild.build({
  entryPoints: [path.join(here, 'app.mjs')], bundle: true, write: false, format: 'iife', platform: 'browser',
  target: 'chrome120', minify: true, legalComments: 'none', plugins: [browserCrypto],
});
const style = await esbuild.build({
  entryPoints: [path.join(here, 'css/index.css')], bundle: true, write: false, minify: true,
  target: 'chrome130', loader: {'.woff2': 'dataurl'},
});

const js = script.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = style.outputFiles[0].text;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>RPM</title>
<style>${css}</style>
</head>
<body>
<script>${js}</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)}: ${(html.length / 1024).toFixed(0)} KB (script ${(js.length / 1024).toFixed(0)} KB, styles and fonts ${(css.length / 1024).toFixed(0)} KB)`);
