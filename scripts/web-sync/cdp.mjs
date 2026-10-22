import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A headless Chrome page driven over the DevTools protocol. */
export async function openBrowser({chrome: binary, out}) {
  const port = 9300 + Math.floor(Math.random() * 400);
  const chrome = spawn(binary, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rpm-web-'))}`,
    '--no-first-run', '--hide-scrollbars', 'about:blank'], {stdio: 'ignore'});
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).then(list => list.find(t => t.type === 'page')).catch(() => null);
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open', r, {once: true}));
  let seq = 0;
  const waiting = new Map();
  const errors = [];
  socket.addEventListener('message', ({data}) => {
    const msg = JSON.parse(data);
    if (msg.id) { waiting.get(msg.id)?.(msg); waiting.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, msg => msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result));
    socket.send(JSON.stringify({id, method, params}));
  });
  const js = async expression => {
    const reply = await cdp('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (reply.exceptionDetails) throw new Error(`${expression.slice(0, 80)}: ${reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text}`);
    return reply.result.value;
  };
  const until = async (expression, timeout = 30000) => {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(150)) if (await js(expression).catch(() => false)) return true;
    return false;
  };
  let shot = 0;
  const capture = async name => {
    const {data} = await cdp('Page.captureScreenshot', {format: 'png'});
    const path = join(out, `${String(++shot).padStart(2, '0')}-${name}.png`);
    writeFileSync(path, Buffer.from(data, 'base64'));
    console.log('  shot', path);
    return path;
  };
  const viewport = (width, height, scheme = 'light') => Promise.all([
    cdp('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: width < 600}),
    cdp('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: scheme}]}),
  ]);
  const center = async selector => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
    el.scrollIntoView({block: 'center'}); const r = el.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
  const mouse = (type, {x, y}) => cdp('Input.dispatchMouseEvent', {type, x, y, button: 'left', clickCount: 1, pointerType: 'mouse'});
  const tap = async selector => {
    const at = await center(selector);
    if (!at) throw new Error(`nothing matches ${selector}`);
    await sleep(60);
    const point = await center(selector);
    await mouse('mouseMoved', point); await mouse('mousePressed', point); await mouse('mouseReleased', point);
    await sleep(120);
  };
  const type = async (selector, text) => {
    await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select?.(); return true; })()`);
    await cdp('Input.insertText', {text});
  };
  const key = (name, code = name, keyCode = {Enter: 13, Escape: 27, Tab: 9}[name]) => Promise.all([
    cdp('Input.dispatchKeyEvent', {type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode, text: name === 'Enter' ? '\r' : undefined}),
    cdp('Input.dispatchKeyEvent', {type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode}),
  ]);
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const close = () => { socket.close(); chrome.kill(); };
  return {cdp, js, until, capture, viewport, tap, type, key, errors, close};
}
