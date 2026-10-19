import {h, key, fill} from './dom.mjs';
import {taskPlate, emptyPlate} from './plate.mjs';
import {inboxTasks} from '../model/plan.mjs';
import {duration, plural} from '../../../android-companion/planner/format.mjs';

function draftPlate(ctx, draft) {
  const count = draft.receipt.length;
  return h('article.plate.draft', {},
    h('div.plate-open', {},
      h('span.plate-title', {}, draft.title || 'Draft from Capture'),
      h('span.plate-meta', {}, `Draft from Capture · ${plural(count, 'proposal')}`)),
    h('span.plate-tail', {}, key('Review', () => ctx.openDraft(draft), {cls: 'small', aria: `Review draft: ${draft.title}`})));
}

export function renderInbox(ctx, floor) {
  if (ctx.state.phase !== 'ready') return fill(floor), {count: null};
  const tasks = inboxTasks(ctx.view.snapshot);
  const drafts = ctx.view.snapshot.drafts;
  floor.dataset.dropInbox = '';
  fill(floor, 
    tasks.length
      ? h('div.plate-list', {}, tasks.map(t => taskPlate(ctx, t, {meta: ['Inbox', t.minutes ? duration(t.minutes) : null]})))
      : emptyPlate('Nothing in the Inbox. Capture something below.'),
    drafts.length ? h('section.drafts', {'aria-label': 'Drafts'},
      h('h3.section-sign', {}, `Drafts (${drafts.length})`),
      drafts.map(d => draftPlate(ctx, d))) : null,
    h('div.light', {'aria-hidden': 'true'}),
  );
  return {count: tasks.length};
}
