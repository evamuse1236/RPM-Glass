#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {openBrowser, sleep} from './cdp.mjs';
import {runChecks} from './drive-checks.mjs';

const {values: opts} = parseArgs({options: {
  site: {type: 'string', default: 'http://127.0.0.1:5178/'},
  chrome: {type: 'string', default: '/usr/bin/chromium'},
  state: {type: 'string', default: '.verify/web-sync/phone.json'},
  'no-code': {type: 'boolean', default: false},
  out: {type: 'string', default: `.verify/evidence/web-${new Date().toISOString().replace(/[:.]/g, '-')}`},
}});
mkdirSync(opts.out, {recursive: true});
const results = [];
const check = (ok, label) => { results.push({ok: !!ok, label}); console.log(ok ? 'PASS' : 'FAIL', label); };
const PLANNER = `!!document.querySelector('#nav-bar .nav-item') && !!document.querySelector('.spine-card')`;

const b = await openBrowser({chrome: opts.chrome, out: opts.out});
try {
  await b.viewport(412, 915);
  await b.cdp('Page.navigate', {url: opts.site});
  if (opts['no-code']) {
    check(await b.until(PLANNER), 'the Site opens straight to the phone planner, with no code');
    check(await b.js(`document.getElementById('link-view').hidden && document.getElementById('menu-unlink').hidden`), 'the link screen and Unlink stay hidden');
  } else {
    await b.until(`!document.getElementById('link-view').hidden`);
    await b.capture('link');
    await b.js(`document.getElementById('link-code').value = 'WRONG222'; document.getElementById('link-form').requestSubmit(); true`);
    check(await b.until(`!document.getElementById('link-problem').hidden`), 'a wrong code shows a reason on the link screen');
    await b.capture('link-wrong-code');
    const {code} = JSON.parse(execFileSync('node', ['scripts/web-sync/phone-standin.mjs', '--link-code', '--state', opts.state], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}));
    await b.js(`document.getElementById('link-code').value = ${JSON.stringify(code.toLowerCase())}; document.getElementById('link-form').requestSubmit(); true`);
    check(await b.until(PLANNER), 'linking with a phone code opens the phone planner');
  }
  await sleep(500);
  await b.capture('today-412');
  await runChecks({b, check, state: opts.state, site: opts.site});
} catch (error) {
  check(false, `drive stopped: ${error.message}`);
  await b.capture('stopped').catch(() => {});
}
check(b.errors.length === 0, `no script errors in the page${b.errors.length ? `: ${b.errors.join(' | ')}` : ''}`);
writeFileSync(join(opts.out, 'results.json'), JSON.stringify(results, null, 1));
b.close();
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} checks passed. Evidence: ${opts.out}`);
process.exit(failed ? 1 : 0);
