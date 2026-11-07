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
  assert.doesNotMatch(menu, /List view|Day view|setDayLayout/, 'the layout switch is in the top bar, not the menu');
});

test('Today\'s top bar switches List view and Day view beside Search', () => {
  const shell = read('planner/shell.mjs');
  const bar = shell.slice(shell.indexOf('function rootBar'));
  assert.match(bar, /if \(state\.tab === 'today'\) \{\s*const list = state\.dayLayout === 'list';\s*tools\.append\(iconButton\(list \? 'view_day' : 'view_agenda', list \? 'Day view' : 'List view',\s*\(\) => actions\.setDayLayout\(list \? 'day' : 'list'\)\)\);\s*\}\s*tools\.append\(iconButton\('search', 'Search'/);
});

test('the menu has a 1dp outline-variant edge, so it stands off the page in light', () => {
  const css = read('planner-menus.css');
  const menu = css.match(/\n\.menu \{([^}]*)\}/)?.[1] ?? '';
  assert.match(menu, /border: 1px solid var\(--outline-variant\);/);
  assert.match(menu, /background: var\(--surface-container-high\);/);
});
