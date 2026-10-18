import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectSelectors, appLabels, selectorProblem} from './lib/selectors.mjs';

const skill = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(skill, '../../..');
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

test('collects literal lookups, including multiline calls, without reading comments or dynamic names', () => {
  const selectors = collectSelectors('calls.mjs', `
    tapElement(serial, cdpPort, {name: 'More: planner, history, settings', role: 'button'});
    openMenuItem(serial, cdpPort, 'Planner');
    t.do('tap', '--role', 'combobox', '--name', 'Add a task to the Plan');
    t.do('wait',
      '--name', "Purpose", '--role', 'textbox');
    t.do('scroll', 'down', '--name', 'Scroll target');
    t.do('tap', '--name', task.title);
    // t.do('tap', '--name', 'Old comment');
  `);
  assert.deepEqual(selectors.map(({name, role}) => ({name, role})), [
    {name: 'More: planner, history, settings', role: 'button'}, {name: 'Planner', role: 'button'},
    {name: 'Add a task to the Plan', role: 'combobox'}, {name: 'Purpose', role: 'textbox'},
    {name: 'Scroll target', role: undefined},
  ]);
  assert.match(selectors[3].call, /calls.mjs:5.*t.do/s);
});

test('a renamed label fails with the rpmctl call to update, even if an old comment remains', () => {
  const [selector] = collectSelectors('scenario.mjs', `t.do('tap', '--role', 'button', '--name', 'Send');`);
  const before = appLabels('index.html', '<button aria-label="Send">Send</button>');
  assert.equal(selectorProblem(selector, [before]), null);
  const after = appLabels('index.html', '<!-- Send --><button aria-label="Submit">Submit</button>');
  assert.throws(() => assert.equal(selectorProblem(selector, [after]), null), /scenario.mjs:1.*t.do.*Send/s);
  assert.match(selectorProblem(selector, [after]), /Update this rpmctl call/);
});

test('special roles must occur beside the name in app source, rather than in another file', () => {
  const [selector] = collectSelectors('plan.mjs', `t.do('tap', '--role', 'combobox', '--name', 'Add a task');`);
  const source = `input.setAttribute('aria-label', 'Add a task to the Plan'); input.setAttribute('role', 'combobox');`;
  assert.equal(selectorProblem(selector, [appLabels('field.mjs', source)]), null);
  const changed = appLabels('field.mjs', source.replace("'combobox'", "'textbox'"));
  const unrelated = appLabels('other.mjs', `other.setAttribute('role', 'combobox');`);
  assert.match(selectorProblem(selector, [changed, unrelated]), /does not set role "combobox".*same source file/);
  assert.equal(selectorProblem(selector, [appLabels('inline.mjs', 'const field = `<input role="combobox" aria-label="Add a task">`;')]), null);
});

test('names can come from text, placeholders, labels or aria-labels', () => {
  const sources = [appLabels('page.html', '<label>Purpose</label><input placeholder="Task"><p>Saved</p>'),
    appLabels('page.mjs', `button.setAttribute('aria-label', 'Open'); el('p', '', 'Your words are saved');`)];
  for (const name of ['Purpose', 'Task', 'Saved', 'Open', 'Your words are saved'])
    assert.equal(selectorProblem({name, call: 'fixture'}, sources), null);
});

const sources = files(path.join(root, 'android-companion'))
  .filter(file => /\.(mjs|html)$/.test(file) && !file.endsWith('.test.mjs'))
  .map(file => appLabels(path.relative(root, file), fs.readFileSync(file, 'utf8')));
const selectors = [path.join(skill, 'rpmctl.mjs'), ...files(path.join(skill, 'lib')), ...files(path.join(skill, 'scenarios'))]
  .filter(file => file.endsWith('.mjs'))
  .flatMap(file => collectSelectors(path.relative(root, file), fs.readFileSync(file, 'utf8')));

test('rpmctl has literal selectors to check', () => assert.ok(selectors.length >= 10, 'No rpmctl selectors collected; check the lookup call shapes.'));
for (const selector of selectors) test(`app selector ${selector.role ?? '*'} "${selector.name}" at ${selector.call.split('\n')[0]}`, () => {
  assert.equal(selectorProblem(selector, sources), null);
});
