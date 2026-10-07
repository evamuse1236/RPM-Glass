/** Create and edit Blocks, Projects, Areas and Goals; the reviewed life context; detail overflow menus. */
import {el, button} from './dom.mjs';
import {openSheet, field, select, checkbox} from './sheet.mjs';
import {blockMenu, revealNotes, focusTitleOnOpen} from './blocks.mjs';
import {persist} from './inline-edit.mjs';
import {userMessage} from '../user-message.mjs';

export const NAMES = {projects: 'Project', blocks: 'Block', areas: 'Area', goals: 'Goal'};
/** Draft slot names stay stable so drafts saved by earlier versions (and Capture seeds) restore. */
const KEYS = {title: 'Title', purpose: 'Purpose · why this matters', notes: 'Notes'};

function goalFields(app, body, record) {
  const {state} = app;
  const year = field(app, body, 'Year', record.year ?? state.year, 'number');
  year.min = 2000;
  year.max = 2200;
  const area = select(app, body, 'Area', record.areaId ?? state.lifeFilter,
    [['', 'No area'], ...app.p().areas.map(a => [a.id, a.title])]);
  const defaultHorizon = record.horizon ?? (record.id ? 'yearly' : state.horizon === 'values' ? 'yearly' : state.horizon);
  const horizon = select(app, body, 'Horizon', defaultHorizon,
    [['yearly', 'Yearly vision'], ['quarterly', 'Quarterly focus'], ['monthly', 'Monthly']]);
  const fallback = () => (horizon.value === 'quarterly' ? Math.ceil(state.period / 3) : state.period);
  const period = select(app, body, 'Period', String(record.period ?? fallback()), []);
  const fill = initial => {
    const current = initial ? (app.sheet.draftValues.Period ?? record.period ?? fallback()) : Number(period.value) || 1;
    period.replaceChildren();
    const count = horizon.value === 'quarterly' ? 4 : 12;
    for (let i = 1; i <= count; i++) {
      const name = horizon.value === 'quarterly' ? 'Quarter ' + i
        : new Date(2000, i - 1).toLocaleDateString([], {month: 'long'});
      const option = el('option', '', name);
      option.value = String(i);
      period.append(option);
    }
    period.value = String(Math.min(count, current));
    period.parentElement.hidden = horizon.value === 'yearly';
  };
  fill(true);
  horizon.addEventListener('change', () => fill(false));
  return fields => {
    fields.areaId = area.value || null;
    fields.year = Number(year.value);
    fields.horizon = horizon.value;
    fields.period = horizon.value === 'yearly' ? null : Number(period.value);
  };
}

function removeControl(app, body, collection, id) {
  const name = NAMES[collection];
  return button('Remove ' + name, () => {
    if (body.querySelector('.remove-confirm')) return;
    const confirm = el('div', 'banner warning remove-confirm');
    confirm.append(el('span', '', `Remove this ${name}? Its contents stay, unassigned. You can undo.`),
      button('Keep', () => confirm.remove(), 'text-btn'),
      button('Remove', () => app.commit({type: 'removeEntity', collection, id}, {label: name + ' removed'})
        .then(() => { if (app.current()?.id === id) app.back(); }).catch(() => {}), 'text-btn danger'));
    body.append(confirm);
    confirm.scrollIntoView({block: 'nearest'});
  }, 'text-btn danger');
}

const UNTITLED = {blocks: 'New Result', projects: 'New Project', areas: 'New Area', goals: 'New Goal'};

/** The fields a new record starts with: its context (the Project page it came from, the Life period on screen). */
export function newFields(collection, defaults, state, current = null) {
  const fields = {title: UNTITLED[collection], purpose: '', notes: ''};
  if (collection === 'blocks') {
    fields.projectId = defaults.projectId ?? (current?.kind === 'projects' ? current.id : current ? null : state.blockFilter ?? null);
  }
  if (collection === 'projects') fields.goalId = defaults.goalId ?? null;
  if (collection === 'goals') {
    const horizon = defaults.horizon ?? (state.horizon === 'values' ? 'yearly' : state.horizon);
    fields.areaId = defaults.areaId ?? state.lifeFilter ?? null;
    fields.year = defaults.year ?? state.year;
    fields.horizon = horizon;
    fields.period = horizon === 'yearly' ? null : horizon === 'quarterly' ? Math.ceil(state.period / 3) : state.period;
  }
  return fields;
}

/**
 * New Block, Project, Goal or Area: made at once and opened on its own page with the placeholder title selected,
 * so typing names it and everything else edits in place from birth (Things-style). Creating it offers Undo.
 */
export async function createInPlace(app, collection, defaults = {}) {
  try {
    const id = await persist(app, {type: 'saveEntity', collection, id: null,
      fields: newFields(collection, defaults, app.state, app.current())}, {label: NAMES[collection] + ' created'});
    if (!id) return;
    focusTitleOnOpen(collection, id);
    if (collection === 'blocks') app.openBlock(id);
    else app.push(collection, id);
  } catch {}
}

