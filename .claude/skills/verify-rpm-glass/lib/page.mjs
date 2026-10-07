import {adb, shell, appPid, UserError, PACKAGE} from './device.mjs';

// Debug builds expose each WebView over Chrome DevTools Protocol on an abstract socket named after the app's pid.
export async function pageTargets(serial, port) {
  const pid = appPid(serial);
  if (!pid) throw new UserError(`${PACKAGE} is not running.`, 'Run `open capture` to start it.');
  const socket = `webview_devtools_remote_${pid}`;
  if (!shell(serial, 'cat /proc/net/unix').includes(socket))
    throw new UserError(`No WebView debug socket for pid ${pid}.`, 'Install the debug APK (`launch --build`); release builds do not expose WebView debugging.');
  adb(serial, ['forward', `tcp:${port}`, `localabstract:${socket}`]);
  const res = await fetch(`http://127.0.0.1:${port}/json`, {signal: AbortSignal.timeout(8000)}).catch(e => { throw new UserError(`DevTools did not answer on port ${port}: ${e.message}`, 'If the app is in the background, bring it forward with `rpmctl open capture`. Otherwise run `doctor`; if another tool holds the port, pass --cdp-port.'); });
  return (await res.json()).filter(t => t.type === 'page').map(t => ({...t, view: JSON.parse(t.description || '{}')}));
}

export async function visiblePage(serial, port) {
  let shown = [];
  for (const until = Date.now() + 10000; Date.now() < until; await new Promise(r => setTimeout(r, 400))) {
    shown = (await pageTargets(serial, port)).filter(p => p.view.visible && p.view.attached && p.url.startsWith('https://rpm.local/'));
    if (shown.length) break;
  }
  if (!shown.length) throw new UserError('No RPM WebView is on screen.', 'Run `open capture` or `open planner`, then retry. `ui --native` shows what is on screen instead.');
  return shown.at(-1);
}

export async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; setTimeout(() => reject(new UserError('The WebView did not accept a DevTools connection within 8s.', 'Bring the app to the front (`rpmctl open capture`) and close any other DevTools client, then retry.')), 8000); ws.onerror = () => reject(new UserError('Could not attach to the WebView.', 'Close Chrome DevTools (chrome://inspect) if it is attached to the same page, then retry.')); });
  let next = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new UserError(`The page did not answer ${method} within 30s.`, 'The app may be frozen or in the background: run `rpmctl doctor` and `rpmctl logs --errors`.')); }, 30000);
    pending.set(id, msg => { clearTimeout(timer); msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result); });
    ws.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async (expression, arg) => {
    const source = arg === undefined ? expression : `(${expression})(${JSON.stringify(arg)})`;
    const r = await send('Runtime.evaluate', {expression: source, returnByValue: true, awaitPromise: true});
    if (r.exceptionDetails) throw new UserError(`Page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`, 'Check the expression; `ui` lists what is on screen.');
    return r.result.value;
  };
  return {send, evaluate, target, close: () => ws.close()};
}

