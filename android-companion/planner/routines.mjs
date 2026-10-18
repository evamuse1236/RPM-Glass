/** Routines on Today (a fixed block in the agenda, or a row in the Body strip) and the run sheet whose steps tick like
 * a Plan. `body` is the store: routines, today's runs and the saves, each of which can be undone. */
import {
  routineOn, routineRowParts, routineProgress, runSummary, missedLine, rangeText, daysText, localDay, markStep, doneAll, skipRest,
} from '../body-state.mjs';
import {el, icon, button, iconButton, progress, emptyState} from './dom.mjs';
import {openSheet, closeSheet} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {notice} from './snackbar.mjs';
import {listRow, phraseNodes} from './today-row.mjs';
import {openRoutineEditor} from './routine-editor.mjs';

/** Today's routines that still show a row (a routine skipped for today has none). */
export function todaysRoutines(body) {
  const now = body.now(), day = localDay(now);
  return body.routines().filter(r => routineOn(r, day)).sort((a, b) => (a.start < b.start ? -1 : 1))
    .map(routine => ({routine, row: routineRowParts(routine, body.runFor(routine.id), now)}))
    .filter(item => item.row);
}

/** Layout "In the day": the routine is a fixed window, drawn as a calendar block in the agenda. */
export function routineBlock(app, body, {routine, row}) {
  const node = button('', () => openRunSheet(app, body, routine.id), 'agenda-event routine-block');
  node.dataset.key = 'routine:' + routine.id;
  const block = el('span', 'event-block');
  const time = el('span', 'event-time tnum');
  const range = {text: rangeText(routine.start, routine.end)};
  const parts = row.state === 'running' || row.state === 'empty' ? row.parts
    : row.state === 'upcoming' ? [range, row.parts[1]] : [range, ...row.parts];
  time.append(...phraseNodes(parts));
  block.append(el('span', 'event-title', routine.name), time);
  node.append(icon('checklist', {fill: !!row.filled, cls: 'leading'}), block);
  node.setAttribute('aria-label', `${routine.name}, ${time.textContent}. Open routine`);
  return node;
}

/** Layout "Body strip": a plain row with Open. */
export function routineRow(app, body, {routine, row}) {
  const open = () => openRunSheet(app, body, routine.id);
  const node = listRow({symbol: 'checklist', headline: routine.name, lines: [phraseNodes(row.parts)], action: 'Open', onAction: open, open});
  node.dataset.key = 'routine:' + routine.id;
  if (row.filled) node.querySelector('.leading').classList.add('fill');
  node.querySelector('.today-row-action').setAttribute('aria-label', `Open ${routine.name}`);
  return node;
}


function stepRow(step, {onCheck, onAction}) {
  const row = el('div', 'task-row step-row');
  row.dataset.stepId = step.id;
  const check = button('', onCheck, 'task-check');
  check.setAttribute('role', 'checkbox');
  const ring = el('span', 'check-ring');
  ring.append(icon('check'));
  check.append(ring);
  const main = el('div', 'task-main');
  main.append(el('span', 'task-title', step.title), el('span', 'task-supporting', 'Skipped'));
  const action = button('', onAction, 'text-btn step-action');
  row.append(check, main, action);
  return row;
}

function paintStep(row, step, state) {
  row.classList.toggle('done', state === 'done');
  row.classList.toggle('skipped', state === 'skipped');
  const check = row.querySelector('.task-check');
  check.setAttribute('aria-checked', String(state === 'done'));
  check.setAttribute('aria-label', state === 'skipped' ? `${step.title}, skipped` : step.title);
  row.querySelector('.task-supporting').hidden = state !== 'skipped';
  const action = row.querySelector('.step-action');
  action.hidden = state === 'done';
  action.textContent = state === 'skipped' ? 'Put back' : 'Skip';
  action.setAttribute('aria-label', `${state === 'skipped' ? 'Put back' : 'Skip'} ${step.title}`);
}

/** Ring fills go one after another, 30ms apart and all within 250ms. */
function stagger(rows) {
  const gap = rows.length > 1 ? Math.min(30, 100 / (rows.length - 1)) : 0;
  rows.forEach((row, i) => row.style.setProperty('--stagger', Math.round(i * gap) + 'ms'));
  setTimeout(() => rows.forEach(row => row.style.removeProperty('--stagger')), 300);
}

