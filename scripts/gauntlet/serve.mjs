// Serves the bundled planner and Capture with a stand-in for the Android bridge, so screens can be
// screenshotted at phone size in a desktop browser. Data lives in this process; nothing reaches a model.
// Usage: node scripts/build-companion-assets.mjs && node scripts/gauntlet/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {seedStore} from './seed.mjs';
import {sourceUnits} from '../../intent-v2/src/context.mjs';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = path.join(root, 'app/src/main/assets/companion');
const port = Number(process.argv[2] ?? 4173);
let store = null, phone = null, repo = null;
// Repo capture's phone side: a GitHub account with a few repos, the draft, and ideas "sent" to second-brain.
const REPOS = [['RPM-Glass', 'RPM app: Android planner, Capture and widget', '2026-10-06', false], ['hinge-profile-cli', '', '2026-10-06', true],
  ['rpm-agent', 'Arden, the RPM coaching agent', '2026-10-06', true], ['vocalinux-local', 'Local voice typing for Linux', '2026-10-06', true],
  ['EvaMS', '', '2026-10-05', true], ['second-brain', 'What is true now, and what I am learning', '2026-10-03', true],
  ['reading-room-site', 'ISDM Reading Room', '2026-09-30', true], ['flatsplit', 'Split flat expenses', '2026-07-28', true]]
  .map(([name, description, pushedAt, priv]) => ({fullName: 'evamuse1236/' + name, name, description, pushedAt, private: priv}));
const resetRepo = (options = {}) => {
  repo = {github: options.github === false ? {connected: false} : {connected: true, login: 'evamuse1236', inbox: 'evamuse1236/second-brain', folder: 'ideas'},
    repos: options.github === false ? [] : REPOS, reposAt: Date.now(), used: options.used ?? ['evamuse1236/RPM-Glass', 'evamuse1236/rpm-agent'],
    draft: options.draft ?? null, waiting: options.waiting ?? 0, ideas: new Map()};
};
const reset = (options = {}) => {
  resetRepo(options.repo ?? {});
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
    decisions: input.sourceUnits.map(u => ({sourceId: u.id, disposition: 'action', note: null})), operations, question: null, memoryCandidates: []};
}

// The week's real commitments, read-only as PlannerCalendar.java returns them (start/end in epoch ms).
// Monday morning holds the unresolved clash: the DAD exam overlaps the GWBC session.
function calendar(anchor = Date.now()) {
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const at = (n, hm) => +new Date(`${day(n)}T${hm}:00`);
  const rows = [[0, '11:30', '13:30', 'RM Session 4 (Section A)'], [2, '09:00', '10:00', 'DAD exam'], [2, '09:00', '11:00', 'GWBC session'],
    [2, '11:30', '13:30', 'RM Session 5 (Section A)'], [3, '11:30', '13:30', 'RM Quiz I in class'], [4, '14:00', '16:00', 'PMDL workshop'], [5, '10:00', '12:00', 'DAD lab']];
  const events = rows.map(([n, a, b, title], i) => ({id: `calendar-${i}-${at(n, a)}`, start: at(n, a), end: at(n, b), title, calendarId: 1, allDay: false, busy: true}));
  return {status: 'ready', events, start: anchor - 3 * 864e5, end: anchor + 22 * 864e5, readAt: Date.now(), source: 'Android-synced calendars'};
}

