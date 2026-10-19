/** Inbox: tasks with no Block or day, a column of Blocks to drop them on, and the drafts Capture proposed. */
import {h, icon, emptyState} from './dom.mjs';
import {taskRow, sectionHeader} from './rows.mjs';
import {inboxTasks, blockList} from '../core/model.mjs';
import {plural} from '../../../android-companion/planner/format.mjs';

function draftCard(draft) {
  return h('article.draft-card',
    h('h3', `Proposed: ${draft.title || 'an arrangement'}`),
    draft.reply ? h('p.quiet', draft.reply) : null,
    draft.receipt.length ? h('ul.draft-lines', draft.receipt.map(line => h('li', line.text))) : null,
    h('p.detail-note', 'Accept or leave this out on your phone.'));
}

export function renderInbox(ctx) {
  const tasks = inboxTasks(ctx.snap);
  const drafts = ctx.snap.drafts.filter(d => !['accepted', 'dismissed', 'applied'].includes(d.status));
  const targets = blockList(ctx.snap, ctx.now);
  return h('div.inbox',
    h('section', {'aria-label': 'Inbox', dataset: {drop: 'inbox'}}, sectionHeader('Inbox', plural(tasks.length, 'task')),
      tasks.length ? tasks.map(t => taskRow(ctx, t)) : emptyState('inbox', 'Inbox is clear.', null)),
    h('nav.inbox-targets', {'aria-label': 'Drop on a Block'}, sectionHeader('Drop on a Block'),
      targets.map(({block, tone}) => h('div.target', {dataset: {drop: `block:${block.id}`}, 'data-tone': tone ?? undefined},
        tone ? h('span.area-dot') : icon('stacks', {cls: 'result-icon'}), h('span', block.title)))),
    h('section', {'aria-label': 'Drafts'}, sectionHeader('Drafts', drafts.length ? plural(drafts.length, 'draft') : null),
      drafts.length ? h('div', {style: {display: 'grid', gap: 'var(--s3)'}}, drafts.map(draftCard))
        : emptyState('edit_note', 'No drafts.', 'Captures that need sorting show up here.')));
}
