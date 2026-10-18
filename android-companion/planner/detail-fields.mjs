/** Detail-page fields that edit where they are: the title, Purpose and Notes, each a labelled row. */
import {el, icon, button} from './dom.mjs';
import {inlineText, focusField, selectAll, carryFocus, backHandler, saveEntity} from './inline-edit.mjs';

export const stampOf = (collection, record) => `${collection}:${record.id}:${JSON.stringify(record)}`;

export function factRow(symbol, {onClick = null, cls = ''} = {}) {
  const row = onClick ? button('', onClick, 'fact-row ' + cls) : el('div', 'fact-row ' + cls);
  row.append(typeof symbol === 'string' ? icon(symbol, {cls: 'leading'}) : symbol);
  const copy = el('span', 'list-copy');
  row.append(copy);
  return {row, copy};
}

/** A field's label with a quiet edit glyph beside it (Google Contacts, Calendar): it says the words take a tap, at
 * rest, without outlining them. The glyph goes while the field is being edited. */
function editLabel(text) {
  const label = el('span', 'fact-label');
  const glyph = icon('edit', {cls: 'label-edit'});
  glyph.setAttribute('aria-hidden', 'true');
  label.append(text, glyph);
  return label;
}

/**
 * Purpose as a labelled detail row (Block, Project, Goal, Area) that edits where it is: tap anywhere on the row
 * and the caret lands in the words; Enter or leaving saves, with Undo.
 */
export function purposePanel(app, collection, record, noun = 'Purpose') {
  const {row, copy} = factRow('favorite', {cls: 'purpose-row editable-row'});
  const text = inlineText(app, {key: `${collection}:${record.id}:purpose`, value: record.purpose ?? '', label: noun,
    placeholder: 'Add why this matters to you', multiline: false, maxLength: 2000, cls: 'purpose-text',
    onSave: words => saveEntity(app, collection, record, {purpose: words}, words ? 'Purpose saved' : 'Purpose cleared')});
  copy.append(editLabel(noun), text);
  row.addEventListener('click', event => { if (event.target !== text) focusField(text); });
  row.dataset.keep = 'purpose:' + stampOf(collection, record);
  return row;
}

/** Notes, shown once there are some (or once "Add notes" asks for them); multi-line, saved on leaving. */
export function notesPanel(app, collection, record) {
  const key = `${collection}:${record.id}:notes`;
  if (!record.notes && openNotes !== key) return null;
  const {row, copy} = factRow('notes', {cls: 'notes-row editable-row'});
  const text = inlineText(app, {key, value: record.notes ?? '', label: 'Notes', placeholder: 'Add notes',
    multiline: true, maxLength: 8000, cls: 'notes-text',
    onSave: words => saveEntity(app, collection, record, {notes: words}, words ? 'Notes saved' : 'Notes cleared')});
  text.addEventListener('blur', () => {
    if (!text.textContent.trim() && !record.notes) {
      openNotes = null;
      row.remove();
    }
  });
  copy.append(editLabel('Notes'), text);
  row.addEventListener('click', event => { if (event.target !== text) focusField(text); });
  return row;
}

let openNotes = null;
/** "Add notes" from a detail page's More menu: show the Notes row and put the caret in it. */
export function revealNotes(app, collection, id) {
  openNotes = `${collection}:${id}:notes`;
  app.render();
  focusField(app.dom.work.querySelector(`[data-edit-key="${openNotes}"]`));
}

/** The detail page's large title, edited in place. An empty title is never saved. */
export function titleField(app, collection, record, label) {
  const heading = el('h2', 'detail-title-text');
  heading.append(inlineText(app, {key: `${collection}:${record.id}:title`, value: record.title, label, required: true,
    placeholder: label, cls: 'title-edit', emptyNotice: `A ${label} needs words. Kept “${record.title}”.`,
    onSave: words => saveEntity(app, collection, record, {title: words}, `${label} renamed`)}));
  heading.dataset.keep = 'title:' + stampOf(collection, record);
  return heading;
}

/** Called at the end of every detail render: Back reverts an open edit, and focus survives the re-render. */
export function finishDetail(app, page) {
  backHandler(app);
  carryFocus(page);
  if (pendingTitle) {
    const node = page.querySelector(`[data-edit-key="${pendingTitle}"]`);
    pendingTitle = null;
    if (node) node.dataset.nextKey = node.dataset.editKey.replace(/:title$/, ':purpose');
    selectAll(node);
  }
}

let pendingTitle = null;
/** A newly created Block, Project, Goal or Area opens with its placeholder title selected, ready to be typed over. */
export function focusTitleOnOpen(collection, id) {
  pendingTitle = `${collection}:${id}:title`;
}