// With RAMBLE_DIR set, model answers come from files (see rambles.mjs) instead of fakeTurn. The key ignores
// volatile ids and clock values so the same ramble against the same plan replays the same answer.
const replayDir = process.env.RAMBLE_DIR ? path.resolve(process.env.RAMBLE_DIR) : null;
if (replayDir) fs.mkdirSync(replayDir, {recursive: true});
function modelKey(input) {
  const stable = {units: input.sourceUnits.map(u => u.text), repair: input.repair?.validationError ?? null,
    draft: input.activeDraft?.operations ?? null, recent: (input.context?.recentMessages ?? []).map(m => m.text)};
  return crypto.createHash('sha1').update(JSON.stringify(stable)).digest('hex').slice(0, 12);
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
    case 'calendarList': return {permitted: true, selected: [1], calendars: [{id: 1, name: 'College', account: 'student', color: -16746133}]};
    case 'calendarRead': return calendar(payload.anchor);
    case 'dictate': return {text: 'call mom sunday evening'}; // stands in for Android's speech recognizer
    case 'model': {
      const body = payload.body, input = JSON.parse(body.messages[1].content);
      input.sourceUnits ??= sourceUnits(input.raw ?? '');
      let turn;
      if (replayDir) {
        // Replay a recorded model answer for exactly this request; otherwise park the request for a model to answer.
        const key = modelKey(input);
        const answer = path.join(replayDir, key + '.out.json');
        if (!fs.existsSync(answer)) {
          fs.writeFileSync(path.join(replayDir, key + '.in.json'), JSON.stringify({effort: body.reasoning?.effort ?? null, input}, null, 1));
          return {status: 503, body: {error: 'No recorded answer: ' + key}};
        }
        turn = JSON.parse(fs.readFileSync(answer, 'utf8'));
      } else turn = fakeTurn(input);
      return {status: 200, body: {model: body.model, provider: body.provider?.only?.[0] ?? 'OpenAI',
        choices: [{finish_reason: 'stop', message: {content: JSON.stringify(turn)}}]}};
    }
    case 'repoState': return {github: repo.github, repos: repo.repos, reposAt: repo.reposAt, used: repo.used, draft: repo.draft, waiting: repo.waiting};
    case 'repoRepos': return {repos: repo.repos, reposAt: Date.now()};
    case 'repoDraft': repo.draft = payload.draft; return {};
    case 'repoPick': return {shots: Array.from({length: Math.min(payload.max ?? 1, 2)}, () => crypto.randomUUID())};
    case 'repoSave': {
      if (payload.repo) repo.used = [payload.repo, ...repo.used.filter(r => r !== payload.repo)].slice(0, 8);
      repo.ideas.set(payload.id, payload); repo.draft = {repo: payload.repo, isNew: false, newName: '', text: '', shots: []};
      return {state: repo.github.connected ? 'sending' : 'not-connected', used: repo.used};
    }
    case 'repoUndo': {
      const idea = repo.ideas.get(payload.id); repo.ideas.delete(payload.id);
      return {draft: {repo: idea.repo, isNew: !idea.repo, newName: idea.newName, text: idea.text, shots: idea.shots.map(x => x.id)}};
    }
    default: return {};
  }
}

// A stand-in screenshot: a phone-shaped page with a few rows, so thumbnails look like the real thing.
const shotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="760" viewBox="0 0 360 760"><rect width="360" height="760" fill="#F8FAFD"/>
<rect x="16" y="48" width="200" height="28" rx="6" fill="#1F1F1F"/><rect x="16" y="110" width="328" height="120" rx="24" fill="#D3E3FD"/>
${[260, 330, 400, 470, 540].map(y => `<circle cx="36" cy="${y + 20}" r="10" fill="none" stroke="#444746" stroke-width="3"/><rect x="60" y="${y + 8}" width="240" height="14" rx="4" fill="#444746"/><rect x="60" y="${y + 30}" width="140" height="10" rx="4" fill="#C4C7C5"/>`).join('')}
<rect x="0" y="680" width="360" height="80" fill="#F0F4F9"/></svg>`;

const bridge = `<script>
const nativeFetch=window.fetch.bind(window);
window.RpmNative={invoke(id,action,json){const payload=JSON.parse(json);
  if(action==='planner'){location.href='/planner.html';return;}if(action==='capture'){location.href='/index.html';return;}
  nativeFetch('/__native',{method:'POST',body:JSON.stringify({action,payload})}).then(r=>r.json()).then(r=>{
    const delay=action==='model'?(window.__modelDelay??600):0;setTimeout(()=>window.rpmBridgeResult(id,r.result??null,r.error??null),delay);
    if(action==='repoSave'&&r.result?.state==='sending')setTimeout(()=>window.rpmRepoIdeaStatus?.({id:payload.id,state:'sent',url:'https://github.com/evamuse1236/second-brain/tree/main/ideas/'+payload.folder}),window.__sendDelay??900);});}};
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
  if (/^\/shot\/[a-f0-9-]{36}\.jpg$/.test(url.pathname)) { res.setHeader('content-type', 'image/svg+xml'); return res.end(shotSvg); }
  if (url.pathname === '/__store') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(store)); }
  const file = path.join(assets, url.pathname === '/' ? 'planner.html' : path.normalize(url.pathname));
  if (!file.startsWith(assets) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
  let body = fs.readFileSync(file);
  if (file.endsWith('.html')) body = body.toString().replace('<head>', '<head>' + bridge);
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
  res.end(body);
}).listen(port, () => console.log(`Gauntlet harness on http://localhost:${port}/planner.html`));
