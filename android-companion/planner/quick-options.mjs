import {el, icon, button} from './dom.mjs';
import {duration} from './format.mjs';
import {repeatLabel, foldGroup, foldFor, markChips, chipRow, durationChooser, repeatChooser, alertChooser} from './task-fields.mjs';
import {syncText} from './sheet-parts.mjs';

/** A plain text field on the sheet: its placeholder names it, it grows with the words, and each word is kept. */
function quickField(host, placeholder, name, value, keep) {
  const input = el('textarea', 'quick-field');
  input.rows = 1;
  input.placeholder = placeholder;
  input.value = value ?? '';
  input.setAttribute('aria-label', name);
  // The field grows with its words through CSS field-sizing.
  input.addEventListener('input', () => keep(input.value));
  host.append(input);
  return input;
}

/**
 * More options: one row under the chips. Opened, it gives way to what it held: Estimate, Repeat and Must as chips
 * that carry on the chips above, then the details and the Purpose as plain fields.
 */
export function quickOptions(s, {body, group, target, changed, remember}) {
  const options = foldGroup(body);
  const durationChip = button('', null, 'assist-chip');
  durationChip.append(icon('timer'), el('span', 'chip-label'));
  const mustChip = button('', () => { s.must = !s.must; changed(); }, 'assist-chip must-chip');
  mustChip.append(icon('star'), el('span', 'chip-label', 'Must'));
  const repeatChip = button('', null, 'assist-chip');
  repeatChip.append(icon('repeat'), el('span', 'chip-label'));
  const moreChips = chipRow('quick-row more-chips');
  moreChips.append(durationChip, repeatChip, mustChip);
  const durationFold = foldFor(options, durationChip, inner => durationChooser(inner, {
    get: () => s.minutes,
    pick: minutes => { s.minutes = minutes; options.close(); changed(); },
  }));
  const repeatFold = foldFor(options, repeatChip, inner => repeatChooser(inner, {
    get: () => ({value: s.repeat, every: s.every}),
    pick: (value, every) => {
      Object.assign(s, {repeat: value, every});
      if (value !== 'after') options.close();
      changed();
    },
  }));
  const moreRow = button('', null, 'quick-details');
  moreRow.append(icon('tune'), el('span', 'chip-label', 'More options'), icon('expand_more', {cls: 'quick-details-open'}));
  // Opened, the row stays as the way back.
  moreRow.querySelector('.quick-details-open').before(el('span', 'quick-details-fewer', 'Fewer options'));
  const moreFold = foldFor(group, moreRow, inner => {
    inner.append(moreChips, durationFold.node, repeatFold.node);
    const alertRow = el('div', 'alert-choices');
    alertChooser(alertRow, {get: () => s.alert, pick: value => { s.alert = value; changed(); }});
    inner.append(alertRow);
    const notes = quickField(inner, 'Details', 'Details', s.notes, value => { s.notes = value; remember(); });
    const why = quickField(inner, 'Purpose: why it matters', 'Purpose', s.why, value => { s.why = value; remember(); });
    // A task in a Block takes the Block's Purpose, which the Block chip shows; only an Inbox task has its own.
    const refresh = () => {
      syncText(notes, s.notes);
      syncText(why, s.why);
      why.hidden = !!target();
      alertRow.hidden = !s.time;
      markChips(alertRow, s.alert);
    };
    refresh();
    return refresh;
  });

  // The row gives way to the choices it opened; focus moves to the first of them.
  moreRow.addEventListener('click', () => { if (moreRow.classList.contains('is-open')) durationChip.focus({preventScroll: true}); });

  const paint = () => {
    durationChip.querySelector('.chip-label').textContent = s.minutes == null ? 'Estimate' : duration(s.minutes);
    durationChip.classList.toggle('on', s.minutes != null);
    mustChip.classList.toggle('on', s.must);
    mustChip.setAttribute('aria-pressed', String(s.must));
    mustChip.querySelector('.ms').classList.toggle('fill', s.must);
    const repeat = s.repeat && repeatLabel(s.repeat === 'after' ? {repeatAfterDays: s.every} : {recurrence: s.repeat});
    repeatChip.querySelector('.chip-label').textContent = repeat || 'Repeat';
    repeatChip.classList.toggle('on', !!s.repeat);
    repeatChip.setAttribute('aria-label', repeat ? 'Repeat: ' + repeat : 'Repeat');
    const set = [s.minutes != null && duration(s.minutes), repeat, s.must && 'Must',
      (s.notes || s.why) && 'Details', s.alert !== 'off' && 'Alert'].filter(Boolean).join(', ');
    moreRow.querySelector('.chip-label').textContent = set || 'More options';
    moreRow.setAttribute('aria-label', set ? 'More options: ' + set : 'More options');
    moreRow.classList.toggle('on', !!set);
    options.current?.refresh();
  };

  return {row: moreRow, node: moreFold.node, close: () => options.close(), paint};
}
