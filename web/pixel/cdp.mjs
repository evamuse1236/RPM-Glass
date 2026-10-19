/** A small Chrome DevTools Protocol driver for screenshots and flows, with no extra packages. */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function openChrome({port = 9333} = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-pixel-chrome-'));
  const child = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', 'about:blank'], {stdio: 'ignore'});
  let pages;
  for (let i = 0; i < 50 && !pages; i++) {
    await new Promise(r => setTimeout(r, 200));
    pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).catch(() => null);
  }
  const page = pages.find(p => p.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once: true}));
  let next = 0;
  const waiting = new Map(), problems = [];
  socket.addEventListener('message', ({data}) => {
    const msg = JSON.parse(data);
    if (msg.id && waiting.has(msg.id)) {
      const {resolve, reject} = waiting.get(msg.id);
      waiting.delete(msg.id);
      const fault = msg.error;
      fault ? reject(new Error(fault.message)) : resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      problems.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      problems.push(`${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description).join(' ')}`);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params}));
  });
  await send('Runtime.enable');
  await send('Page.enable');

  const tab = {
    send,
    problems,
    async size(width, height, scale = 1) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: width < 600});
    },
    async open(url) {
      await send('Page.navigate', {url});
      await new Promise(r => setTimeout(r, 1200));
    },
    async eval(expression) {
      const {result, exceptionDetails} = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    },
    async shot(file, {full = false} = {}) {
      const params = {format: 'png'};
      if (full) {
        const {cssContentSize} = await send('Page.getLayoutMetrics');
        params.captureBeyondViewport = true;
        params.clip = {x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1};
      }
      const {data} = await send('Page.captureScreenshot', params);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    key: async (key, code = key, extra = {}) => {
      await send('Input.dispatchKeyEvent', {type: 'keyDown', key, code, ...extra});
      await send('Input.dispatchKeyEvent', {type: 'keyUp', key, code, ...extra});
    },
    async close() {
      socket.close();
      child.kill();
    },
  };
  return tab;
}

export const wait = ms => new Promise(r => setTimeout(r, ms));
