// Copy of NotchPill, NotchContent and IslandView: one black island that morphs between the pill, the open island and the alert islands.
import {S24} from './device.mjs';
import {D, dp, css, anchor, ISLAND_INSET_DP} from './notch-geometry.mjs';
import {el, glyph, text, iconCircle, button, plain, accent, lookOf, TILE} from './notch-parts.mjs';
import {alertFace} from './notch-alert.mjs';
import {swipeable} from './notch-gesture.mjs';

const RADIUS = {open: 32, reminder: 28, alarm: 28};

function measure(stage, value) {
  const probe = text(value, 15, '#fff', 600, 'notch-text notch-probe');
  stage.append(probe);
  const width = Math.ceil(probe.getBoundingClientRect().width * D);
  probe.remove();
  return width;
}

function describe(primary, secondary, scene) {
  const say = item => item.kind === 'WATER' ? `Water due, ${scene.water.count} of ${scene.water.goal} glasses`
    : item.kind === 'HABIT' ? `${scene.habit.routine.name}, ${scene.habit.done} of ${scene.habit.total} steps done` : scene.spoken;
  return say(primary) + (secondary ? '. Also ' + say(secondary) : '') + '. Opens the island.';
}

function pillFace(stage, {primary, secondary, scene, note, onTap}) {
  const a = anchor(), h = a.pill, look = lookOf(primary.kind, scene), value = note?.text ?? primary.text;
  const circle = Math.min(h - dp(8), dp(28)), inset = Math.floor((h - circle) / 2);
  const keep = Math.max(dp(24), a.hole + dp(12));
  const lead = inset + circle + dp(8), trail = measure(stage, value) + dp(8) + dp(14) + (note?.chip ? dp(16) : 0);
  const side = Math.max(lead, trail, Math.floor((dp(140) - keep + 1) / 2)), w = side + keep + side;
  const x = Math.max(dp(4), Math.min(a.centerX - Math.floor(keep / 2) - side, S24.width - w - dp(4)));
  const face = button('island-face notch-pill', note?.spoken ?? describe(primary, secondary, scene), onTap);
  face.style.setProperty('--face-w', css(w));
  face.style.blockSize = css(h);
  const icon = iconCircle(look, circle);
  icon.style.marginInlineStart = css(inset);
  icon.style.marginInlineEnd = css(side - inset - circle);
  const color = plain(look) || note ? '#fff' : accent(look);
  const shown = text(value, 15, color, 600, 'notch-text' + (note?.chip ? ' notch-chip' : ''));
  const slot = el('span', 'notch-value');
  Object.assign(slot.style, {inlineSize: css(side), paddingInline: `${css(dp(8))} ${css(dp(14))}`, marginInlineStart: css(keep)});
  slot.append(shown);
  face.append(icon, slot);
  return {face, geo: {x: x / D, w: w / D, h: h / D, r: h / D / 2}};
}

function control(icon, label, spoken, enabled, action) {
  const b = button('notch-control', enabled ? spoken : spoken + ', not available now', action);
  b.disabled = !enabled;
  b.append(glyph(null, icon), el('span', 'notch-control-label', {textContent: label}));
  return b;
}

function dots(count, goal) {
  const row = el('span', 'notch-dots');
  row.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < goal; i++) row.append(el('span', i < count ? 'notch-dot on' : 'notch-dot'));
  return row;
}

function row(r, scene) {
  const line = el('div', 'notch-row');
  const g = glyph(r.look);
  g.style.color = accent(r.look);
  line.append(g, text(r.title, 15, 'rgb(255 255 255 / .87)', 400, 'notch-text notch-row-title'));
  if (r.look === 'WATER') line.append(dots(scene.water.count, scene.water.goal), text(`${scene.water.count}/${scene.water.goal}`, 14, accent('WATER'), 500));
  else if (r.look === 'MEAL') line.append(el('span', 'notch-ring', {role: 'img', ariaLabel: 'Not logged'}));
  else if (r.look === 'HABIT') line.append(text(`${scene.habit.done}/${scene.habit.total}`, 14, accent('HABIT'), 500));
  else line.append(text(r.value, 14, 'rgb(255 255 255 / .7)', 400));
  return line;
}

