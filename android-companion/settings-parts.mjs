/** Settings building blocks: list rows, inset card groups, sliders and segmented choices. Rows act through ctx.act. */

export const el = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
};
export const symbol = (name, cls = '') => {
  const node = el('span', cls ? `ms ${cls}` : 'ms', name);
  node.setAttribute('aria-hidden', 'true');
  return node;
};
export const safeScale = value => Math.max(80, Math.min(160, Number.isInteger(value) ? value : 100));

/**
 * One list row: an optional icon tile, the title, a line of detail and a trailing value, switch, chevron or action word (`act`).
 * `tone: 'error'` marks a row that needs the person (a missing permission) or removes something.
 */
export function row({label, detail = '', value = '', action, role = null, toggle = null, icon = null, tile = null, next = false, tone = null, act = null}) {
  const node = el('button', 'settings-row');
  node.type = 'button';
  if (action) node.dataset.action = action;
  if (tone) node.dataset.tone = tone;
  if (icon) {
    const box = el('span', 'settings-icon');
    if (tile) box.dataset.tone = tile;
    box.append(symbol(icon));
    node.append(box);
  }
  const copy = el('span', 'settings-copy');
  copy.append(el('span', 'settings-label', label));
  if (detail) copy.append(el('span', 'settings-detail', detail));
  node.append(copy);
  if (role) node.setAttribute('role', role);
  if (toggle !== null) {
    node.setAttribute('aria-checked', String(toggle));
    const track = el('span', 'switch');
    track.append(el('span', 'switch-thumb'));
    node.append(track);
    return node;
  }
  if (value) node.append(el('span', 'settings-value', value));
  if (next) node.append(symbol('chevron_right'));
  else if (act) {
    const word = el('span', 'settings-act', act);
    word.setAttribute('aria-hidden', 'true');
    node.append(word);
  }
  return node;
}

/** Paints a range's active track: `--fill` is how far along the thumb sits. */
export function trackFill(input) {
  const span = Number(input.max) - Number(input.min);
  input.style.setProperty('--fill', (span ? (Number(input.value) - Number(input.min)) / span * 100 : 0) + '%');
}

/** The words at a slider's two ends. */
export function sliderEnds(document, start, end) {
  const ends = document.createElement('div');
  ends.className = 'settings-slider-ends';
  ends.setAttribute('aria-hidden', 'true');
  for (const text of [start, end]) {
    const word = document.createElement('span');
    word.textContent = text;
    ends.append(word);
  }
  return ends;
}

/** A titled group: an optional heading, one inset card of rows, and an optional caption under it. */
export function group(title = '', {id = null, caption = ''} = {}) {
  const section = el('section', 'settings-group');
  if (id) section.dataset.section = id;
  if (title) section.append(el('h2', '', title));
  const card = el('div', 'settings-card');
  section.append(card);
  if (caption) section.append(el('p', 'settings-caption', caption));
  section.card = card;
  return section;
}

/** A row that runs a native settings action. */
export function add(ctx, section, spec) {
  const node = row(spec);
  node.addEventListener('click', () => ctx.act(ctx, spec.action));
  section.card.append(node);
  return node;
}

export function slider(ctx, section, label, detail, value, min, max, action) {
  const wrap = el('div', 'settings-slider');
  wrap.dataset.action = action;
  const head = el('div', 'settings-slider-head');
  const output = el('output', 'settings-value tnum', value + '%');
  head.append(el('label', '', label), output);
  const input = el('input', 'fact-slider');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.setAttribute('aria-label', label);
  const sample = el('p', 'widget-text-preview', 'A clear next action');
  sample.style.fontSize = value / 100 + 'em';
  sample.setAttribute('aria-label', 'Widget text size preview');
  trackFill(input);
  wrap.append(head, el('span', 'settings-detail', detail), input, sliderEnds(document, min + '%', max + '%'), sample);
  input.addEventListener('input', () => {
    trackFill(input);
    output.textContent = input.value + '%';
    sample.style.fontSize = Number(input.value) / 100 + 'em';
  });
  input.addEventListener('change', () => ctx.act(ctx, action, {value: Number(input.value)}));
  section.card.append(wrap);
}

/** A connected segmented button of radio segments under its label; the chosen one carries a check. Choosing applies at once. */
export function segmented(name, label, options, current, onChoose) {
  const wrap = el('div', 'settings-segment-row');
  wrap.append(el('span', 'settings-label', label));
  const seg = el('div', 'segmented');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', label);
  for (const [value, text] of Object.entries(options)) {
    const option = el('label', 'segment');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = value === current;
    input.addEventListener('change', () => onChoose(value));
    option.append(input, symbol('check'), el('span', '', text));
    seg.append(option);
  }
  wrap.append(seg);
  return wrap;
}
