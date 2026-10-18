/** A Block's one field under its Plan: type to add a new task, or find an Inbox task and pull it in. */
import {blockTasks, localDay} from '../planner-state.mjs';
import {el, icon, iconButton} from './dom.mjs';
import {clock, dayName} from './format.mjs';
import {taskWhen} from './task-row.mjs';
import {landInPlace, waitMotion, DURATION} from '../surface-motion.mjs';
import {persist} from './inline-edit.mjs';

const MAX_MATCHES = 4, RECENT = 3;
const keepCaretInField = event => event.preventDefault();
const words = text => String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Inbox tasks (in no Block, not done) for what is typed: every typed word starts a word of the title, case-blind.
 * Empty words give the newest few. Returns at most `limit` tasks, Plan order kept among matches.
 */
export function inboxMatches(tasks, typed, {limit = MAX_MATCHES} = {}) {
  const open = tasks.filter(t => (t.blockId ?? null) === null && !t.done && !t.archived);
  const query = words(typed);
  if (!query.length) return [...open].sort((a, b) => b.id - a.id).slice(0, RECENT);
  return open.filter(t => {
    const title = words(t.title);
    return query.every(q => title.some(w => w.startsWith(q)));
  }).slice(0, limit);
}

/** The matched start of each word in weight 500, the rest plain. */
function marked(title, typed) {
  const query = words(typed), out = el('span', 'add-result-title');
  for (const part of String(title).split(/([^\p{L}\p{N}]+)/u)) {
    const q = query.find(q => part.toLowerCase().startsWith(q));
    if (q) out.append(el('b', '', part.slice(0, q.length)), part.slice(q.length));
    else out.append(part);
  }
  return out;
}

function meta(task) {
  const when = taskWhen(task);
  if (!when) return 'Inbox';
  const day = dayName(localDay(new Date(when)), {today: true});
  return task.planned && !task.allDay ? `${day} ${clock(when)}` : day;
}

export function blockAdd(app, block) {
  const form = el('form', 'inline-add');
  form.dataset.keep = `plan-add:${block.id}`;
  const listId = `plan-add-results-${block.id}`;
  const input = el('input');
  input.placeholder = 'Add or find a task';
  input.maxLength = 200;
  input.enterKeyHint = 'enter';
  input.autocomplete = 'off';
  input.dataset.editKey = `plan-add:${block.id}`;
  input.setAttribute('aria-label', 'Add a task to the Plan, or find one in the Inbox');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  const submit = iconButton('add', 'Add task to the Plan', () => form.requestSubmit());
  const fold = el('div', 'add-fold');
  const list = el('ul', 'add-results');
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Inbox tasks');
  fold.append(list);
  form.append(submit, input, fold);

  let options = [], active = -1;
  const highlight = index => {
    active = index;
    options.forEach((node, i) => node.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) input.setAttribute('aria-activedescendant', options[index].id);
    else input.removeAttribute('aria-activedescendant');
  };
  const show = open => {
    form.dataset.open = String(open);
    input.setAttribute('aria-expanded', String(open));
  };

  function option(id, leading, label, trailing, choose) {
    const node = el('li', 'add-result');
    node.id = `${listId}-${id}`;
    node.setAttribute('role', 'option');
    node.append(icon(leading, {cls: 'add-result-icon'}), label);
    if (trailing) node.append(el('span', 'add-result-meta tnum', trailing));
    node.addEventListener('pointerdown', keepCaretInField);
    node.addEventListener('click', choose);
    return node;
  }

  function refresh() {
    const typed = input.value;
    const matches = inboxMatches(blockTasks(app.data(), null), typed);
    const nodes = matches.map(task => option(task.id, 'inbox', marked(task.title, typed), meta(task), () => pull(task)));
    if (typed.trim()) {
      const create = option('create', 'keyboard_return', el('span', 'add-result-title', `Create “${typed.trim()}”`), '', () => form.requestSubmit());
      create.classList.add('add-create');
      nodes.push(create);
    }
    list.replaceChildren(...nodes);
    options = nodes;
    highlight(-1);
    const open = nodes.length > 0 && document.activeElement === input;
    show(open);
    if (open) waitMotion(DURATION.short4).then(() => list.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}));
  }

  function foldUntilTyped() {
    show(false);
    options = [];
    highlight(-1);
  }

  async function pull(task) {
    input.value = '';
    refresh();
    landInPlace(node => node.matches('.plan-list > .task-row') && node.querySelector('.task-title')?.textContent === task.title.trim());
    await app.commit({type: 'moveTask', id: task.id, blockId: block.id}, {label: 'Moved into this Block'}).catch(() => {});
    if (input.isConnected) input.focus({preventScroll: true});
  }

  input.addEventListener('focus', refresh);
  input.addEventListener('input', refresh);
  form.addEventListener('focusout', event => { if (!form.contains(event.relatedTarget)) show(false); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      show(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = active + step;
      highlight(next >= options.length ? -1 : next < -1 ? options.length - 1 : next);
      return;
    }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      options[active].click();
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (form.dataset.open === 'true') return show(false);
    input.value = '';
    input.blur();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value;
    if (!title.trim()) return;
    input.value = '';
    foldUntilTyped();
    const typed = title.trim();
    landInPlace(node => node.matches('.plan-list > .task-row') && node.querySelector('.task-title')?.textContent === typed);
    const op = {type: 'saveTask', fields: {title, blockId: block.id}};
    const pending = {op};
    app.pending.push(pending);
    const landing = form.__landing = {};
    form.dataset.steady = 'true';
    waitMotion(DURATION.medium4 * 2).then(() => { if (form.__landing === landing) delete form.dataset.steady; });
    app.render();
    try {
      await persist(app, op, {label: 'Task added', pending, render: false});
    } catch {
      app.pending = app.pending.filter(p => p !== pending);
      app.render();
      if (input.isConnected && !input.value) input.value = title;
    }
  });
  return form;
}
