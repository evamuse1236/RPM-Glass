import test from 'node:test';
import assert from 'node:assert/strict';
import {syncAttributes} from './rerender-keys.mjs';

/** An element whose style attribute cannot be written, as under the page's CSP (style-src 'self'). */
function element(attributes, cssText = '') {
  const map = new Map(Object.entries(attributes));
  return {
    style: {cssText},
    get attributes() { return [...map].map(([name, value]) => ({name, value})); },
    hasAttribute: name => map.has(name),
    getAttribute: name => map.get(name) ?? null,
    removeAttribute: name => map.delete(name),
    setAttribute(name, value) {
      if (name === 'style') throw new Error('CSP blocks a written style attribute');
      map.set(name, value);
    },
  };
}

test('a re-render carries styles through the CSSOM, never as a written style attribute', () => {
  const old = element({class: 'spine-row', style: '--h: 56px;', 'data-old': '1'}, '--h: 56px;');
  const next = element({class: 'spine-row done', style: '--h: 120px;'}, '--h: 120px;');
  syncAttributes(old, next);
  assert.equal(old.style.cssText, '--h: 120px;');
  assert.equal(old.getAttribute('class'), 'spine-row done');
  assert.equal(old.hasAttribute('data-old'), false);
});
