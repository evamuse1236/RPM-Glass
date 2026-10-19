import {h, key} from './dom.mjs';
import {icon} from './icons.mjs';
import {ROOMS, neighbour, isCorridor, corridorStep} from './walk.mjs';
import {renderHud} from './hud.mjs';
import {renderToday} from './today-room.mjs';
import {renderWeek} from './week-room.mjs';
import {renderInbox} from './inbox-room.mjs';
import {renderQuests} from './quests-room.mjs';
import {buildDesk, renderReceipts} from './capture-desk.mjs';
import {createSheet} from './sheet.mjs';
import {createToast, UNDO_MS} from './toast.mjs';
import {toggleDone} from './plate.mjs';
import {enableDrag} from './drag.mjs';
import {linkScreen} from './link-screen.mjs';
import {localDay} from '../model/plan.mjs';

const RENDERERS = {today: renderToday, week: renderWeek, inbox: renderInbox, quests: renderQuests};
const WALK_KEYS = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down'};
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const typing = node => node?.closest?.('input, textarea, select, [contenteditable="true"]');

export function mountApp(root, {store, now, demo, storage}) {
  const ctx = {store, now, demo, rooms: ROOMS, room: 'today', dragging: false,
    cache: {hiddenAsks: new Set(), weekDay: null, openQuests: new Set(), today: null},
    get state() { return store.state; },
    get view() { return store.view(); }};
  const toast = createToast(ctx);
  const sheet = createSheet(ctx);

  ctx.act = (type, args, label, {toast: show = true} = {}) => {
    const entry = store.act(type, args, {label});
    ctx.lastEntry = entry;
    if (show) toast.show(entry);
    return entry;
  };
  ctx.undoLast = () => {
    const entry = toast.entry ?? (ctx.lastEntry && now() - ctx.lastEntry.at < UNDO_MS ? ctx.lastEntry : null);
    if (entry) store.undo(entry.command.id);
  };
  Object.assign(ctx, {openTask: sheet.openTask, fillGap: sheet.fillGap, openMeal: sheet.openMeal, openDraft: sheet.openDraft});

  const hud = h('header.hud');
  const desk = buildDesk(ctx);
  const sections = {}, floors = {}, signs = {};
  for (const room of ROOMS) {
    signs[room.id] = h('span.sign-count.tnum', {hidden: true});
    floors[room.id] = room.id === 'capture'
      ? h('div.floor.desk-floor', {}, desk.desk, desk.asks, desk.receipts, h('div.light', {'aria-hidden': 'true'}))
      : h('div.floor');
    sections[room.id] = h('section.room', {tabindex: '-1', 'aria-labelledby': `name-${room.id}`, dataset: {area: room.id, room: room.id}},
      h('div.wall', {}, h('h2.sign', {id: `name-${room.id}`}, room.name, signs[room.id])), floors[room.id]);
  }
  const hero = h('div.hero', {'aria-hidden': 'true'}, h('span.frame-stand', {}, icon('hero')), h('span.frame-step', {}, icon('heroStep')));
  const map = h('main.map', {id: 'map'}, h('div.rooms', {}, ROOMS.map(r => sections[r.id])), hero);
  const bar = h('nav.dpad-bar', {'aria-label': 'Move and act'},
    h('div.cross', {},
      key(icon('right'), () => window.scrollBy({top: -innerHeight * 0.6, behavior: reducedMotion() ? 'auto' : 'smooth'}), {cls: 'up', aria: 'Scroll up'}),
      key(icon('right'), () => step(-1), {cls: 'left', aria: 'Previous room'}),
      key(icon('right'), () => window.scrollBy({top: innerHeight * 0.6, behavior: reducedMotion() ? 'auto' : 'smooth'}), {cls: 'down', aria: 'Scroll down'}),
      key(icon('right'), () => step(1), {cls: 'right', aria: 'Next room'})),
    h('div.bar-keys', {},
      key('Capture', () => focusCapture(), {hint: 'C'}),
      key('Done', () => doneHere(), {cls: 'filled', aria: 'Mark the selected task done'})));

  const boxes = () => Object.fromEntries(ROOMS.map(r => {
    const b = sections[r.id].getBoundingClientRect();
    return [r.id, {left: b.left + scrollX, top: b.top + scrollY, width: b.width, height: b.height}];
  }));

  function placeHero(walking = false) {
    const spot = ctx.room === 'today' ? map.querySelector('[data-hero-spot]') : null;
    const anchor = spot ?? sections[ctx.room].querySelector('.sign');
    if (!anchor) return;
    const m = map.getBoundingClientRect(), a = anchor.getBoundingClientRect();
    const x = spot ? a.left - m.left : a.right - m.left + 12;
    const y = spot ? a.top - m.top : sections[ctx.room].getBoundingClientRect().top - m.top + 8;
    hero.style.setProperty('--hx', `${Math.round(x / 2) * 2}px`);
    hero.style.setProperty('--hy', `${Math.round(y / 2) * 2}px`);
    if (walking && !reducedMotion()) {
      hero.dataset.walking = '';
      setTimeout(() => delete hero.dataset.walking, 250);
    }
  }

  function goRoom(id, {focus = false, scroll = focus} = {}) {
    const moved = id !== ctx.room;
    ctx.room = id;
    for (const r of ROOMS) sections[r.id].toggleAttribute('data-current', r.id === id);
    renderHud(ctx, hud);
    placeHero(moved);
    if (focus) sections[id].focus({preventScroll: true});
    if (scroll) sections[id].scrollIntoView({block: isCorridor(boxes()) ? 'start' : 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth'});
  }
  ctx.goRoom = goRoom;

  function step(direction) {
    const next = typeof direction === 'number'
      ? corridorStep(ROOMS.map(r => r.id), ctx.room, direction)
      : neighbour(boxes(), ctx.room, direction);
    if (next && next !== ctx.room) goRoom(next, {focus: true});
  }

  function focusCapture() {
    goRoom('capture', {scroll: true});
    desk.focus();
  }
  ctx.answerDraft = draft => {
    desk.area.placeholder = `Your answer to: ${draft.reply || draft.title}`;
    focusCapture();
  };

  function doneHere() {
    const plate = document.activeElement?.closest?.('.plate[data-task]') ?? map.querySelector('.lead .plate[data-task]');
    if (plate?.rpmTask) toggleDone(ctx, plate.rpmTask, plate.dataset.state === 'done');
  }

  let queued = false;
  function render() {
    if (store.state.phase === 'unlinked') return showLink();
    if (!map.isConnected) showMap();
    const focusKey = document.activeElement?.closest?.('[data-focus-key]')?.dataset.focusKey;
    renderHud(ctx, hud);
    if (!ctx.dragging) {
      for (const [id, draw] of Object.entries(RENDERERS)) {
        const {count} = draw(ctx, floors[id]) ?? {};
        signs[id].hidden = count == null;
        signs[id].textContent = count ?? '';
      }
      floors.today.dataset.dropDay = localDay(now());
      renderReceipts(ctx, desk);
    }
    toast.render();
    placeHero();
    if (focusKey && (!document.activeElement || document.activeElement === document.body)) {
      root.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({preventScroll: true});
    }
  }
  ctx.render = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  };

  function showMap() {
    root.replaceChildren(hud, map, h('div.snap-end'), bar, toast.zone);
    goRoom(ctx.room);
  }
  function showLink() {
    if (root.querySelector('.link-screen')) return;
    root.replaceChildren(linkScreen(ctx, {storage, onLinked: () => { showMap(); ctx.render(); }}));
  }

  map.addEventListener('focusin', event => {
    const room = event.target.closest('.room')?.dataset.room;
    if (room && room !== ctx.room) goRoom(room);
  });
  map.addEventListener('pointerdown', event => {
    const room = event.target.closest('.room')?.dataset.room;
    if (room && room !== ctx.room) goRoom(room);
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
    if (sheet.panel.matches(':popover-open') || !map.isConnected) return;
    const walk = WALK_KEYS[event.key];
    if (walk) {
      if (isCorridor(boxes()) && (walk === 'up' || walk === 'down')) {
        if (event.key.length === 1) window.scrollBy({top: (walk === 'up' ? -1 : 1) * innerHeight * 0.25});
        return;
      }
      event.preventDefault();
      step(isCorridor(boxes()) ? (walk === 'left' ? -1 : 1) : walk);
    } else if (event.key === 'c') {
      event.preventDefault();
      focusCapture();
    } else if (event.key === 'z') {
      ctx.undoLast();
    } else if (event.key === '?') {
      sheet.keyList();
    }
  });
  enableDrag(ctx, root);
  new ResizeObserver(() => placeHero()).observe(map);
  document.fonts?.ready.then(() => placeHero());
  store.subscribe(ctx.render);
  setInterval(ctx.render, 30000);
  render();
  return ctx;
}
