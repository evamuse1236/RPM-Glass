(() => {
  const B = window.BLUEPRINT;
  const NS = 'http://www.w3.org/2000/svg';
  const U = 34, C = Math.cos(Math.PI / 6), S = 0.5;
  const KEY = 'rpm-blueprint-comments-v1';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const svg = document.getElementById('scene');
  const panel = document.getElementById('panel');
  const byId = id => B.parts.find(p => p.id === id);
  const zoneOf = id => B.zones.find(z => z.id === id);
  const iso = (x, y, z = 0) => [(x - y) * C * U, (x + y) * S * U - z * U];
  const pts = list => list.map(p => iso(...p).map(n => n.toFixed(1)).join(',')).join(' ');
  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.append(n);
    return n;
  };
  const h = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  let store = load();
  let selected = null;
  let journey = null;
  let pinMode = false;
  let dirHandle = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { comments: [] }; } catch { return { comments: [] }; }
  }
  function persist() {
    localStorage.setItem(KEY, JSON.stringify(store));
    updateCount();
    if (dirHandle) writeFile().catch(() => setSaveState('Could not save to the folder. Try Save again.'));
  }

  const layers = { zones: el('g', { class: 'zones' }, svg), links: el('g', { class: 'links' }, svg), parts: el('g', { class: 'parts' }, svg), pins: el('g', { class: 'pins' }, svg), runner: el('g', { class: 'runner' }, svg) };

  function box(g, { x, y, z = 0, w, d, h: ht }) {
    const top = [[x, y, z + ht], [x + w, y, z + ht], [x + w, y + d, z + ht], [x, y + d, z + ht]];
    const left = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + ht], [x, y + d, z + ht]];
    const right = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + ht], [x + w, y, z + ht]];
    for (const [cls, f] of [['face-l', left], ['face-r', right], ['face-t', top]]) {
      el('polygon', { class: `face ${cls}`, points: pts(f) }, g);
      el('polygon', { class: `hatch ${cls}`, points: pts(f) }, g);
    }
  }

  function drawZones() {
    for (const z of B.zones) {
      if (z.plate === false) continue;
      const g = el('g', { class: `zone c-${z.color}` }, layers.zones);
      el('polygon', { class: 'zone-plate', points: pts([[z.x, z.y, 0], [z.x + z.w, z.y, 0], [z.x + z.w, z.y + z.d, 0], [z.x, z.y + z.d, 0]]) }, g);
      const [lx, ly] = iso(z.x + (z.labelX ?? 0.3), z.y + z.d - 0.25, 0);
      const t = el('text', { class: 'zone-label', transform: `translate(${lx} ${ly}) matrix(${C} ${S} ${-C} ${S} 0 0)` }, g);
      t.textContent = z.name;
    }
  }

  function anchor(p) { return [p.x + p.w / 2, p.y + p.d / 2, p.z + p.h / 2]; }
  for (const l of B.links) if (!l.path) l.path = [anchor(byId(l.from)), anchor(byId(l.to))];

  function drawParts() {
    const order = [...B.parts].sort((a, b) => (a.x + a.y + a.z * 0.01) - (b.x + b.y + b.z * 0.01) || a.z - b.z);
    for (const p of order) {
      const g = el('g', { class: `part c-${p.color} s-${p.status}`, 'data-id': p.id, tabindex: 0, role: 'button', 'aria-label': `${p.name}. ${B.statusNames[p.status]}. ${p.what}` }, layers.parts);
      box(g, p);
      const lab = el('g', { class: p.side ? 'label side' : 'label' }, g);
      if (p.side) {
        const [ax, ay] = iso(p.x, p.y + p.d, p.z + p.h / 2);
        el('line', { class: 'leader', x1: ax, y1: ay, x2: ax - p.side, y2: ay }, lab);
        const t = el('text', { x: ax - p.side - 6, y: ay + 4.5 }, lab);
        t.textContent = p.name;
      } else {
        const [cx, cy] = iso(p.x + p.w / 2, p.y + p.d / 2, p.z + p.h);
        const t = el('text', { x: cx, y: cy - 10 - (p.lift || 0) }, lab);
        t.textContent = p.name;
        if (p.lift) el('line', { class: 'leader', x1: cx, y1: cy, x2: cx, y2: cy - p.lift - 4 }, lab);
      }
      g.addEventListener('click', e => { e.stopPropagation(); if (pinMode) return addPinAt(e); select(p.id); });
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.id); } });
    }
    for (const gl of B.guides || []) el('line', { class: 'guide', x1: iso(...gl[0])[0], y1: iso(...gl[0])[1], x2: iso(...gl[1])[0], y2: iso(...gl[1])[1] }, layers.parts).parentNode.insertBefore(layers.parts.lastChild, layers.parts.firstChild);
  }

  function drawLinks() {
    for (const l of B.links) {
      const g = el('g', { class: `link s-${l.status}`, 'data-id': l.id }, layers.links);
      el('polyline', { class: 'pipe-under', points: pts(l.path) }, g);
      const pipe = el('polyline', { class: 'pipe', points: pts(l.path), 'marker-end': `url(#arrow-${l.status})` }, g);
      if (l.both) pipe.setAttribute('marker-start', `url(#arrow-${l.status})`);
      const ends = [iso(...l.path[0]), iso(...l.path.at(-1))];
      const mid = l.labelAt ? iso(...l.labelAt) : [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2];
      const lab = el('g', { class: 'pipe-label', transform: `translate(${mid[0]} ${mid[1]})` }, g);
      const r = el('rect', { rx: 9 }, lab);
      const t = el('text', { 'text-anchor': 'middle', dy: '0.35em' }, lab);
      t.textContent = l.label;
      requestAnimationFrame(() => {
        const bb = t.getBBox();
        r.setAttribute('x', bb.x - 8); r.setAttribute('y', bb.y - 3);
        r.setAttribute('width', bb.width + 16); r.setAttribute('height', bb.height + 6);
      });
    }
  }

  function fit() {
    const bb = svg.getBBox();
    const m = 24;
    svg.setAttribute('viewBox', `${bb.x - m} ${bb.y - m} ${bb.width + m * 2} ${bb.height + m * 2}`);
  }

  const narrow = matchMedia('(max-width: 44rem)');
  function bringPanel() {
    if (narrow.matches) panel.scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
  }
  function select(id) {
    selected = id;
    journey = null;
    stopRunner();
    syncHighlight();
    renderPanel();
    if (id) bringPanel();
  }

  function syncHighlight() {
    const active = new Set();
    const activeLinks = new Set();
    if (journey) {
      journey.steps.forEach(s => active.add(s.part));
      journey.links.forEach(id => { activeLinks.add(id); const l = B.links.find(x => x.id === id); active.add(l.from); active.add(l.to); });
    } else if (selected && byId(selected)) {
      active.add(selected);
      for (const l of B.links) if (l.from === selected || l.to === selected) { activeLinks.add(l.id); active.add(l.from); active.add(l.to); }
    }
    const any = active.size > 0;
    svg.classList.toggle('focusing', any);
    svg.querySelectorAll('.part').forEach(n => {
      n.classList.toggle('on', active.has(n.dataset.id));
      n.classList.toggle('picked', n.dataset.id === selected && !journey);
    });
    svg.querySelectorAll('.link').forEach(n => n.classList.toggle('on', activeLinks.has(n.dataset.id)));
    document.querySelectorAll('.journeys button').forEach(b => b.setAttribute('aria-pressed', String(journey?.id === b.dataset.id)));
  }

  function renderPanel() {
    panel.replaceChildren();
    if (journey) return renderJourney();
    const p = selected && byId(selected);
    if (!p) return renderIntro();
    const z = zoneOf(p.zone);
    panel.append(
      h('p', `where c-${z.color}`, z.name),
      h('h2', '', p.name),
      statusChip(p.status, p.color),
      h('p', 'what', p.what),
    );
    if (p.how?.length) {
      const ul = h('ul', 'how');
      p.how.forEach(t => ul.append(h('li', '', t)));
      panel.append(ul);
    }
    const links = B.links.filter(l => l.from === p.id || l.to === p.id);
    if (links.length) {
      panel.append(h('h3', '', 'Connected to'));
      const ul = h('ul', 'conn');
      for (const l of links) {
        const other = byId(l.from === p.id ? l.to : l.from);
        const li = h('li');
        const b = h('button', 'linkish', other.name);
        b.addEventListener('click', () => select(other.id));
        li.append(b, h('span', `muted s-${l.status}`, ` ${l.from === p.id ? 'sends' : 'gets'}: ${l.label}`));
        ul.append(li);
      }
      panel.append(ul);
    }
    if (p.where) panel.append(h('p', 'path', p.where));
    renderComments(`part:${p.id}`, `Your note on ${p.name}`);
  }

  function statusChip(s, color) {
    const c = h('p', `chip s-${s}${color ? ` c-${color}` : ''}`);
    c.append(h('span', 'swatch'), document.createTextNode(B.statusNames[s]));
    return c;
  }

  function renderIntro() {
    panel.append(h('h2', '', 'Tap any block'), h('p', 'what', B.intro));
    const ul = h('ul', 'how');
    B.introPoints.forEach(t => ul.append(h('li', '', t)));
    panel.append(ul);
    renderComments('general', 'A note on the whole picture');
  }

  function renderJourney() {
    panel.append(h('p', 'where', 'Follow a path'), h('h2', '', journey.name));
    const ol = h('ol', 'steps');
    journey.steps.forEach((s, i) => {
      const li = h('li');
      li.dataset.step = i;
      const b = h('button', 'linkish', byId(s.part).name);
      b.addEventListener('click', () => select(s.part));
      li.append(b, h('span', '', ` ${s.say}`));
      ol.append(li);
    });
    panel.append(ol);
    renderComments(`journey:${journey.id}`, `Your note on this path`);
  }

  function renderComments(target, placeholder) {
    const wrap = h('section', 'comments');
    const list = store.comments.filter(c => c.target === target);
    wrap.append(h('h3', '', list.length ? `Your notes (${list.length})` : 'Your notes'));
    for (const c of list) wrap.append(commentItem(c));
    const form = h('form', 'compose');
    const field = h('div', 'field');
    const ta = h('textarea');
    ta.placeholder = placeholder;
    ta.setAttribute('aria-label', placeholder);
    field.append(ta);
    const btn = h('button', 'primary', 'Add note');
    btn.type = 'submit';
    form.append(field, btn);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) return ta.focus();
      store.comments.push({ id: crypto.randomUUID(), target, text, at: new Date().toISOString() });
      persist();
      renderPanel();
      panel.querySelector('textarea')?.focus();
    });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });
    wrap.append(form);
    panel.append(wrap);
  }

  function commentItem(c) {
    const li = h('div', 'note');
    const meta = h('p', 'meta', new Date(c.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
    const del = h('button', 'linkish quiet', 'Remove');
    del.addEventListener('click', () => {
      const i = store.comments.findIndex(x => x.id === c.id);
      const [removed] = store.comments.splice(i, 1);
      persist(); renderPanel(); drawPins();
      toast('Note removed', () => { store.comments.splice(i, 0, removed); persist(); renderPanel(); drawPins(); });
    });
    meta.append(del);
    li.append(h('p', 'text', c.text), meta);
    return li;
  }

  function drawPins() {
    layers.pins.replaceChildren();
    store.comments.filter(c => c.target.startsWith('pin:')).forEach((c, i) => {
      const g = el('g', { class: 'pin', transform: `translate(${c.x} ${c.y})`, tabindex: 0, role: 'button', 'aria-label': `Pin ${i + 1}: ${c.text}` }, layers.pins);
      el('circle', { r: 13 }, g);
      const t = el('text', { 'text-anchor': 'middle', dy: '0.36em' }, g);
      t.textContent = i + 1;
      const open = e => { e.stopPropagation(); openPin(c); };
      g.addEventListener('click', open);
      g.addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
    });
  }

  function svgPoint(e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  function addPinAt(e) {
    const { x, y } = svgPoint(e);
    setPinMode(false);
    selected = null; journey = null; stopRunner(); syncHighlight();
    panel.replaceChildren(h('p', 'where', 'New pin'), h('h2', '', 'What should change here?'));
    const tmp = el('g', { class: 'pin draft', transform: `translate(${x} ${y})` }, layers.pins);
    el('circle', { r: 13 }, tmp);
    const form = h('form', 'compose');
    const field = h('div', 'field');
    const ta = h('textarea');
    ta.placeholder = 'Write your note';
    ta.setAttribute('aria-label', 'Pin note');
    field.append(ta);
    const ok = h('button', 'primary', 'Save pin'); ok.type = 'submit';
    const cancel = h('button', 'secondary', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => { tmp.remove(); renderPanel(); });
    form.append(field, ok, cancel);
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const text = ta.value.trim();
      if (!text) return ta.focus();
      store.comments.push({ id: crypto.randomUUID(), target: `pin:${Math.round(x)},${Math.round(y)}`, x: Math.round(x), y: Math.round(y), near: nearestPart(x, y), text, at: new Date().toISOString() });
      persist(); drawPins(); renderPanel();
    });
    panel.append(form);
    ta.focus();
  }

  function nearestPart(x, y) {
    let best = null, dist = Infinity;
    for (const p of B.parts) {
      const [cx, cy] = iso(p.x + p.w / 2, p.y + p.d / 2, p.z + p.h / 2);
      const d = Math.hypot(cx - x, cy - y);
      if (d < dist) { dist = d; best = p.id; }
    }
    return best;
  }

  function openPin(c) {
    selected = null; journey = null; stopRunner(); syncHighlight();
    const n = store.comments.filter(x => x.target.startsWith('pin:')).indexOf(c) + 1;
    panel.replaceChildren(h('p', 'where', `Pin ${n}${c.near ? ` · near ${byId(c.near)?.name}` : ''}`), h('h2', '', 'Your pinned note'));
    const list = h('section', 'comments');
    list.append(commentItem(c));
    panel.append(list);
  }

  function setPinMode(on) {
    pinMode = on;
    svg.classList.toggle('pinning', on);
    const b = document.getElementById('pin-btn');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? 'Tap the drawing to place it' : 'Drop a pin';
  }

  let runner = null;
  function stopRunner() { if (runner) cancelAnimationFrame(runner.raf); runner = null; layers.runner.replaceChildren(); }
  function startJourney(j) {
    journey = j; selected = null; stopRunner(); syncHighlight(); renderPanel();
    if (reduce.matches) { markStep(-1); return; }
    const segs = j.links.map(id => B.links.find(l => l.id === id));
    const dot = el('circle', { class: 'runner-dot', r: 7 }, layers.runner);
    let seg = 0, t0 = performance.now();
    const pathPts = l => l.path.map(p => iso(...p));
    const lens = segs.map(l => { const p = pathPts(l); let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; });
    markStep(0);
    const tick = now => {
      const l = segs[seg]; const p = pathPts(l);
      const dur = Math.max(700, lens[seg] * 4);
      let k = Math.min(1, (now - t0) / dur);
      k = 1 - Math.pow(1 - k, 2);
      let target = k * lens[seg], acc = 0, pos = p[0];
      for (let i = 1; i < p.length; i++) {
        const sl = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        if (acc + sl >= target) { const f = (target - acc) / sl; pos = [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f]; break; }
        acc += sl; pos = p[i];
      }
      dot.setAttribute('cx', pos[0]); dot.setAttribute('cy', pos[1]);
      if (now - t0 >= dur) {
        seg++; markStep(seg);
        if (seg >= segs.length) { runner.raf = 0; setTimeout(() => dot.remove(), 600); return; }
        t0 = now + 350;
      }
      runner.raf = requestAnimationFrame(tick);
    };
    runner = { raf: requestAnimationFrame(tick) };
  }
  function markStep(i) {
    panel.querySelectorAll('.steps li').forEach(li => li.classList.toggle('reached', i < 0 || Number(li.dataset.step) <= i));
  }

  function updateCount() {
    const n = store.comments.length;
    document.getElementById('note-count').textContent = n === 1 ? '1 note' : `${n} notes`;
  }
  function setSaveState(t) { document.getElementById('save-state').textContent = t; }
  async function writeFile() {
    const fh = await dirHandle.getFileHandle('blueprint-comments.json', { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify({ savedAt: new Date().toISOString(), ...store }, null, 2));
    await w.close();
    setSaveState(`Saved to ${dirHandle.name}/blueprint-comments.json`);
  }
  async function saveToFolder() {
    if (!window.showDirectoryPicker) return download();
    try {
      dirHandle = await showDirectoryPicker({ id: 'rpm-blueprint', mode: 'readwrite' });
      await writeFile();
    } catch (e) { if (e.name !== 'AbortError') download(); }
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }));
    a.download = 'blueprint-comments.json';
    a.click();
    setSaveState('Downloaded blueprint-comments.json');
  }
  async function copyNotes() {
    const label = c => c.target === 'general' ? 'Whole picture' : c.target.startsWith('part:') ? byId(c.target.slice(5))?.name : c.target.startsWith('journey:') ? `Path: ${B.journeys.find(j => j.id === c.target.slice(8))?.name}` : `Pin near ${byId(c.near)?.name || 'the drawing'}`;
    const md = store.comments.map(c => `- **${label(c)}**: ${c.text}`).join('\n') || '(no notes yet)';
    await navigator.clipboard.writeText(`Blueprint notes\n\n${md}`);
    setSaveState('Copied. Paste it into the chat.');
  }

  function toast(text, undo) {
    const t = document.getElementById('toast');
    t.replaceChildren(h('span', '', text));
    if (undo) { const b = h('button', 'linkish', 'Undo'); b.addEventListener('click', () => { undo(); t.hidePopover?.(); }); t.append(b); }
    t.showPopover?.();
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.hidePopover?.(), 5000);
  }

  function buildControls() {
    const legend = document.getElementById('legend');
    for (const s of ['live', 'branch', 'planned']) legend.append(statusChip(s));
    const jw = document.getElementById('journeys');
    for (const j of B.journeys) {
      const b = h('button', 'secondary', j.name);
      b.dataset.id = j.id;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => journey?.id === j.id ? select(null) : startJourney(j));
      jw.append(b);
    }
    document.getElementById('pin-btn').addEventListener('click', () => setPinMode(!pinMode));
    document.getElementById('save-btn').addEventListener('click', saveToFolder);
    document.getElementById('copy-btn').addEventListener('click', copyNotes);
    svg.addEventListener('click', e => { if (pinMode) addPinAt(e); else select(null); });
    addEventListener('keydown', e => { if (e.key === 'Escape') { if (pinMode) setPinMode(false); else select(null); } });
  }

  drawZones(); drawLinks(); drawParts(); drawPins(); fit();
  buildControls(); updateCount(); renderPanel();
})();
