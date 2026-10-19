import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? join(import.meta.dirname, 'whole-day');
const tickets = Object.fromEntries(
  readdirSync(join(dir, 'tickets')).filter(f => f.endsWith('.md'))
    .map(f => [f.slice(0, -3), readFileSync(join(dir, 'tickets', f), 'utf8')]));
const snapshot = { builtAt: new Date().toISOString(), map: readFileSync(join(dir, 'map.md'), 'utf8'), tickets };
const json = JSON.stringify(snapshot).replace(/</g, '\\u003c');
const htmlPath = join(dir, 'map.html');
const html = readFileSync(htmlPath, 'utf8').replace(
  /<script id="snapshot" type="application\/json">[\s\S]*?<\/script>/,
  () => `<script id="snapshot" type="application/json">${json}</script>`);
writeFileSync(htmlPath, html);
console.log(`snapshot: map + ${Object.keys(tickets).length} tickets -> ${htmlPath}`);
