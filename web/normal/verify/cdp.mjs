/** A small Chrome DevTools Protocol driver: headless Chrome, exact viewport sizes, scripted steps, screenshots. */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function devtoolsPort(profile) {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(file)) {
      const [port] = fs.readFileSync(file, 'utf8').split('\n');
      if (port) return Number(port);
    }
    await wait(100);
  }
  throw new Error('Chrome did not open a DevTools port.');
}

export async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--hide-scrollbars',
    '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank'], {stdio: 'ignore'});
  const port = await devtoolsPort(profile);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: 'PUT'})).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 1;
  const waiting = new Map(), errors = [];
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (message.id && waiting.has(message.id)) {
      const {resolve, reject} = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = next++;
    waiting.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params}));
  });
  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    errors,
    send,
    async goto(url, {width = 1440, height = 900, scale = 1, dark = false, settle = 1500} = {}) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: width < 600, screenWidth: width, screenHeight: height});
      await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: dark ? 'dark' : 'light'}]});
      await send('Page.navigate', {url: 'about:blank'});
      await send('Page.navigate', {url});
      await wait(settle);
    },
    async eval(expression) {
      const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    },
    async key(key, code = key, extra = {}) {
      await send('Input.dispatchKeyEvent', {type: 'keyDown', key, code, text: key.length === 1 ? key : undefined, ...extra});
      await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code, ...extra});
    },
    async type(text) {
      await send('Input.insertText', {text});
    },
    async text(selector) {
      return page.eval(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`);
    },
    async until(expression, timeout = 6000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await page.eval(expression)) return true;
        await wait(100);
      }
      throw new Error(`Timed out waiting for ${expression}`);
    },
    async click(selector) {
      const box = await page.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
      if (!box) throw new Error(`Nothing on the page matches ${selector}.`);
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: box.x, y: box.y, button: 'left', clickCount: 1});
    },
    async drag(from, to) {
      const at = s => page.eval(`(() => { const r = document.querySelector(${JSON.stringify(s)})?.getBoundingClientRect(); return r && {x: r.x + Math.min(40, r.width / 2), y: r.y + r.height / 2}; })()`);
      const a = await at(from), b = await at(to);
      if (!a || !b) throw new Error('Drag source or target is missing.');
      await send('Input.dispatchMouseEvent', {type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1});
      for (let i = 1; i <= 10; i++) {
        await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10, button: 'left', buttons: 1});
        await wait(16);
      }
      await send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1});
    },
    async shot(file) {
      const {data} = await send('Page.captureScreenshot', {format: 'png'});
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    wait,
    async close() {
      socket.close();
      chrome.kill();
      await wait(300);
      try { fs.rmSync(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 300}); } catch {}
    },
  };
  return page;
}
