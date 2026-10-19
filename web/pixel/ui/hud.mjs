import {h} from './dom.mjs';
import {icon} from './icons.mjs';
import {logGlass} from './today-room.mjs';
import {waterToday, mealsToday} from '../model/today.mjs';
import {clock} from '../../../android-companion/planner/format.mjs';
import {userMessage} from '../../../android-companion/user-message.mjs';

const STALE_MINUTES = 15;

function ago(minutes) {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}

/** How fresh the phone's copy is, in the HUD's short label and the full sentence under it. */
export function phoneHealth(state, now) {
  if (state.phase === 'loading') return {health: 'loading', label: 'Connecting…', line: 'Looking for your phone’s copy of the plan…', tone: 'fresh'};
  const savedAt = state.snapshot ? new Date(state.snapshot.savedAt) : null;
  if (!state.online) return {health: 'offline', label: 'Offline', tone: 'warn',
    line: `You're offline. Showing the copy from ${savedAt ? clock(savedAt) : 'earlier'}.`};
  const minutes = Math.max(0, Math.floor((now - savedAt) / 60000));
  if (minutes > STALE_MINUTES) return {health: 'stale', label: `Heard ${ago(minutes)}`, tone: 'warn',
    line: `Last heard from the phone ${ago(minutes)}. Changes wait until it opens.`};
  return {health: 'fresh', label: `Synced ${ago(minutes)}`, line: `Phone synced ${ago(minutes)}.`, tone: 'fresh'};
}

export function renderHud(ctx, hud) {
  const ready = ctx.state.phase === 'ready';
  const now = ctx.now();
  const water = ready ? waterToday(ctx.view.snapshot, now) : null;
  const meals = ready ? mealsToday(ctx.view.snapshot, now).filter(m => m.slot !== 'snack') : [];
  const waterPending = ctx.view.pending.has('water');
  const phone = phoneHealth(ctx.state, now);
  const left = h('div.hud-left', {},
    water ? h('button.hud-btn', {type: 'button', dataset: {pending: waterPending ? '' : null, focusKey: 'hud:water'},
      'aria-label': `Water: ${water.count} of ${water.goal} glasses. Log a glass`, onclick: () => logGlass(ctx)},
    icon('drop', {variant: waterPending ? 'dashed' : 'full'}),
    h('span.label.tnum', {}, h('span.long', {}, `${water.count} of ${water.goal}`), h('span.short', {}, `${water.count}/${water.goal}`))) : null,
    h('div.hearts', {role: 'group', 'aria-label': 'Meals today'}, meals.map(meal => {
      const name = meal.label.split(' · ')[0];
      return h('button.heart', {type: 'button', title: meal.meal ? `${name}: ${meal.meal.name}` : `${name}: not logged`,
        'aria-label': meal.meal ? `${name} logged: ${meal.meal.name}` : `${name} not logged. Log it`,
        dataset: {pending: ctx.view.pending.has(`meal:${meal.slot}`) ? '' : null, focusKey: `hud:meal:${meal.slot}`},
        onclick: event => ctx.openMeal(meal, event.currentTarget)}, icon('heart', {variant: meal.meal ? 'full' : 'empty'}));
    })));
  const dots = h('nav.dots', {'aria-label': 'Rooms'}, ctx.rooms.map(room => h('button.dot', {type: 'button',
    'aria-label': `Go to ${room.name}`, 'aria-current': String(room.id === ctx.room), title: room.name,
    dataset: {focusKey: `dot:${room.id}`}, onclick: () => ctx.goRoom(room.id, {focus: true})})));
  const right = h('div.hud-right', {},
    h('span.phone-label', {}, phone.label),
    h('span.phone-square', {dataset: {health: phone.health}, role: 'img', 'aria-label': `Phone: ${phone.line}`},
      icon('phone', {variant: phone.health === 'fresh' ? 'full' : 'dashed'})));
  const line = ctx.state.error ? userMessage(ctx.state.error) : phone.line;
  hud.replaceChildren(h('div.hud-bar', {}, left, dots, right),
    h('p.hud-status', {role: 'status', dataset: {tone: ctx.state.error ? 'warn' : phone.tone}}, line));
}
