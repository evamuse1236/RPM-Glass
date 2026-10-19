/** Screenshots of the built page at the brief's sizes and states, into web/evidence/pixel. Run after `npm run web:pixel`. */
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {openChrome, wait} from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = pathToFileURL(path.join(here, '..', 'dist', 'rpm-pixel.html')).href;
const dir = path.join(here, '..', 'evidence', 'pixel');
const NOW = 'now=2026-10-19T10:05:00%2B05:30';

const SHOTS = [
  ['01-desktop-1440', 1440, 900, ''],
  ['02-laptop-1024', 1024, 768, ''],
  ['03-tablet-768', 768, 1024, ''],
  ['04-phone-390', 390, 844, ''],
  ['05-pending-1440', 1440, 900, 'state=pending'],
  ['06-rejected-1440', 1440, 900, 'state=reject'],
  ['07-conflict-1440', 1440, 900, 'state=conflict'],
  ['08-stale-1440', 1440, 900, 'state=stale'],
  ['09-unlinked-1440', 1440, 900, 'state=unlinked'],
  ['10-zoom200-1440', 720, 450, '', 2],
  ['11-offline-1440', 1440, 900, 'state=offline'],
  ['12-empty-1440', 1440, 900, 'state=empty'],
  ['13-loading-1440', 1440, 900, 'state=loading'],
  ['14-needs-answer-1440', 1440, 900, 'state=needs-answer'],
  ['15-phone-390-pending', 390, 844, 'state=pending'],
];

const only = process.argv.slice(2);
const tab = await openChrome();
for (const [name, width, height, query, scale = 1] of SHOTS) {
  if (only.length && !only.some(o => name.includes(o))) continue;
  await tab.size(width, height, scale);
  await tab.open(`${page}?${[NOW, query].filter(Boolean).join('&')}`);
  await wait(400);
  console.log(await tab.shot(path.join(dir, `${name}.png`)));
  if (process.env.FULL) console.log(await tab.shot(path.join(dir, `${name}-full.png`), {full: true}));
}
if (tab.problems.length) console.log('Console problems:\n' + tab.problems.join('\n'));
await tab.close();