/** draftMeta: {key, sourceRaw} for a Goal drafted by Capture; its original words stay visible. */
export function entityEditor(app, collection, id = null, defaults = {}, draftMeta = null) {
  // Only a Capture draft (with its original words to review) still uses the form; everything else is in place.
  if (!id && !draftMeta) return createInPlace(app, collection, defaults);
  const record = id ? app.p()[collection].find(item => item.id === id) : defaults;
  if (!record) return;
  const seed = draftMeta ? {
    [KEYS.title]: record.title ?? '', [KEYS.purpose]: record.purpose ?? '', Year: String(record.year ?? app.state.year),
    Area: record.areaId == null ? '' : String(record.areaId), Horizon: record.horizon ?? 'yearly',
    Period: record.period == null ? '' : String(record.period), [KEYS.notes]: record.notes ?? '',
    __sourceRaw: draftMeta.sourceRaw,
  } : null;
  const title = (id ? 'Edit ' : 'New ') + NAMES[collection];
  const {body, actions} = openSheet(app, title, {draftKey: draftMeta?.key ?? collection + ':' + (id ?? 'new'),
    seed, variant: 'form'});
  const longTitle = draftMeta && collection === 'goals';
  const name = field(app, body, collection === 'blocks' ? 'Result' : 'Title', record.title, longTitle ? 'textarea' : 'text',
    {key: collection === 'blocks' ? 'Result' : KEYS.title, helper: collection === 'blocks' ? 'What you want to be true' : ''});
  const purpose = field(app, body, 'Purpose', record.purpose, 'textarea',
    {key: KEYS.purpose, helper: 'Why this matters to you'});
  let parent = null;
  let rating = null;
  let readGoal = null;
  if (collection === 'blocks') {
    const fallback = app.current()?.kind === 'projects' ? app.current().id : null;
    parent = select(app, body, 'Project', record.projectId ?? fallback,
      [['', 'No project'], ...app.p().projects.map(pr => [pr.id, pr.title])]);
  }
  if (collection === 'projects') {
    parent = select(app, body, 'Goal', record.goalId, [['', 'No goal'], ...app.p().goals.map(g => [g.id, `${g.year} · ${g.title}`])]);
  }
  if (collection === 'areas') {
    rating = field(app, body, 'Your rating, 0 to 10 (optional)', record.rating ?? '', 'number',
      {key: 'Your rating · 0 to 10, optional', helper: 'Your own reflection, independent of task completion'});
    rating.min = '0';
    rating.max = '10';
    rating.step = '0.5';
  }
  if (collection === 'goals') readGoal = goalFields(app, body, record);
  const notes = field(app, body, 'Notes', record.notes, 'textarea', {key: KEYS.notes});
  if (draftMeta) {
    const source = el('details', 'original-capture');
    source.open = true;
    source.append(el('summary', '', 'Original capture'), el('p', '', app.sheet.draftValues.__sourceRaw ?? draftMeta.sourceRaw));
    body.append(source);
  }
  const error = el('p', 'sheet-error');
  error.setAttribute('role', 'alert');
  body.append(error);
  if (id) body.append(removeControl(app, body, collection, id));

  const save = button('Save', async () => {
    try {
      const fields = {title: name.value, purpose: purpose.value, notes: notes.value};
      if (collection === 'blocks') fields.projectId = parent.value || null;
      if (collection === 'projects') fields.goalId = parent.value || null;
      if (collection === 'areas') fields.rating = rating.value === '' ? null : Number(rating.value);
      if (readGoal) readGoal(fields);
      const saved = await app.commit({type: 'saveEntity', collection, id, fields},
        {label: `${NAMES[collection]} ${id ? 'saved' : 'created'}`});
      if (collection === 'goals') {
        app.state.year = fields.year;
        app.state.horizon = fields.horizon;
        if (fields.horizon !== 'yearly') {
          app.state.period = fields.horizon === 'quarterly' ? (fields.period - 1) * 3 + 1 : fields.period;
        }
        app.render({reset: true});
      }
      if (!id && collection === 'projects' && saved) app.openProject(saved);
      if (!id && collection === 'blocks' && saved && !app.current()) app.openBlock(saved);
    } catch (problem) {
      error.textContent = userMessage(problem);
    }
  }, 'filled-btn');
  actions.append(button('Cancel', () => app.dom.sheet.querySelector('.sheet-close')?.click(), 'text-btn'), save);
}

export function contextEditor(app) {
  const {body, actions} = openSheet(app, 'Vision and values', {draftKey: 'context', variant: 'form'});
  body.append(el('p', 'sheet-note', 'Only reviewed text is used for Purpose and Goal ideas. Sorting does not receive it.'));
  const context = app.p().context;
  const vision = field(app, body, 'Life vision', context.vision, 'textarea');
  const goals = field(app, body, 'Goals and interests', context.goals, 'textarea');
  const values = field(app, body, 'Core values', context.coreValues, 'textarea');
  const approved = checkbox(app, body, 'I reviewed this context; use it for suggestions', context.approved);
  body.append(el('p', 'sheet-error'));
  actions.append(button('Save', () => app.commit({type: 'context', vision: vision.value, goals: goals.value,
    coreValues: values.value, approved: approved.checked}, {label: 'Context saved'}).catch(() => {}), 'filled-btn'));
}

function deleteEntity(app, kind, id) {
  const name = NAMES[kind];
  const {body, actions} = openSheet(app, `Delete ${name}?`, {variant: 'dialog'});
  body.append(el('p', 'sheet-note', 'Linked content is kept. You can undo this change.'));
  actions.append(button('Keep', () => app.closeSheet(), 'text-btn'),
    button('Delete', () => app.commit({type: 'removeEntity', collection: kind, id}, {label: name + ' deleted'})
      .then(() => app.back()).catch(() => {}), 'filled-btn danger'));
}

export function detailMenu(app, top) {
  const record = app.p()[top.kind]?.find(item => item.id === top.id);
  if (!record) return [];
  const items = top.kind === 'blocks' ? blockMenu(app, record)
    : record.notes ? [] : [{label: 'Add notes', icon: 'notes', onClick: () => revealNotes(app, top.kind, top.id)}];
  if (items.length) items.push({divider: true});
  items.push({label: 'Delete', icon: 'delete', danger: true, onClick: () => deleteEntity(app, top.kind, top.id)});
  return items;
}
