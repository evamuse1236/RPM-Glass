// The interaction flows the gauntlet judges, written against the current UI. Each flow is one real job done
// the shortest way the UI allows; `check` reads the saved store to prove the job was done.
// When the UI changes, change the steps here (the job and the check stay), then run:
//   node scripts/gauntlet/flows.mjs <outDir> [port] [flow…]
import {runFlows} from './flows.mjs';

const find = (store, start) => store.entries.find(e => e.title?.startsWith(start) && !e.archived);
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); };
const ok = (cond, what) => (cond ? 'ok' : 'NOT DONE: ' + what);
const sheet = page => page.locator('#sheet');
// The seeded Plan of "RM critical review drafted with my group" ends with this task (see seed.mjs).
const LAST_RM_TASK = 'Submit the critical';

export const flows = {
  'task-date': {
    job: 'From Today, open the task "Group call: merge sections" (today 4:00 PM) and move it to tomorrow at 9:00 AM.',
    async run(h) {
      const {page} = h;
      await h.tap('open task', page.getByText('Group call: merge sections'));
      await h.tap('tomorrow chip on the date row (saved, time chips unfold)', sheet(page).locator('.date-quick').getByRole('button', {name: /^Tomorrow, /}));
      await h.tap('9:00 AM (saved, folds away)', sheet(page).locator('.time-chips').getByRole('button', {name: /^9:00\sAM$/}));
    },
    check: s => { const t = find(s, 'Group call'); return ok(t?.planned && new Date(t.planned).toLocaleDateString('en-CA') === tomorrow() && new Date(t.planned).getHours() === 9, 'planned tomorrow 9:00'); },
  },
  'task-duration-must': {
    job: 'Open the Inbox task "Send the RI budget to Mariyam", give it a 15 minute estimate and make it a Must.',
    async run(h) {
      const {page} = h;
      await h.tap('open inbox', page.getByRole('button', {name: /^Inbox/}));
      await h.tap('open task', sheet(page).getByText('Send the RI budget to Mariyam'));
      await h.tap('15 min chip on the estimate row (saved)', sheet(page).getByRole('button', {name: 'Estimate 15 min', exact: true}));
      await h.tap('must (toggles in place)', sheet(page).getByRole('button', {name: 'Must', exact: true}));
    },
    check: s => { const t = find(s, 'Send the RI budget'); return ok(t?.minutes === 15 && t.must, '15 min and Must'); },
  },
  'task-move': {
    job: 'Open the Inbox task "Ask the group which district we picked" and put it in the Block "District demographic profile ready".',
    async run(h) {
      const {page} = h;
      await h.tap('open inbox', page.getByRole('button', {name: /^Inbox/}));
      await h.tap('open task', sheet(page).getByText('Ask the group which district we picked'));
      await h.tap('suggested Block (one tap)', sheet(page).getByRole('button', {name: /^Suggested Block District demographic profile ready/}));
    },
    check: s => { const t = find(s, 'Ask the group which district'); const b = s.planner.blocks.find(x => x.title.startsWith('District')); return ok(t?.blockId === b?.id, 'in the District Block'); },
  },
  'task-rename-note': {
    job: 'Open "Call home on Sunday" from the Inbox, rename it to "Call home Sunday evening" and add the note "Ask about Diwali plans".',
    async run(h) {
      const {page} = h;
      await h.tap('open inbox', page.getByRole('button', {name: /^Inbox/}));
      await h.tap('open task', sheet(page).getByText('Call home on Sunday'));
      await h.tap('title', sheet(page).getByLabel('Task title'));
      await h.type('rename', sheet(page).getByLabel('Task title'), 'Call home Sunday evening');
      await h.key('next (title saves, caret moves to the details)', 'Enter');
      await h.type('note', sheet(page).getByLabel('Add details'), 'Ask about Diwali plans');
      await h.key('back (note saves, back to the Inbox)', 'Escape');
    },
    check: s => { const t = find(s, 'Call home Sunday evening'); return ok(t?.notes === 'Ask about Diwali plans', 'renamed with the note'); },
  },
  'add-task': {
    job: 'From Today, add "Email the TA about the quiz room" for tomorrow, in the Block "Confident for RM Quiz I".',
    async run(h) {
      const {page} = h;
      await h.tap('add task', page.getByRole('button', {name: 'Add task'}));
      // The words carry the day and the Block: "tomorrow" is read as the date and "#quiz" (one Block matches) chooses
      // the Block; both show under the title with Remove, and the Tomorrow and Block chips are marked, before Add.
      await h.type('title with the day and #Block (both read, shown, removable)', sheet(page).getByLabel('Task'),
        'Email the TA about the quiz room tomorrow #quiz');
      await h.tap('add (adds and closes)', sheet(page).getByRole('button', {name: /^Add$/}));
    },
    check: s => { const t = find(s, 'Email the TA'); const b = s.planner.blocks.find(x => x.title.startsWith('Confident')); return ok(t?.blockId === b?.id && (t.plannedDate === tomorrow() || t.planned?.startsWith?.(tomorrow())), 'tomorrow in the quiz Block'); },
  },
  'swipe-schedule': {
    job: 'From Today, move "Group call: merge sections" (today 4:00 PM) to tomorrow at 9:00 AM, the fastest way.',
    async run(h) {
      const {page} = h;
      const row = page.locator('.task-row', {hasText: 'Group call: merge sections'}).first();
      await row.scrollIntoViewIfNeeded();
      await h.swipe('swipe the row right (Schedule)', row, 150);
      await h.tap('tomorrow morning (saved, with Undo)', page.getByRole('menuitemradio', {name: /^Tomorrow morning/}));
    },
    check: s => { const t = find(s, 'Group call'); return ok(t?.planned && new Date(t.planned).toLocaleDateString('en-CA') === tomorrow() && new Date(t.planned).getHours() === 9, 'planned tomorrow 9:00'); },
  },
  'inbox-back': {
    job: 'Open the Inbox, open "Call home on Sunday", then go Back: you are in the Inbox again, nothing changed.',
    async run(h) {
      const {page} = h;
      await h.tap('open inbox', page.getByRole('button', {name: /^Inbox/}));
      await h.tap('open task', sheet(page).getByText('Call home on Sunday'));
      await h.key('back (returns to the Inbox)', 'Escape');
    },
    check: s => {
      const t = find(s, 'Call home on Sunday');
      return ok(t && !t.blockId && !t.planned && !t.plannedDate && !t.done && !t.notes, 'task unchanged');
    },
  },
  'block-edit': {
    job: 'Open the Block "District demographic profile ready", change its Purpose to "We present real 2021 census data" and add two Plan tasks: "Pick the district" and "Pull the census tables".',
    async run(h) {
      const {page} = h;
      await h.tap('blocks tab', page.getByRole('button', {name: 'Blocks', exact: true}));
      await h.tap('open block', page.getByText('District demographic profile ready').first());
      // Purpose edits where it is: tap the words, type; moving on to "Add a task" saves it (with Undo).
      await h.tap('purpose', page.getByRole('textbox', {name: 'Purpose'}));
      await h.type('purpose', page.getByRole('textbox', {name: 'Purpose'}), 'We present real 2021 census data');
      await h.tap('add a task', page.getByLabel('Add a task to the Plan'));
      await h.type('task 1', page.getByLabel('Add a task to the Plan'), 'Pick the district');
      await h.key('enter', 'Enter');
      await h.type('task 2', page.getByLabel('Add a task to the Plan'), 'Pull the census tables');
      await h.key('enter', 'Enter');
    },
    check: s => { const b = s.planner.blocks.find(x => x.title.startsWith('District')); const n = s.entries.filter(e => e.blockId === b?.id && /Pick the district|Pull the census/.test(e.title)).length; return ok(b?.purpose === 'We present real 2021 census data' && n === 2, 'Purpose and two tasks'); },
  },
  'plan-reorder': {
    job: 'Open the Block "RM critical review drafted with my group" and move the last task in its Plan to the top.',
    reset: {},
    async run(h) {
      const {page} = h;
      await h.tap('blocks tab', page.getByRole('button', {name: 'Blocks', exact: true}));
      await h.tap('open block', page.getByText('RM critical review drafted with my group').first());
      const rows = page.locator('.plan-list > .task-row');
      const count = await rows.count();
      const first = await rows.nth(0).boundingBox();
      const last = await rows.nth(count - 1).boundingBox();
      await h.drag('hold the last task and drag it to the top', rows.nth(count - 1), first.y - last.y - 6);
    },
    check: s => {
      const b = s.planner.blocks.find(x => x.title.startsWith('RM critical review'));
      const open = s.entries.filter(e => e.blockId === b?.id && !e.done && !e.archived).sort((x, y) => x.priority - y.priority);
      return ok(open.length > 1 && open[0].title.startsWith(LAST_RM_TASK), 'last Plan task now first');
    },
  },
  'area-edit': {
    job: 'In Life, open the Area "Health", give it the Purpose "Energy for everything else" and rate it 7.',
    async run(h) {
      const {page} = h;
      await h.tap('life tab', page.getByRole('button', {name: 'Life', exact: true}));
      await h.tap('open area', page.getByRole('button', {name: /^Health, rating/}));
      await h.tap('purpose', page.getByRole('textbox', {name: 'Purpose'}));
      await h.type('purpose', page.getByRole('textbox', {name: 'Purpose'}), 'Energy for everything else');
      await h.key('enter (saves)', 'Enter');
      // The unrated slider is an empty track: touch it in the middle (the handle appears there, at 5) and drag
      // two whole points to the right, to 7 (the 20px handle travels the width less its own size).
      const slider = page.getByRole('slider', {name: /Health rating/});
      const box = await slider.boundingBox();
      await h.swipe('drag the rating to 7', slider, (box.width - 20) * 0.2);
    },
    check: s => { const a = s.planner.areas.find(x => x.title === 'Health'); return ok(a?.purpose === 'Energy for everything else' && a.rating === 7, 'Purpose and rating 7'); },
  },
  'complete-task': {
    job: 'On Today, complete "Finish my section of the critical review" (watch how the row finishes and leaves).',
    settle: 2200,
    async run(h) {
      const {page} = h;
      await h.tap('tick', page.getByRole('checkbox', {name: /Mark Finish my section of the critical review complete/}));
    },
    check: s => ok(find(s, 'Finish my section')?.done, 'completed'),
  },
  'navigate': {
    job: 'Move around: Today to Blocks, open a Block, go back, then open Life (watch the transitions).',
    async run(h) {
      const {page} = h;
      await h.tap('blocks tab', page.getByRole('button', {name: 'Blocks', exact: true}));
      await h.tap('open block', page.getByText('DAD Excel workbook submitted').first());
      await h.tap('back', page.getByRole('button', {name: 'Back'}));
      await h.tap('life tab', page.getByRole('button', {name: 'Life', exact: true}));
    },
  },
  'sheet-motion': {
    job: 'Open a task, open its More menu, close it, close the task; then open the Inbox, open a task from it and go back (watch the sheets).',
    async run(h) {
      const {page} = h;
      await h.tap('open task', page.getByText('Weekly review', {exact: true}));
      await h.tap('more menu', sheet(page).getByRole('button', {name: 'More task options'}));
      await h.key('back (closes the menu)', 'Escape');
      await h.key('back (closes the task)', 'Escape');
      await h.tap('open inbox', page.getByRole('button', {name: /^Inbox/}));
      await h.tap('open task', sheet(page).getByText('Call home on Sunday'));
      await h.key('back (back to the Inbox)', 'Escape');
      await h.key('back (closes the Inbox)', 'Escape');
    },
    check: s => ok(!!find(s, 'Call home on Sunday'), 'nothing changed'),
  },
  'review-steps': {
    job: 'Start the weekly review, go Next, Next, then Back (watch the steps move).',
    async run(h) {
      const {page} = h;
      await h.tap('open review', page.getByRole('button', {name: /isn't planned|review/i}).first());
      await h.tap('next', page.locator('.wr-next'));
      await h.tap('next', page.locator('.wr-next'));
      await h.tap('back', page.locator('.wr-back'));
    },
  },
};

if (import.meta.url === `file://${process.argv[1]}`) await runFlows(flows);