// Lists what a user can see and touch in the page: role, accessible name, state and CSS-pixel rect.
// Kept as one self-contained function because it runs inside the WebView.
export const SNAPSHOT = function snapshot(all) {
  const roleOf = el => el.getAttribute('role') || ({BUTTON: 'button', A: 'link', TEXTAREA: 'textbox', SELECT: 'combobox', H1: 'heading', H2: 'heading', H3: 'heading', DIALOG: 'dialog', LI: 'listitem', LABEL: 'label', P: 'text'})[el.tagName]
    || (el.tagName === 'INPUT' ? ({checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button'})[el.type] || 'textbox' : null);
  const visibleText = node => node.nodeType === 3 ? node.textContent : node.nodeType !== 1 || node.getAttribute('aria-hidden') === 'true' || node.hidden ? '' : node.tagName === 'BR' ? ' ' : [...node.childNodes].map(visibleText).join('');
  const text = el => visibleText(el).replace(/\s+/g, ' ').trim();
  const nameOf = el => {
    const by = el.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(text).join(' ');
    return (el.getAttribute('aria-label') || (el.labels?.[0] && text(el.labels[0])) || text(el) || el.getAttribute('placeholder') || el.getAttribute('title') || el.value || '').replace(/\s+/g, ' ').trim();
  };
  const shown = el => {
    if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.01;
  };
  const sel = 'button,a[href],input,textarea,select,[role],[aria-label],h1,h2,h3,[contenteditable="true"],[data-key],label,p';
  const out = [];
  window.__rpmEls = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!shown(el)) continue;
    const role = roleOf(el);
    if (!role && !el.hasAttribute('aria-label') && !el.dataset.key) continue;
    if (role === 'text' && !all) continue;
    const r = el.getBoundingClientRect();
    const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    if (!inView && !all) continue;
    const state = {};
    for (const a of ['pressed', 'expanded', 'checked', 'selected', 'disabled', 'current'])
      if (el.hasAttribute('aria-' + a)) state[a] = el.getAttribute('aria-' + a);
    if (el.disabled) state.disabled = 'true';
    if (document.activeElement === el) state.focused = 'true';
    if ('value' in el && el.tagName !== 'BUTTON' && el.value) state.value = String(el.value).slice(0, 200);
    window.__rpmEls.push(el);
    out.push({ref: window.__rpmEls.length - 1, role: role ?? 'generic', name: nameOf(el).slice(0, 160), id: el.id || undefined, key: el.dataset.key || undefined,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inView, ...(Object.keys(state).length ? {state} : {})});
  }
  return {title: document.title, url: location.href, view: document.getElementById('planner')?.dataset.view ?? document.getElementById('panel')?.dataset.view ?? null,
    viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, elements: out};
};

// Finds one element by role/name/css. Exact (case-insensitive) name beats substring; ambiguity is an error that lists the candidates.
export const LOCATE = function locate({role, name, css, nth, scroll}) {
  const snap = (window.__rpmSnapshot)(true);
  let pool;
  if (css) {
    const els = [...document.querySelectorAll(css)];
    if (!els.length) return {error: `No element matches css ${css}`};
    const el = els[nth ?? 0];
    if (!el) return {error: `Only ${els.length} element(s) match css ${css}`};
    if (scroll) el.scrollIntoView({block: 'center', inline: 'nearest'});
    const r = el.getBoundingClientRect();
    return {match: {role: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 80), rect: [r.left, r.top, r.width, r.height]}, viewport: [innerWidth, innerHeight]};
  }
  pool = snap.elements.filter(e => !role || e.role === role);
  const want = (name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  let hits = pool.filter(e => e.name.toLowerCase() === want);
  if (!hits.length && want) hits = pool.filter(e => e.name.toLowerCase().includes(want));
  if (!hits.length) return {error: `No ${role ?? 'element'} named "${name}" on screen`, candidates: pool.filter(e => e.role !== 'text').slice(0, 40).map(e => `${e.role} "${e.name}"`)};
  if (hits.length > 1 && nth === undefined) {
    const same = hits.filter(e => e.name.toLowerCase() === hits[0].name.toLowerCase() && e.role === hits[0].role);
    if (same.length !== hits.length) return {error: `"${name}" is ambiguous`, candidates: hits.map(e => `${e.role} "${e.name}"`)};
  }
  const hit = hits[nth ?? 0];
  if (!hit) return {error: `Only ${hits.length} match(es) for "${name}"`};
  if (scroll && !hit.inView) {
    window.__rpmEls[hit.ref].scrollIntoView({block: 'center', inline: 'nearest'});
    return locate({role, name, css, nth, scroll: false});
  }
  return {match: hit, viewport: [innerWidth, innerHeight]};
};

export async function inPage(serial, port) {
  const target = await visiblePage(serial, port);
  const page = await connect(target);
  await page.evaluate(`window.__rpmSnapshot = ${SNAPSHOT.toString()}; window.__rpmLocate = ${LOCATE.toString()}; true`);
  return page;
}

// Converts a CSS-pixel point in the page to a device pixel for `adb shell input tap`.
export function toDevice(page, dpr, [x, y]) {
  return [Math.round(page.target.view.screenX + x * dpr), Math.round(page.target.view.screenY + y * dpr)];
}