export function openRunSheet(app, body, routineId) {
  const routine = body.routine(routineId);
  if (!routine) return;
  const {body: content, actions, header} = openSheet(app, routine.name, {variant: 'run'});
  const titles = el('div', 'sheet-titles');
  const heading = header.querySelector('h2');
  heading.replaceWith(titles);
  const missed = el('p', 'run-missed');
  titles.append(heading, el('p', 'sheet-subtitle tnum', `${rangeText(routine.start, routine.end)} · ${daysText(routine.days)}`), missed);
  const more = iconButton('more_vert', 'More options', () => openMenu(more, [
    {label: 'Edit routine', icon: 'edit', onClick: () => openRoutineEditor(app, body, routine.id)},
    {label: 'Skip today', icon: 'event_busy', onClick: skipToday},
  ]));
  header.querySelector('.sheet-close').before(more);

  let run = body.runFor(routine.id);
  const count = el('p', 'run-count tnum');
  const bar = progress(0, 1, 'Steps done');
  const list = el('div', 'step-list');
  const error = el('p', 'sheet-error');
  error.setAttribute('role', 'alert');
  const rows = new Map();

  async function save(next, staggerIds = []) {
    const before = run;
    run = next;
    paint(staggerIds);
    try {
      await body.saveRun(next);
      error.textContent = '';
      app.render();
    } catch {
      run = before;
      paint();
      error.textContent = "Couldn't save that tick. Try again.";
    }
  }
  const stateOf = step => run?.marks?.[step.id]?.state ?? null;
  const tick = step => save(markStep(routine, run, step.id, stateOf(step) === 'done' ? null : 'done', body.now()));
  const skip = step => save(markStep(routine, run, step.id, stateOf(step) === 'skipped' ? null : 'skipped', body.now()));

  function skipToday() {
    body.skipDay(routine.id).then(() => {
      closeSheet(app);
      app.render();
      notice(app, `${routine.name} skipped for today`, {undo: true});
    }, () => { error.textContent = "Couldn't save that. Try again."; });
  }

  function paintFooter() {
    const {open, total} = routineProgress(routine, run);
    if (!total) return actions.replaceChildren();
    if (!open) {
      if (actions.querySelector('.run-close')) return;
      return actions.replaceChildren(button('Close', () => closeSheet(app), 'filled-btn run-close'));
    }
    if (actions.querySelector('.run-done-all')) return;
    actions.replaceChildren(
      button('Skip the rest', () => save(skipRest(routine, run, body.now())), 'text-btn'),
      button('Done all', () => {
        const opened = routine.steps.filter(step => !stateOf(step)).map(step => step.id);
        save(doneAll(routine, run, body.now()), opened);
      }, 'filled-btn run-done-all'),
    );
  }

  function paint(staggerIds = []) {
    const p = routineProgress(routine, run);
    count.textContent = runSummary(routine, run);
    const percent = p.total ? Math.round(p.done / p.total * 100) : 0;
    bar.firstChild.style.setProperty('--value', String(percent / 100));
    bar.setAttribute('aria-valuenow', String(percent));
    missed.textContent = missedLine(routine, run, body.now()) ?? '';
    stagger(staggerIds.map(id => rows.get(id)).filter(Boolean));
    for (const step of routine.steps) paintStep(rows.get(step.id), step, stateOf(step));
    paintFooter();
  }

  if (!routine.steps.length) {
    content.append(emptyState({symbol: 'checklist', title: 'No steps yet',
      action: () => openRoutineEditor(app, body, routine.id), label: 'Edit routine'}));
    missed.textContent = missedLine(routine, run, body.now()) ?? '';
    app.sheetRefresh = null;
    return;
  }
  for (const step of routine.steps) {
    const row = stepRow(step, {onCheck: () => tick(step), onAction: () => skip(step)});
    rows.set(step.id, row);
    list.append(row);
  }
  content.append(count, bar, list, error);
  paint();
  app.sheetRefresh = () => {
    run = body.runFor(routine.id);
    paint();
  };
}
