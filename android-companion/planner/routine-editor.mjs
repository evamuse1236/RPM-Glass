/** The routine editor: name, window, days and ordered steps, in a full-height sheet. Saving and deleting can be undone. */
import {WEEK_ORDER, DAY_NAMES, validateRoutine} from '../body-state.mjs';
import {el, icon, button, iconButton} from './dom.mjs';
import {openSheet, closeSheet, field} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {notice} from './snackbar.mjs';
import {dropIndex, slotOffset} from './task-row.mjs';

const NEW_ROUTINE = {name: '', start: '07:00', end: '07:30', days: [1, 2, 3, 4, 5], steps: []};
let stepSeq = 0;
const stepId = () => `step-${Date.now().toString(36)}-${++stepSeq}`;

function errorLine() {
  const node = el('p', 'sheet-error field-error');
  node.setAttribute('role', 'alert');
  return node;
}

function groupLabel(text) {
  return el('h3', 'field-group-label', text);
}

function dayChip(day, on) {
  const chip = button('', () => chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')),
    'filter-chip choice-chip day-chip');
  chip.dataset.day = String(day);
  chip.setAttribute('aria-pressed', String(on));
  chip.append(icon('check', {cls: 'chip-check'}), el('span', 'chip-label', DAY_NAMES[day]));
  return chip;
}

/** One step: an outlined field and a handle that drags it (arrow keys on the focused handle move it one place). */
function stepEditRow(step, list) {
  const row = el('div', 'step-edit');
  row.dataset.stepId = step.id;
  const wrap = el('label', 'text-field step-field');
  const input = el('textarea');
  input.rows = 1;
  input.value = step.title;
  input.placeholder = ' ';
  input.enterKeyHint = 'done';
  input.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
  input.addEventListener('input', () => { input.value = input.value.replace(/\n/g, ' '); });
  wrap.append(input);
  const handle = iconButton('drag_indicator', 'Move step', null, {cls: 'step-handle'});
  const name = () => input.value.trim() || 'empty step';
  const label = () => {
    const index = [...list.children].indexOf(row) + 1;
    input.setAttribute('aria-label', `Step ${index}`);
    handle.setAttribute('aria-label', `Move ${name()}, step ${index} of ${list.children.length}. Use the arrow keys.`);
  };
  row.__label = label;
  handle.addEventListener('keydown', event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (event.key === 'ArrowUp' && row.previousElementSibling) row.previousElementSibling.before(row);
    else if (event.key === 'ArrowDown' && row.nextElementSibling) row.nextElementSibling.after(row);
    relabel(list);
    handle.focus();
  });
  installDrag(row, handle, list);
  input.addEventListener('input', label);
  row.append(wrap, handle);
  return row;
}

const relabel = list => [...list.children].forEach(row => row.__label?.());

/** Drag by the handle: the row lifts and follows the finger, the rows it passes slide aside, and it settles into its slot. */
function installDrag(row, handle, list) {
  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button > 0) return;
    const peers = [...list.children];
    if (peers.length < 2) return;
    const rests = peers.map(peer => {
      const r = peer.getBoundingClientRect();
      return {top: r.top, bottom: r.bottom};
    });
    const from = peers.indexOf(row);
    drag = {id: event.pointerId, startY: event.clientY, peers, rests, from, to: from,
      gap: rests[from].bottom - rests[from].top, top: rests[from].top, centers: rests.map(r => (r.top + r.bottom) / 2)};
    handle.setPointerCapture?.(event.pointerId);
    list.classList.add('sorting');
    row.classList.add('lifted');
    row.style.setProperty('--drag-y', '0px');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.startY;
    row.style.setProperty('--drag-y', dy + 'px');
    const to = dropIndex(drag.centers, drag.from, drag.top + dy, drag.top + drag.gap + dy);
    if (to === drag.to) return;
    drag.to = to;
    const {from, gap} = drag;
    drag.peers.forEach((peer, i) => {
      if (peer === row) return;
      const by = from < to && i > from && i <= to ? -gap : to < from && i >= to && i < from ? gap : 0;
      peer.style.setProperty('--shift', by + 'px');
    });
  });
  const drop = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const {peers, rests, from, to} = drag;
    drag = null;
    row.classList.add('settling');
    row.style.setProperty('--drag-y', slotOffset(rests, from, to) + 'px');
    setTimeout(() => {
      if (to !== from) {
        if (to < from) peers[to].before(row);
        else peers[to].after(row);
      }
      row.classList.remove('lifted', 'settling');
      row.style.removeProperty('--drag-y');
      list.classList.remove('sorting');
      peers.forEach(peer => peer.style.removeProperty('--shift'));
      relabel(list);
    }, 200);
  };
  handle.addEventListener('pointerup', drop);
  handle.addEventListener('pointercancel', drop);
}

