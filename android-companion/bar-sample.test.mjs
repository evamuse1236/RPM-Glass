import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFakeDom,FakeElement} from './fake-dom.mjs';
import {STYLE_PARTS} from '../scripts/build-companion-assets.mjs';
import {DESTINATIONS} from './planner/destinations.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const plannerCss = () => ['planner.css', ...STYLE_PARTS['planner.css']].map(read).join('\n');

installFakeDom();
Object.defineProperty(FakeElement.prototype, 'style', {get() { return this.styles ??= {setProperty: (name, value) => { this.styles[name] = value; }}; }});
globalThis.MutationObserver ??= class { observe() {} disconnect() {} };

function mountSettings() {
  const {document} = globalThis;
  const host = document.createElement('div');
  host.ownerDocument = document;
  const page = document.createElement('div');
  page.className = 'settings-page';
  const notice = document.createElement('div');
  notice.className = 'settings-notice';
  page.append(notice);
  host.append(page);
  return host;
}

test('Settings shows a small copy of the tab bar and Add over two task rows, and no explaining line', async () => {
  {
    const {mountClaritySettings} = await import('./planner-clarity.mjs');
    const storage = new Map();
    const host = mountSettings();
    mountClaritySettings(host, {storage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)}, root: globalThis.document.documentElement});
    const sample = host.querySelector('.bar-sample');
    assert.ok(sample, 'the sample sits under the slider');
    assert.equal(sample.getAttribute('aria-hidden'), 'true');
    assert.equal(sample.querySelectorAll('.bar-sample-row').length, 2);
    const tabs = [...sample.querySelectorAll('.bar-sample-tab')];
    assert.deepEqual(tabs.map(tab => tab.querySelector('.bar-sample-label').textContent), DESTINATIONS.map(([, , label]) => label));
    assert.deepEqual(tabs.map(tab => tab.querySelector('.ms').textContent), DESTINATIONS.map(([, symbol]) => symbol));
    assert.equal(sample.querySelectorAll('.bar-sample-tab.is-on').length, 1);
    assert.ok(sample.querySelector('.bar-sample-dock > .bar-sample-add'), 'the + sits beside the bar');
    assert.doesNotMatch(host.textContent, /How much of the page/);
  }
});

test('the sample takes the real bar\'s glass, and its second row passes under the bar', () => {
  const css = plannerCss();
  assert.match(css, /:root\[data-bar-glass=true\] :is\(#nav-bar, \.bar-sample-bar\) \{/);
  assert.match(css, /\.bar-sample-dock \{ position: absolute; inset: auto var\(--s3\) var\(--s3\);/);
  assert.match(css, /\.bar-sample-row \{[^}]*block-size: 56px;/);
  assert.match(css, /\.bar-sample-bar \{[^}]*block-size: 56px;/);
  assert.doesNotMatch(read('planner-clarity.mjs'), /How much of the page/);
});

test('a Settings value stays on one line and a file name ellipsizes before its extension', async () => {
  const css = read('planner-menus.css');
  const value = css.match(/\.settings-value \{([^}]*)\}/)[1];
  assert.match(value, /white-space: nowrap/);
  assert.match(value, /text-overflow: ellipsis/);
  assert.doesNotMatch(css, /overflow-wrap: anywhere/);
  assert.match(css, /\.settings-file-name \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.settings-file-ext \{ flex: none; \}/);
  {
    const {valueText} = await import('./settings.mjs');
    const file = valueText('konosuba_chiisana.mp3');
    assert.equal(file.textContent, 'konosuba_chiisana.mp3');
    assert.equal(file.querySelector('.settings-file-name').textContent, 'konosuba_chiisana');
    assert.equal(file.querySelector('.settings-file-ext').textContent, '.mp3');
    const plain = valueText('Permission needed');
    assert.equal(plain.textContent, 'Permission needed');
    assert.equal(plain.querySelector('.settings-file-name'), null);
  }
});
