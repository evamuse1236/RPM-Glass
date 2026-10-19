/** Screenshots of web/dist/rpm-normal.html at exact viewport sizes: node web/normal/verify/shots.mjs [name-filter]. */
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {launch} from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PAGE = pathToFileURL(path.join(here, '../../dist/rpm-normal.html')).href;
export const OUT = path.join(here, '../../evidence/normal');

export const SHOTS = [
  ['01-today-1440', 1440, 900, '?at=10:15#/today'],
  ['02-today-1024', 1024, 768, '?at=10:15#/today'],
  ['03-today-768', 768, 1024, '?at=10:15#/today'],
  ['04-today-390', 390, 844, '?at=10:15#/today'],
  ['05-week-1440', 1440, 900, '?at=10:15#/week'],
  ['06-blocks-1440', 1440, 900, '?at=10:15#/blocks/block-1'],
  ['07-inbox-1440', 1440, 900, '?at=10:15#/inbox'],
  ['08-pending-1440', 1440, 900, '?state=pending&at=10:15#/today'],
  ['09-rejected-1440', 1440, 900, '?state=reject&at=10:15#/today'],
  ['10-conflict-1440', 1440, 900, '?state=conflict&at=10:15#/today'],
  ['11-stale-1440', 1440, 900, '?state=stale&at=10:15#/today'],
  ['12-unlinked-1440', 1440, 900, '?state=unlinked#/today'],
  ['13-link-1440', 1440, 900, '?state=unlinked#/link'],
  ['14-offline-1440', 1440, 900, '?state=offline&at=10:15#/today'],
  ['15-needs-answer-1440', 1440, 900, '?state=needs-answer&at=10:15#/today'],
  ['16-empty-1440', 1440, 900, '?state=empty&at=10:15#/today'],
  ['17-loading-1440', 1440, 900, '?state=loading#/today'],
  ['18-week-1024', 1024, 768, '?at=10:15#/week'],
  ['19-week-768', 768, 1024, '?at=10:15#/week'],
  ['20-week-390', 390, 844, '?at=10:15#/week'],
  ['21-blocks-1024', 1024, 768, '?at=10:15#/blocks/block-1'],
  ['22-blocks-390', 390, 844, '?at=10:15#/blocks/block-1'],
  ['23-inbox-390', 390, 844, '?at=10:15#/inbox'],
  ['24-today-1440-zoom200', 720, 450, '?at=10:15#/today', 2],
  ['25-week-1440-zoom200', 720, 450, '?at=10:15#/week', 2],
  ['26-today-390-zoom200', 195, 422, '?at=10:15#/today', 2],
  ['27-today-1440-dark', 1440, 900, '?at=10:15#/today', 1, true],
  ['28-inbox-768', 768, 1024, '?at=10:15#/inbox'],
];

export async function shootAll(list) {
  const page = await launch();
  const done = [];
  try {
    for (const [name, width, height, query, scale = 1, dark = false] of list) {
      await page.goto(PAGE + query, {width, height, scale, dark});
      const overflow = await page.eval('document.documentElement.scrollWidth - innerWidth');
      done.push({file: await page.shot(path.join(OUT, name + '.png')), overflow});
    }
  } finally {
    await page.close();
  }
  return {done, errors: page.errors};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const filter = process.argv[2] ?? '';
  const {done, errors} = await shootAll(SHOTS.filter(s => s[0].includes(filter)));
  for (const {file, overflow} of done) console.log(file, overflow > 0 ? `OVERFLOW ${overflow}px` : '');
  if (errors.length) console.log('page errors:', errors);
}