export function openRoutineEditor(app, body, routineId = null) {
  const existing = routineId ? body.routine(routineId) : null;
  const routine = existing ?? NEW_ROUTINE;
  const {body: content, actions, header, sheet} = openSheet(app, existing ? 'Edit routine' : 'New routine', {variant: 'editor'});
  sheet.classList.add('expanded');
  if (existing) {
    const more = iconButton('more_vert', 'More options', () => openMenu(more, [
      {label: 'Delete routine', icon: 'delete', danger: true, onClick: () => body.deleteRoutine(existing.id).then(() => {
        closeSheet(app);
        app.render();
        notice(app, 'Routine deleted', {undo: true});
      }, () => { saveError.textContent = "Couldn't delete. Try again."; })},
    ]));
    header.querySelector('.sheet-close').before(more);
  }

  const name = field(app, content, 'Name', routine.name);
  const nameError = errorLine();
  content.append(nameError);

  content.append(groupLabel('Window'));
  const times = el('div', 'time-pair');
  const start = field(app, times, 'Starts', routine.start, 'time');
  const end = field(app, times, 'Ends', routine.end, 'time');
  const windowError = errorLine();
  content.append(times, windowError);

  content.append(groupLabel('Days'));
  const days = el('div', 'chip-row wrap day-chips');
  days.setAttribute('role', 'group');
  days.setAttribute('aria-label', 'Days');
  for (const day of WEEK_ORDER) days.append(dayChip(day, routine.days.includes(day)));
  const daysError = errorLine();
  content.append(days, daysError);

  content.append(groupLabel('Steps'));
  const list = el('div', 'step-edit-list');
  for (const step of routine.steps) list.append(stepEditRow(step, list));
  const add = el('label', 'step-add');
  const addInput = el('input');
  addInput.type = 'text';
  addInput.placeholder = 'Add a step';
  addInput.setAttribute('aria-label', 'Add a step');
  addInput.enterKeyHint = 'enter';
  add.append(icon('add'), addInput);
  addInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || !addInput.value.trim()) return;
    event.preventDefault();
    list.append(stepEditRow({id: stepId(), title: addInput.value.trim()}, list));
    relabel(list);
    addInput.value = '';
    stepsError.textContent = '';
  });
  const stepsError = errorLine();
  content.append(list, add, stepsError);
  relabel(list);
  const saveError = errorLine();
  content.append(saveError);
  const clearOn = (node, error, event = 'input') => node.addEventListener(event, () => { error.textContent = ''; });
  clearOn(name, nameError);
  clearOn(times, windowError);
  clearOn(days, daysError, 'click');
  clearOn(list, stepsError);

  const read = () => {
    const pending = addInput.value.trim() ? [{id: stepId(), title: addInput.value.trim()}] : [];
    return {
      ...(existing ?? {}),
      name: name.value.trim(), start: start.value, end: end.value,
      days: [...days.querySelectorAll('[aria-pressed=true]')].map(chip => Number(chip.dataset.day)),
      steps: [...[...list.children].map(row => ({id: row.dataset.stepId, title: row.querySelector('textarea').value.trim()})), ...pending]
        .filter(step => step.title),
    };
  };
  actions.append(button('Save routine', async () => {
    const draft = read();
    const errors = validateRoutine(draft);
    nameError.textContent = errors.name ?? '';
    windowError.textContent = errors.window ?? '';
    daysError.textContent = errors.days ?? '';
    stepsError.textContent = errors.steps ?? '';
    saveError.textContent = '';
    name.setAttribute('aria-invalid', String(!!errors.name));
    const first = errors.name ? name : errors.window ? end : errors.days ? days.querySelector('button') : errors.steps ? addInput : null;
    if (first) return first.focus();
    try {
      await body.saveRoutine(draft);
    } catch {
      saveError.textContent = "Couldn't save. Try again.";
      return;
    }
    closeSheet(app);
    app.render();
    notice(app, 'Routine saved', {undo: true});
  }, 'filled-btn'));
  app.sheetRefresh = null;
  if (!existing) name.focus({preventScroll: true});
}
