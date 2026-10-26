import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('index.html');
const sheetJs = read('capture-sheet.mjs');
const sheet = html.slice(html.indexOf('<section id="sheet"'), html.indexOf('</section>', html.indexOf('<section id="sheet"')));
const options = [...sheet.matchAll(/<button[^>]*data-go="([^"]+)"[^>]*>.*?<span class="row-title">([^<]+)<\/span><\/button>/g)]
  .map(([, go, label]) => ({go, label}));

test('Capture\'s More button is an overflow, not a plus', () => {
  const more = html.match(/<button id="more"[^>]*>.*?<\/button>/)?.[0] ?? '';
  assert.match(more, /aria-label="More"/);
  assert.match(more, /<span class="ms" aria-hidden="true">more_vert<\/span>/);
  assert.doesNotMatch(html, /id="plus"|>add</, 'no + icon in Capture');
});

test('every option in Capture\'s More sheet opens a real place: Planner, History, Context, Settings', () => {
  assert.deepEqual(options.map(o => o.label), ['Planner', 'History', 'Context', 'Settings']);
  assert.equal((sheet.match(/<button/g) ?? []).length, options.length, 'nothing else in the sheet');
  for (const {go} of options) assert.match(sheetJs, new RegExp(`\\b${go}:`), `${go} has a handler`);
});

test('no Capture option says it is not built', () => {
  for (const text of [html, sheetJs, read('capture-app.mjs')]) {
    assert.doesNotMatch(text, /built yet|not built|coming soon|UNBUILT/i);
  }
  assert.doesNotMatch(html, /id="toast"/);
});
