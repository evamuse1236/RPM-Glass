// Serves the bundled planner and Capture with a stand-in for the Android bridge, so screens can be
// screenshotted at phone size in a desktop browser. Data lives in this process; nothing reaches a model.
// Usage: node scripts/build-companion-assets.mjs && node scripts/gauntlet/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedStore} from './seed.mjs';
import {sourceUnits} from '../../intent-v2/src/context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = path.join(root, 'app/src/main/assets/companion');
const port = Number(process.argv[2] ?? 4173);
let store = null, phone = null;
const reset = (options = {}) => {
  store = options.empty ? null : seedStore().data;
  phone = {fontScale: options.fontScale ?? 1, effectiveFontScale: options.fontScale ?? 1, hasKey: options.hasKey ?? true,
    reducedMotion: false, debug: false, notifications: true, exact: true, overlay: true, delivery: {}, widgetTextScale: 100};
};
reset();

// A canned interpretation that behaves like a good model run: a short verb-first title, the stated time,
// Must when the words say so, and the Block whose title shares a distinctive word with the thought.
const STOP = new Set(['the', 'and', 'for', 'with', 'which', 'that', 'this', 'from', 'about', 'ask', 'our', 'group', 'into', 'all']);
function fakeTurn(input) {
  const blocks = (input.context?.entities ?? []).filter(e => e.entity === 'block');
  const words = s => new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(w => !STOP.has(w)));
  const operations = input.sourceUnits.map((unit, i) => {
    const w = words(unit.text), block = blocks.find(b => [...words(b.title ?? '')].some(x => w.has(x)));
    const time = unit.text.match(/\b(?:today|tomorrow|tonight|on (?:mon|tues|wednes|thurs|fri|satur|sun)day)(?: (?:at|by) \d{1,2}(?::\d{2})? ?(?:am|pm))?/i)?.[0];
    const must = /\bmust\b|important/i.test(unit.text);
    const title = unit.text.replace(time ?? '\u0000', '').replace(/,? it(?:'s| is) a must/i, '').replace(/[.!?;,\s]+$/, '').replace(/\s{2,}/g, ' ').trim();
    const fields = [{name: 'title', op: 'set', value: title, origin: 'stated', evidence: unit.text}];
    if (time) fields.push({name: 'time', op: 'set', value: time, origin: 'stated', evidence: time});
    if (block) fields.push({name: 'blockId', op: 'set', value: block.id, origin: 'suggested', evidence: null});
    if (must) fields.push({name: 'must', op: 'set', value: true, origin: 'stated', evidence: unit.text});
    return {opId: 'task' + (i + 1), sourceId: unit.id, kind: 'create', entity: 'task', targetId: null, fields};
  });
  return {schemaVersion: 1, mode: 'capture', draftMode: 'new', reply: 'Here is what I heard.',
    decisions: input.sourceUnits.map(u => ({sourceId: u.id, disposition: 'action'})), operations, question: null, memoryCandidates: []};
}

function handle(action, payload) {
  switch (action) {
    case 'load': return {data: store, phone};
    case 'save':
      if ((store?.version ?? 0) !== payload.expected) throw new Error('Saved data changed. Reload.');
      store = payload.data; return phone;
    case 'status': return phone;
    case 'legacyEntries': return {done: true, entries: []};
    case 'captureDraft': return payload.text == null ? {present: false} : {};
    case 'appSettings': return {};
    case 'calendarList': return {permitted: false, selected: [], calendars: []};
    case 'calendarRead': return {permitted: false, events: []};
    case 'model': {
      const body = payload.body, input = JSON.parse(body.messages[1].content);
      input.sourceUnits ??= sourceUnits(input.raw ?? '');
      const turn = fakeTurn(input);
      return {status: 200, body: {model: body.model, provider: body.provider?.only?.[0] ?? 'OpenAI',
        choices: [{finish_reason: 'stop', message: {content: JSON.stringify(turn)}}]}};
    }
    default: return {};
  }
}

const bridge = `<script>
const nativeFetch=window.fetch.bind(window);
window.RpmNative={invoke(id,action,json){const payload=JSON.parse(json);
  if(action==='planner'){location.href='/planner.html';return;}if(action==='capture'){location.href='/index.html';return;}
  nativeFetch('/__native',{method:'POST',body:JSON.stringify({action,payload})}).then(r=>r.json()).then(r=>{
    const delay=action==='model'?(window.__modelDelay??600):0;setTimeout(()=>window.rpmBridgeResult(id,r.result??null,r.error??null),delay);});}};
</script>`;

const types = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json'};
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    let raw = ''; req.on('data', c => { raw += c; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/__reset') { reset(JSON.parse(raw || '{}')); return res.end('{}'); }
      try { const {action, payload} = JSON.parse(raw); res.end(JSON.stringify({result: handle(action, payload)})); }
      catch (error) { res.end(JSON.stringify({error: error.message})); }
    });
    return;
  }
  if (url.pathname === '/__store') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(store)); }
  const file = path.join(assets, url.pathname === '/' ? 'planner.html' : path.normalize(url.pathname));
  if (!file.startsWith(assets) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
  let body = fs.readFileSync(file);
  if (file.endsWith('.html')) body = body.toString().replace('<head>', '<head>' + bridge);
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
  res.end(body);
}).listen(port, () => console.log(`Gauntlet harness on http://localhost:${port}/planner.html`));