function openFace(scene, actions) {
  const look = scene.heroLook, face = el('div', 'island-face island-open');
  const hero = el('div', 'notch-hero');
  const tile = el('span', 'notch-tile');
  tile.style.background = TILE[look] ?? '#0B57D0';
  tile.append(glyph(look));
  const words = el('div', 'notch-words');
  words.append(text(scene.heroTitle, 17, '#fff', 600), text(scene.heroSubtitle, 14, accent(look), 400, 'notch-text notch-sub'));
  hero.append(tile, words);
  const bar = el('div', 'notch-bar');
  const track = el('span', 'notch-track'), fill = el('span', 'notch-fill');
  fill.style.cssText = `inline-size:max(4px, ${scene.progress * 100}%);background:${plain(look) ? 'rgb(255 255 255 / .87)' : accent(look)}`;
  track.append(fill);
  bar.append(text(scene.barStart, 12, 'rgb(255 255 255 / .6)', 500), track, text(scene.barEnd, 12, 'rgb(255 255 255 / .6)', 500));
  const controls = el('div', 'notch-controls');
  controls.append(control('notch_ic_done', 'Done', 'Done: ' + scene.heroTitle, scene.canDone, actions.done),
    control('notch_ic_snooze', 'Snooze', `Snooze ${scene.snoozeMinutes} minutes`, scene.canSnooze, actions.snooze),
    scene.meal ? control('notch_ic_meal', 'Log meal', 'Log a meal', scene.canLogMeal, actions.logMeal)
      : control('ic_open', 'Open plan', 'Open the plan', true, actions.openPlan));
  face.append(hero, bar, controls, ...scene.rows.slice(0, 2).map(r => row(r, scene)));
  return face;
}

function paintSplit(stage, island, {mode, secondary, scene}, pill) {
  let split = stage.querySelector(':scope > .notch-split');
  if (!secondary) return split?.remove();
  const a = anchor(), h = a.pill;
  if (!split) {
    split = el('span', 'notch-split');
    split.setAttribute('aria-hidden', 'true');
    island.before(split);
  }
  const look = lookOf(secondary.kind, scene);
  if (split.dataset.look !== look) {
    split.dataset.look = look;
    split.replaceChildren(iconCircle(look, Math.min(h - dp(8), dp(28))));
  }
  if (mode === 'pill') {
    const cx = pill.x - dp(8) / D - h / D / 2;
    Object.assign(split.style, {insetInlineStart: `${cx - h / D / 2}px`, insetBlockStart: css(a.top), inlineSize: css(h), blockSize: css(h), translate: ''});
    split.dataset.state = 'shown';
  } else {
    const at = parseFloat(split.style.insetInlineStart) || 0;
    split.style.translate = `${ISLAND_INSET_DP - at}px 0`;
    split.dataset.state = 'away';
  }
}

function settle(island, face, same) {
  for (const old of island.querySelectorAll(':scope > .island-face')) {
    if (same) { old.remove(); continue; }
    if (old.dataset.state === 'leaving') continue;
    old.dataset.state = 'leaving';
    old.inert = true;
    Promise.allSettled(old.getAnimations().map(a => a.finished)).then(() => old.remove());
  }
  if (same) face.dataset.enter = 'instant';
  island.append(face);
}

/**
 * Draws the island for one moment and morphs to it from what is on screen. Returns false when the phone would hide it.
 * mode is 'pill', 'open', 'reminder' or 'alarm'; gestures maps each mode to its swipe handlers.
 */
export function renderNotch(stage, opts) {
  const {scene, primary, mode, alert, fontScale, actions, gestures, instant = false} = opts;
  stage.style.setProperty('--font-scale', fontScale);
  stage.dataset.text = fontScale > 1.3 ? 'large' : 'normal';
  const alerting = mode === 'reminder' || mode === 'alarm';
  if (!alerting && !primary) {
    stage.replaceChildren();
    return false;
  }
  let island = stage.querySelector(':scope > .island');
  const first = !island;
  if (first) {
    island = el('div', 'island');
    stage.append(island);
    swipeable(island, () => island.gestures ?? {});
  }
  island.gestures = gestures?.[mode] ?? {};
  const same = island.dataset.mode === mode;
  let face, geo;
  if (mode === 'pill') {
    ({face, geo} = pillFace(stage, opts));
  } else {
    face = alerting ? alertFace(alert, actions) : openFace(scene, actions);
    const w = (S24.width - 2 * dp(ISLAND_INSET_DP)) / D;
    face.style.setProperty('--face-w', `${w}px`);
    face.style.paddingBlockStart = `calc(${css(anchor().pill)} + 8px)`;
    geo = {x: ISLAND_INSET_DP, w, r: RADIUS[mode]};
  }
  settle(island, face, same || first || instant);
  geo.h ??= face.getBoundingClientRect().height;
  island.dataset.motion = first || instant ? 'none' : mode === 'pill' ? 'close' : mode === 'open' ? 'open' : 'alert';
  island.dataset.mode = mode;
  Object.assign(island.style, {insetInlineStart: `${geo.x}px`, insetBlockStart: css(anchor().top), inlineSize: `${geo.w}px`,
    blockSize: `${geo.h}px`, borderRadius: `${geo.r}px`});
  paintSplit(stage, island, opts, geo);
  if (island.dataset.motion === 'none') {
    island.getBoundingClientRect();
    island.dataset.motion = 'idle';
  }
  return true;
}
