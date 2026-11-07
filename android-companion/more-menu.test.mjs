import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const labels = block => [...block.matchAll(/label: '([^']+)'|\{divider: true\}|\.\.\.page\b|menuItems/g)]
  .map(m => m[1] ?? (m[0].startsWith('{') ? '—' : m[0] === '...page' ? 'page' : 'web'));

test('More options leads with Weekly review, then the page\'s places, then storage and Settings', () => {
  const shell = read('planner/shell.mjs');
  const menu = shell.slice(shell.indexOf('function rootMenu'), shell.indexOf('function rootBar'));
  const items = menu.slice(menu.indexOf('const items = ['));
  assert.deepEqual(labels(items.slice(0, items.indexOf('];'))),
    ['Weekly review', '—', 'page', '—', 'Archive', 'Trash', 'web', 'Settings']);
  assert.doesNotMatch(menu, /List view|Day view|setDayLayout/, 'the layout switch is under the date title, not the menu');
});

test('Today\'s List view and Day view switch lives once, in Go to date under the date title', () => {
  const shell = read('planner/shell.mjs');
  const bar = shell.slice(shell.indexOf('function rootBar'), shell.indexOf('function detailBar'));
  assert.doesNotMatch(bar, /List view|Day view|view_agenda|setDayLayout/, 'the top bar holds Search and More options on every root');
  const picker = read('planner/calendar-ui.mjs');
  assert.match(picker.slice(picker.indexOf('export function datePicker')),
    /labelButton\(list \? 'view_day' : 'view_agenda', list \? 'Day view' : 'List view'/);
});

test('the menu is one plain M3 surface: surface-container-high lifted by level 2, with no outline under the shadow', () => {
  const css = read('planner-menus.css');
  const menu = css.match(/\n\.menu \{([^}]*)\}/)?.[1] ?? '';
  assert.match(menu, /background: var\(--surface-container-high\);/);
  assert.match(menu, /box-shadow: var\(--elev-2\);/);
  assert.doesNotMatch(menu, /border:/);
});
