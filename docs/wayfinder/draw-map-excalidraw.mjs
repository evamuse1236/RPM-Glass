import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? join(import.meta.dirname, 'whole-day');
const out = process.argv[3] ?? join(dir, 'excalidraw-patch.json');
const CANVAS = process.env.EXPRESS_SERVER_URL ?? 'http://127.0.0.1:3000';
const X0 = 0, Y0 = 2300, P = 'rpm-';

const LANES = [['agent', 'Agent and VM'], ['google', 'Google sync'], ['lms', 'LMS'], ['notch', 'Notch'], ['health', 'Health'], ['today', 'Today screen']];
const C = {
  ink: '#1e2a3a', soft: '#5c6b7a', green: '#2f9e44', greenBg: '#d3f9d8', blue: '#1971c2', blueBg: '#e7f5ff',
  amber: '#e8590c', amberBg: '#fff4e6', fog: '#adb5bd', fogBg: '#f1f3f5', white: '#ffffff', doing: '#a5d8ff',
};

function parseTicket(id, text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const mi = lines.findIndex(l => /^Type:/.test(l));
  const meta = {};
  for (const part of lines[mi].split(' · ')) { const k = part.indexOf(':'); meta[part.slice(0, k).trim().toLowerCase()] = part.slice(k + 1).trim(); }
  const raw = meta['blocked by'] || 'none';
  return {
    id, title: lines[0].replace(/^#\s*/, '').trim(), type: meta.type, stream: meta.stream, status: meta.status,
    assignee: meta.assignee || 'none',
    blockedBy: raw === 'none' ? [] : raw.split(',').map(s => s.replace(/\(.*?\)/g, '').trim()).filter(Boolean),
  };
}
const tickets = readdirSync(join(dir, 'tickets')).filter(f => f.endsWith('.md')).sort()
  .map(f => parseTicket(f.slice(0, -3), readFileSync(join(dir, 'tickets', f), 'utf8')));
const mapMd = readFileSync(join(dir, 'map.md'), 'utf8').replace(/\r/g, '');
const section = name => (mapMd.split(/^## /m).find(s => s.startsWith(name + '\n')) || '').split('\n').slice(1).join('\n');
const bullets = name => section(name).replace(/<!--[\s\S]*?-->/g, '').split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));

const byId = id => tickets.find(t => t.id === id);
const open = t => t.blockedBy.map(byId).filter(b => b && b.status !== 'closed');
const depthMemo = {};
const depth = t => t.status === 'closed' ? 0 : (depthMemo[t.id] ??= 1 + Math.max(0, ...open(t).map(depth)));
const col = t => Math.min(2, depth(t));
const needsYou = t => /HITL/.test(t.type);
const stateOf = t => t.status === 'closed' ? 'decided' : col(t) === 2 ? 'waiting' : !/^(none|you)\b/i.test(t.assignee) ? 'doing' : 'start';
const tag = (t, s) => s === 'decided' ? 'Decided' : s === 'doing' ? 'Claude is on it' : needsYou(t) ? 'Needs you' : 'Agent alone';

const COLX = [220, 560, 900], COLW = 300, STW = 280, STH = 130, FOGX = 1240, FOGW = 220, DESTX = 1500, DESTW = 340;
const els = [];
const text = (id, x, y, t, size = 16, color = C.ink, w = 600) => els.push({ id: P + id, type: 'text', x, y, width: w, height: size * 1.4 * (t.split('\n').length), text: t, fontSize: size, strokeColor: color, fontFamily: 'helvetica' });
const rect = (id, x, y, w, h, o) => els.push({ id: P + id, type: 'rectangle', x, y, width: w, height: h, fillStyle: 'solid', roughness: 0, strokeWidth: 1, ...o });

const counts = { decided: 0, start: 0, doing: 0, waiting: 0 };
tickets.forEach(t => counts[stateOf(t)]++);
const fog = bullets('Not yet specified');
text('title', X0, Y0, 'RPM fits my whole day: route map', 36, C.ink, 900);
text('status', X0, Y0 + 56, `${counts.decided} of ${tickets.length} questions decided. ${counts.start + counts.doing} you can start now. ${counts.waiting} waiting. ${fog.length} still in fog.`, 20, C.soft, 1000);
text('legend', X0, Y0 + 92, 'Box = needs you.  Circle = an agent can do it alone.  Green = decided.  Blue = start now.  Orange dashed = waiting.  Draw or write anywhere: I read your changes.', 16, C.soft, 1400);

const laneTop = Y0 + 200;
const laneH = LANES.map(([k]) => Math.max(1, ...[0, 1, 2].map(c => tickets.filter(t => t.stream === k && col(t) === c).length)) * (STH + 24) + 32);
const totalH = laneH.reduce((a, b) => a + b, 0);
const bands = [['Decided', C.greenBg], ['Start now', C.blueBg], ['Waiting', C.amberBg]];
bands.forEach(([name, bg], c) => {
  rect(`band-${c}`, X0 + COLX[c], laneTop - 56, COLW, totalH + 56, { backgroundColor: bg, strokeColor: 'transparent', locked: true });
  text(`colhead-${c}`, X0 + COLX[c] + 12, laneTop - 46, name, 20, C.ink, COLW - 24);
});
rect('band-fog', X0 + FOGX, laneTop - 56, FOGW, totalH + 56, { backgroundColor: C.fogBg, strokeColor: C.fog, strokeStyle: 'dashed', locked: true });
text('colhead-fog', X0 + FOGX + 12, laneTop - 46, 'Not yet charted', 20, C.soft, FOGW - 24);

let y = laneTop;
LANES.forEach(([key, name], li) => {
  text(`lane-${key}`, X0, y + laneH[li] / 2 - 12, name, 20, C.ink, 200);
  if (li) els.push({ id: P + `rule-${key}`, type: 'line', x: X0, y, width: FOGX + FOGW, height: 0, points: [[0, 0], [FOGX + FOGW, 0]], strokeColor: '#dee2e6', strokeWidth: 1, roughness: 0, locked: true });
  [0, 1, 2].forEach(c => {
    tickets.filter(t => t.stream === key && col(t) === c).sort((a, b) => depth(a) - depth(b)).forEach((t, i) => {
      const s = stateOf(t);
      const style = {
        decided: { strokeColor: C.green, backgroundColor: C.greenBg, strokeStyle: 'solid' },
        start: { strokeColor: C.blue, backgroundColor: C.white, strokeStyle: 'solid', strokeWidth: 3 },
        doing: { strokeColor: C.blue, backgroundColor: C.doing, strokeStyle: 'solid', strokeWidth: 3 },
        waiting: { strokeColor: C.amber, backgroundColor: C.white, strokeStyle: 'dashed', strokeWidth: 2 },
      }[s];
      els.push({
        id: P + 't-' + t.id, type: needsYou(t) ? 'rectangle' : 'ellipse',
        x: X0 + COLX[c] + 10, y: y + 16 + i * (STH + 24), width: STW, height: STH,
        roundness: needsYou(t) ? { type: 3 } : null, fillStyle: 'solid', roughness: 0, strokeWidth: 2, ...style,
        text: `${t.title}\n${tag(t, s)}`, fontSize: 16, fontFamily: 'helvetica', strokeColorText: C.ink,
      });
    });
  });
  y += laneH[li];
});

let fy = laneTop + 8;
fog.forEach((f, i) => {
  const short = f.split(/[:.(]/)[0].slice(0, 70);
  rect(`fog-${i}`, X0 + FOGX + 12, fy, FOGW - 24, 90, { backgroundColor: C.white, strokeColor: C.fog, strokeStyle: 'dashed', roundness: { type: 3 }, text: short, fontSize: 14, fontFamily: 'helvetica' });
  fy += 108;
});

const dest = section('Destination').trim();
rect('dest', X0 + DESTX, laneTop + totalH / 2 - 170, DESTW, 340, { backgroundColor: C.ink, strokeColor: C.white, roundness: { type: 3 }, text: `Destination\n\n${dest}`, fontSize: 18, fontFamily: 'helvetica' });

for (const t of tickets) for (const b of t.blockedBy) {
  if (!byId(b)) continue;
  const done = byId(b).status === 'closed';
  els.push({ id: P + `edge-${b}-${t.id}`, type: 'arrow', x: 0, y: 0, startElementId: P + 't-' + b, endElementId: P + 't-' + t.id,
    strokeColor: done ? C.green : C.amber, opacity: done ? 45 : 100, strokeWidth: 2, roughness: 0, endArrowhead: 'arrow' });
}

const by = laneTop + totalH + 60;
text('decided-head', X0, by, 'Decided so far', 24, C.ink, 600);
const wrap = (s, n = 110) => s.split(' ').reduce((a, w) => {
  const l = a.at(-1);
  if (l && (l + ' ' + w).length > n) a.push(w); else a[a.length - 1] = l ? l + ' ' + w : w;
  return a;
}, ['']).join('\n');
let dy = by + 44;
bullets('Decisions so far').forEach((d, i) => {
  const t = wrap('✓ ' + d);
  text(`decided-${i}`, X0, dy, t, 16, C.ink, 1100);
  dy += t.split('\n').length * 24 + 16;
});
const oy = dy + 20;
text('oos-head', X0, oy, 'Out of scope', 24, C.soft, 600);
bullets('Out of scope').forEach((d, i) => text(`oos-${i}`, X0, oy + 44 + i * 40, '✗ ' + d, 16, C.soft, 1100));

let existing = [];
try { existing = ((await (await fetch(`${CANVAS}/api/elements`)).json()).elements || []).map(e => e.id).filter(id => id?.startsWith(P)); } catch {}
const ids = new Set(els.map(e => e.id));
writeFileSync(out.replace(/patch\.json$/, 'delete.json'), JSON.stringify({ delete: existing }, null, 2));
writeFileSync(out, JSON.stringify({ create: els }, null, 2));
writeFileSync(join(dir, 'excalidraw-ids.txt'), [...ids].join(','));
console.log(`patch: delete ${existing.length}, create ${els.length} -> ${out}`);
