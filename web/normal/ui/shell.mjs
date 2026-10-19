/** The frame around every view: navigation, the phone status chip, the heading and the sync notices. */
import {h, icon, ago, ago2, swap} from './dom.mjs';
import {userMessage} from '../../../android-companion/user-message.mjs';
import {waiting} from '../core/store.mjs';

export const VIEWS = [
  {id: 'today', label: 'Today', symbol: 'today'},
  {id: 'week', label: 'Week', symbol: 'calendar_view_week'},
  {id: 'blocks', label: 'Blocks', symbol: 'stacks'},
  {id: 'inbox', label: 'Inbox', symbol: 'inbox'},
];

const CHIP = {
  fresh: {symbol: 'smartphone', line: p => ago(p.age)},
  stale: {symbol: 'phonelink_off', line: p => ago(p.age)},
  syncing: {symbol: 'sync', line: () => 'Checking…'},
  offline: {symbol: 'phonelink_off', line: () => 'Offline'},
};

function phoneChip(phone, onclick, compact = false) {
  const chip = CHIP[phone.kind];
  const tip = phone.savedAt ? `Plan saved on your phone ${new Date(phone.savedAt).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})}` : 'No plan from your phone yet';
  return h('button.phone-chip', {type: 'button', 'data-kind': phone.kind, onclick, 'aria-label': `Phone: ${chip.line(phone)}. ${tip}`},
    icon(chip.symbol),
    compact ? h('span', phone.kind === 'offline' ? 'Offline' : phone.kind === 'syncing' ? 'Checking…' : ago2(phone.age))
      : h('span.phone-lines', h('span', phone.kind === 'offline' ? 'Browser' : 'Phone'), h('span', chip.line(phone))),
    compact ? null : h('span.phone-tip', {'aria-hidden': 'true'}, tip));
}

export function renderNav(nav, ctx) {
  swap(nav,
    h('span.nav-brand', 'RPM'),
    h('div.nav-items', VIEWS.map(v => h('a.nav-item', {href: `#/${v.id}`, 'aria-current': ctx.route.view === v.id ? 'page' : null, 'data-view': v.id},
      h('span.nav-pill', icon(v.symbol)), h('span.nav-label', v.label)))),
    h('div.nav-tools',
      h('button.capture-toggle', {type: 'button', 'aria-pressed': String(ctx.captureOpen), 'aria-controls': 'capture',
        'aria-label': ctx.captureOpen ? 'Close Capture' : 'Open Capture', title: 'Capture (c)', onclick: ctx.toggleCapture},
      icon('edit_note', {fill: ctx.captureOpen}), h('span.toggle-word', 'Capture')),
      phoneChip(ctx.phone, ctx.openSettings)));
}

export function renderHead(head, ctx, title, sub) {
  swap(head, h('h1', title), sub ? h('span.head-sub', sub) : null,
    h('div.head-end', ctx.demo ? h('span.demo-label', {title: 'A pretend phone answers here, so nothing reaches your real plan.'}, 'Demo data') : null,
      phoneChip(ctx.phone, ctx.openSettings, true)));
}

export function renderNotices(region, ctx) {
  const {phone, state} = ctx, items = [];
  if (phone.kind === 'offline') {
    items.push(h('div.banner', {role: 'status'}, icon('cloud_off'), h('span', "You're offline. Changes you make wait here and send when you're back.")));
  } else if (phone.kind === 'stale') {
    items.push(h('div.banner', {role: 'status'}, icon('phonelink_off'), h('span', `Showing your plan as of ${ago(phone.age)}. Open RPM on your phone to catch up.`)));
  }
  if (state.phase === 'no-snapshot') items.push(h('div.banner', icon('smartphone'), h('span', 'Your phone has not shared a plan yet. Open RPM on your phone.')));
  if (state.problem && phone.kind !== 'offline') items.push(h('div.banner.warning', {role: 'alert'}, icon('error_outline'), h('span', userMessage(state.problem))));
  const count = waiting(state);
  if (count > 3) items.push(h('p.on-their-way', {role: 'status'}, icon('schedule'), `${count} changes on their way to your phone.`));
  swap(region, ...items);
}
